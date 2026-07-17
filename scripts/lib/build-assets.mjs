import { load } from 'cheerio'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sha256 } from './files.mjs'

function normalizeSiteBase(siteBase) {
  if (typeof siteBase !== 'string' || !siteBase.startsWith('/')) {
    throw new Error(`site base must start with "/": ${siteBase}`)
  }
  return siteBase.endsWith('/') ? siteBase : `${siteBase}/`
}

function assertContained(root, target, label) {
  const relative = path.relative(root, target)
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return target
  }
  throw new Error(`${label}: path escapes ${root}`)
}

function resolvePublicPath(root, publicPath, label) {
  if (typeof publicPath !== 'string' || publicPath.includes('\\') || !publicPath.startsWith('research/')) {
    throw new Error(`${label}: publicPath must be below research/`)
  }
  return assertContained(path.resolve(root, 'research'), path.resolve(root, publicPath), label)
}

export function resolveSiteAssetPath({ distRoot, siteBase, assetUrl, label = 'asset' }) {
  if (typeof assetUrl !== 'string' || !assetUrl.startsWith('/') || assetUrl.startsWith('//')) {
    throw new Error(`${label}: asset URL must be a root-relative site path`)
  }
  let pathname
  try {
    pathname = decodeURIComponent(new URL(assetUrl, 'https://site.invalid').pathname)
  } catch {
    throw new Error(`${label}: invalid asset URL ${assetUrl}`)
  }
  const base = normalizeSiteBase(siteBase)
  if (!pathname.startsWith(base)) {
    throw new Error(`${label}: asset URL must be below ${base}`)
  }
  const relativePath = pathname.slice(base.length)
  if (!relativePath) throw new Error(`${label}: asset URL has no file path`)
  return assertContained(path.resolve(distRoot), path.resolve(distRoot, relativePath), label)
}

async function walkFiles(root, predicate, current = root, output = []) {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    const target = path.join(current, entry.name)
    if (entry.isDirectory()) await walkFiles(root, predicate, target, output)
    else if (entry.isFile() && predicate(target)) output.push(target)
  }
  return output
}

function imageLinks($, documentPath) {
  return $('.research-image-link').toArray().map((anchor, index) => {
    const images = $(anchor).find('img[src]').toArray()
    if (images.length !== 1) {
      throw new Error(`${documentPath}: research image link ${index + 1} must contain exactly one img[src]`)
    }
    const src = $(images[0]).attr('src')
    if (!src) throw new Error(`${documentPath}: research image link ${index + 1} has an empty img src`)
    return { anchor, src, index }
  })
}

async function assertRegularFile(filePath, label) {
  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    throw new Error(`${label}: target file does not exist`)
  }
  if (!fileStat.isFile()) throw new Error(`${label}: target is not a regular file`)
  return fileStat
}

function privateBlobPrefix(manifest) {
  const { repository, ref, serverUrl = 'https://github.com' } = manifest.privateRepository ?? {}
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') || !ref?.trim() || !/^https?:\/\//i.test(serverUrl)) {
    throw new Error('research manifest has invalid private repository context')
  }
  return `${serverUrl.replace(/\/$/, '')}/${repository}/blob/${encodeURIComponent(ref.trim())}/`
}

function assertPrivateBlobUrl(href, prefix, label) {
  if (typeof href !== 'string' || !href.startsWith(prefix)) {
    throw new Error(`${label}: image link must use private GitHub blob URL`)
  }
}

function clientImageLinks(source, documentPath) {
  const markers = [...source.matchAll(/research-image-link/g)]
  return markers.map((marker, index) => {
    const anchorStart = source.lastIndexOf('<a', marker.index)
    const anchorEnd = source.indexOf('>', marker.index)
    const anchor = anchorStart !== -1 && anchorEnd !== -1 && !source.slice(anchorStart, marker.index).includes('>')
      ? source.slice(anchorStart, anchorEnd + 1)
      : ''
    const htmlHref = anchor.match(/href=\\?["']([^"']+)\\?["']/)
    if (htmlHref) return { href: htmlHref[1], index }

    const start = Math.max(0, marker.index - 4096)
    const end = Math.min(source.length, marker.index + marker[0].length + 4096)
    const before = source.slice(start, marker.index)
    const after = source.slice(marker.index + marker[0].length, end)
    const afterHref = after.match(/href\s*:\s*["']([^"']+)["']/)
    const beforeHrefs = [...before.matchAll(/href\s*:\s*["']([^"']+)["']/g)]
    const href = afterHref?.[1] ?? beforeHrefs.at(-1)?.[1]
    if (!href) {
      throw new Error(`${documentPath}: client image link ${index + 1} has no href`)
    }
    return { href, index }
  })
}

async function verifyBytes(filePath, entry, label) {
  const fileStat = await assertRegularFile(filePath, label)
  if (fileStat.size !== entry.publicSize) {
    throw new Error(`${entry.publicPath}: size mismatch in ${label}`)
  }
  const bytes = await readFile(filePath)
  if (sha256(bytes) !== entry.publicSha256) {
    throw new Error(`${entry.publicPath}: SHA-256 mismatch in ${label}`)
  }
  return bytes
}

export async function publishManifestCsv({ siteRoot, distRoot, manifest }) {
  const csvEntries = manifest.files.filter(entry => entry.kind === 'csv')
  for (const entry of csvEntries) {
    const sourcePath = resolvePublicPath(siteRoot, entry.publicPath, entry.publicPath)
    const targetPath = resolvePublicPath(distRoot, entry.publicPath, entry.publicPath)
    const bytes = await verifyBytes(sourcePath, entry, `${entry.publicPath}: public research source`)
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, bytes)
    await verifyBytes(targetPath, entry, `${entry.publicPath}: built CSV`)
  }
  return csvEntries.length
}

export async function verifyBuiltResearchAssets({ distRoot, manifest, siteBase }) {
  const htmlPaths = await walkFiles(distRoot, filePath => filePath.endsWith('.html'))
  const prefix = privateBlobPrefix(manifest)
  let htmlFiles = 0
  let imageLinkCount = 0
  for (const htmlPath of htmlPaths) {
    const html = await readFile(htmlPath, 'utf8')
    const $ = load(html)
    const documentPath = path.relative(distRoot, htmlPath)
    const links = imageLinks($, documentPath)
    for (const { anchor, src, index } of links) {
      const href = $(anchor).attr('href')
      assertPrivateBlobUrl(href, prefix, `${documentPath}: research image link ${index + 1}`)
      const target = resolveSiteAssetPath({
        distRoot,
        siteBase,
        assetUrl: src,
        label: `${documentPath}: research image link ${index + 1}`
      })
      await assertRegularFile(target, `${documentPath}: image target`)
    }
    if (links.length > 0) htmlFiles += 1
    imageLinkCount += links.length
  }

  const clientPaths = await walkFiles(distRoot, filePath => filePath.endsWith('.js'))
  let clientImageLinkCount = 0
  for (const clientPath of clientPaths) {
    const documentPath = path.relative(distRoot, clientPath)
    const source = await readFile(clientPath, 'utf8')
    const links = clientImageLinks(source, documentPath)
    for (const { href, index } of links) {
      if (!href.startsWith(prefix)) {
        throw new Error(`${documentPath}: client image link ${index + 1}: client image link must use private GitHub blob URL`)
      }
    }
    clientImageLinkCount += links.length
  }

  const csvEntries = manifest.files.filter(entry => entry.kind === 'csv')
  for (const entry of csvEntries) {
    const targetPath = resolvePublicPath(distRoot, entry.publicPath, entry.publicPath)
    await verifyBytes(targetPath, entry, `${entry.publicPath}: built CSV`)
  }
  return {
    htmlFiles,
    imageLinks: imageLinkCount,
    clientImageLinks: clientImageLinkCount,
    csvFiles: csvEntries.length
  }
}

export async function finalizeBuiltSite({ siteRoot, distRoot, siteBase }) {
  const manifest = JSON.parse(await readFile(path.join(siteRoot, 'public/research-manifest.json'), 'utf8'))
  const csvFiles = await publishManifestCsv({ siteRoot, distRoot, manifest })
  const verified = await verifyBuiltResearchAssets({ distRoot, manifest, siteBase })
  if (verified.csvFiles !== csvFiles) {
    throw new Error('built asset counts changed during verification')
  }
  return verified
}
