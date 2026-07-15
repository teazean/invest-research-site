import path from 'node:path'

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g
const LOCAL_REPORT = /^reports\/[^\s)]+\.pdf(?:#[^\s)]*)?$/i
const EXTERNAL_URL = /^https?:\/\//i

function stripFragment(target) {
  return target.split('#')[0]
}

function privateReportUrl({ documentPath, localPath, privateReports }) {
  if (!privateReports) return undefined
  const { repository, ref, serverUrl = 'https://github.com' } = privateReports
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !ref?.trim()) {
    throw new Error(`${documentPath}: invalid private report repository context`)
  }
  if (!documentPath.startsWith('投资研究/公司研究/') && !documentPath.startsWith('投资研究/产业专题/')) {
    throw new Error(`${documentPath}: private report is outside the public research roots`)
  }

  const topicRoot = documentPath.split('/').slice(0, 3).join('/')
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(documentPath), localPath))
  if (!resolved.startsWith(`${topicRoot}/`)) {
    throw new Error(`${documentPath}: private report path escapes its research topic`)
  }
  const encodedPath = resolved.split('/').map(encodeURIComponent).join('/')
  return `${serverUrl.replace(/\/$/, '')}/${repository}/blob/${encodeURIComponent(ref)}/${encodedPath}`
}

export function buildReportLinkMap(markdownFiles) {
  const result = new Map()

  for (const file of markdownFiles) {
    for (const line of file.content.split(/\r?\n/)) {
      const targets = [...line.matchAll(MARKDOWN_LINK)].map(match => match[1])
      const localTargets = targets.filter(target => LOCAL_REPORT.test(target))
      const externalTargets = targets.filter(target => EXTERNAL_URL.test(target))
      if (localTargets.length === 0 || externalTargets.length === 0) continue

      for (const target of localTargets) {
        result.set(stripFragment(target), externalTargets[0])
      }
    }
  }

  return result
}

export function rewriteReportLinks(markdown, linkMap, documentPath, privateReports) {
  const rewrites = []
  const rewritten = markdown.replace(MARKDOWN_LINK, (fullMatch, target) => {
    if (!LOCAL_REPORT.test(target)) return fullMatch
    const fragment = target.includes('#') ? `#${target.split('#').slice(1).join('#')}` : ''
    const localPath = stripFragment(target)
    const replacementBase = linkMap.get(localPath) ?? privateReportUrl({
      documentPath,
      localPath,
      privateReports
    })
    if (!replacementBase) {
      throw new Error(`${documentPath}: missing authoritative report URL for ${localPath}`)
    }
    const replacement = `${replacementBase}${fragment}`
    rewrites.push({ document: documentPath, from: target, to: replacement })
    return fullMatch.replace(`(${target})`, `(${replacement})`)
  })

  return { markdown: rewritten, rewrites }
}
