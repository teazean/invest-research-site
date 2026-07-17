import path from 'node:path'

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif|svg)$/i
const CSV_EXTENSION = /\.csv$/i
const PDF_EXTENSION = /\.pdf$/i

function isEscaped(source, index) {
  let slashes = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashes += 1
  return slashes % 2 === 1
}

function matchingDelimiter(source, start, open, close) {
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (isEscaped(source, index)) continue
    if (source[index] === open) depth += 1
    if (source[index] !== close) continue
    depth -= 1
    if (depth === 0) return index
  }
  return -1
}

function backtickRun(source, start) {
  let end = start
  while (source[end] === '`') end += 1
  return source.slice(start, end)
}

function parseInlineLink(source, start) {
  const image = source[start] === '!' && source[start + 1] === '['
  const bracketStart = image ? start + 1 : start
  if (source[bracketStart] !== '[' || isEscaped(source, bracketStart)) return null
  const bracketEnd = matchingDelimiter(source, bracketStart, '[', ']')
  if (bracketEnd === -1 || source[bracketEnd + 1] !== '(') return null
  const parenthesisStart = bracketEnd + 1
  const parenthesisEnd = matchingDelimiter(source, parenthesisStart, '(', ')')
  if (parenthesisEnd === -1) return null

  const inner = source.slice(parenthesisStart + 1, parenthesisEnd)
  const leading = inner.length - inner.trimStart().length
  const trailing = inner.length - inner.trimEnd().length
  let targetStart = parenthesisStart + 1 + leading
  let targetEnd = parenthesisEnd - trailing
  let target = source.slice(targetStart, targetEnd)

  if (target.startsWith('<') && target.endsWith('>')) {
    targetStart += 1
    targetEnd -= 1
    target = source.slice(targetStart, targetEnd)
  }

  return {
    start,
    end: parenthesisEnd + 1,
    targetStart,
    targetEnd,
    target,
    image,
    containsImage: !image && source.slice(bracketStart + 1, bracketEnd).trimStart().startsWith('![')
  }
}

function splitTarget(target) {
  const suffixIndex = target.search(/[?#]/)
  return suffixIndex === -1
    ? { path: target, suffix: '' }
    : { path: target.slice(0, suffixIndex), suffix: target.slice(suffixIndex) }
}

function attachmentKind(decodedPath) {
  const segments = decodedPath.split('/')
  if (segments.includes('assets') && IMAGE_EXTENSION.test(decodedPath)) return 'asset'
  if (segments.includes('csv') && CSV_EXTENSION.test(decodedPath)) return 'csv'
  if (segments.includes('reports') && PDF_EXTENSION.test(decodedPath)) return 'report'
  return null
}

function researchTopicRoot(documentPath) {
  const parts = documentPath.split('/')
  const sectionIndex = parts.findIndex(part => part === '公司研究' || part === '产业专题')
  if (sectionIndex === -1 || sectionIndex + 1 >= parts.length) {
    throw new Error(`${documentPath}: attachment is outside the public research roots`)
  }
  return parts.length === sectionIndex + 2
    ? parts.slice(0, sectionIndex + 1).join('/')
    : parts.slice(0, sectionIndex + 2).join('/')
}

function validatePrivateRepository(privateRepository, documentPath) {
  const { repository, ref, serverUrl = 'https://github.com' } = privateRepository ?? {}
  if (!REPOSITORY.test(repository ?? '') || !ref?.trim() || !/^https?:\/\//i.test(serverUrl)) {
    throw new Error(`${documentPath}: invalid private repository context`)
  }
  return { repository, ref: ref.trim(), serverUrl: serverUrl.replace(/\/$/, '') }
}

export function privateBlobUrl({ documentPath, target, attachmentPaths, privateRepository }) {
  const { path: rawPath, suffix } = splitTarget(target)
  if (!rawPath || rawPath.startsWith('/') || rawPath.startsWith('#') || rawPath.startsWith('//') || URL_SCHEME.test(rawPath)) {
    return null
  }

  let decodedPath
  try {
    decodedPath = decodeURIComponent(rawPath)
  } catch {
    throw new Error(`${documentPath}: malformed attachment encoding in ${target}`)
  }
  if (decodedPath.includes('\\')) {
    throw new Error(`${documentPath}: attachment paths must use forward slashes: ${target}`)
  }

  const kind = attachmentKind(decodedPath)
  if (!kind) return null

  const topicRoot = researchTopicRoot(documentPath)
  const resolvedPath = path.posix.normalize(path.posix.join(path.posix.dirname(documentPath), decodedPath))
  const topicRelative = path.posix.relative(topicRoot, resolvedPath)
  if (!topicRelative || topicRelative === '..' || topicRelative.startsWith('../') || path.posix.isAbsolute(topicRelative)) {
    throw new Error(`${documentPath}: attachment path escapes its research topic: ${target}`)
  }
  if (!attachmentPaths?.has(resolvedPath)) {
    throw new Error(`${documentPath}: attachment target does not exist: ${target}`)
  }

  const { repository, ref, serverUrl } = validatePrivateRepository(privateRepository, documentPath)
  const encodedPath = resolvedPath.split('/').map(encodeURIComponent).join('/')
  const url = `${serverUrl}/${repository}/blob/${encodeURIComponent(ref)}/${encodedPath}${suffix}`
  return { url, resolvedPath, suffix, kind }
}

function rewriteLine(line, options, rewrites) {
  let output = ''
  let cursor = 0
  let index = 0

  while (index < line.length) {
    if (line[index] === '`' && !isEscaped(line, index)) {
      const delimiter = backtickRun(line, index)
      const end = line.indexOf(delimiter, index + delimiter.length)
      index = end === -1 ? line.length : end + delimiter.length
      continue
    }

    const candidate = parseInlineLink(line, index)
    if (!candidate) {
      index += 1
      continue
    }

    const attachment = privateBlobUrl({
      documentPath: options.documentPath,
      target: candidate.target,
      attachmentPaths: options.attachmentPaths,
      privateRepository: options.privateRepository
    })

    if (attachment) {
      const original = line.slice(candidate.start, candidate.end)
      const replacement = candidate.image
        ? `[${original}](${attachment.url})`
        : line.slice(candidate.start, candidate.targetStart) + attachment.url + line.slice(candidate.targetEnd, candidate.end)
      output += line.slice(cursor, candidate.start) + replacement
      cursor = candidate.end
      rewrites.push({
        document: options.documentPath,
        from: candidate.target,
        to: attachment.url,
        kind: attachment.kind
      })
    }

    index = candidate.end
  }

  return output + line.slice(cursor)
}

export function rewriteAttachmentLinks(markdown, options) {
  const parts = markdown.split(/(\r?\n)/)
  const rewrites = []
  let fence = null

  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index]
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (!fence) fence = { character: marker[0], length: marker.length }
      else if (marker[0] === fence.character && marker.length >= fence.length) fence = null
      continue
    }
    if (!fence) parts[index] = rewriteLine(line, options, rewrites)
  }

  return { markdown: parts.join(''), rewrites }
}
