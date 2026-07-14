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

export async function finalizeHtmlTree({ distRoot, siteBase }) {
  const htmlPaths = await walkFiles(distRoot, filePath => filePath.endsWith('.html'))
  let htmlFiles = 0
  let imageLinkCount = 0
  for (const htmlPath of htmlPaths) {
    const html = await readFile(htmlPath, 'utf8')
    const $ = load(html)
    const links = imageLinks($, path.relative(distRoot, htmlPath))
    if (links.length === 0) continue
    for (const { anchor, src, index } of links) {
      const target = resolveSiteAssetPath({
        distRoot,
        siteBase,
        assetUrl: src,
        label: `${path.relative(distRoot, htmlPath)}: research image link ${index + 1}`
      })
      await assertRegularFile(target, `${path.relative(distRoot, htmlPath)}: image target`)
      $(anchor).attr('href', src)
    }
    await writeFile(htmlPath, $.html())
    htmlFiles += 1
    imageLinkCount += links.length
  }
  return { htmlFiles, imageLinks: imageLinkCount }
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
  let imageLinkCount = 0
  for (const htmlPath of htmlPaths) {
    const html = await readFile(htmlPath, 'utf8')
    const $ = load(html)
    const documentPath = path.relative(distRoot, htmlPath)
    const links = imageLinks($, documentPath)
    for (const { anchor, src, index } of links) {
      const href = $(anchor).attr('href')
      if (href !== src) {
        throw new Error(`${documentPath}: research image link ${index + 1} href differs from img src`)
      }
      const target = resolveSiteAssetPath({
        distRoot,
        siteBase,
        assetUrl: href,
        label: `${documentPath}: research image link ${index + 1}`
      })
      await assertRegularFile(target, `${documentPath}: image target`)
    }
    imageLinkCount += links.length
  }

  const csvEntries = manifest.files.filter(entry => entry.kind === 'csv')
  for (const entry of csvEntries) {
    const targetPath = resolvePublicPath(distRoot, entry.publicPath, entry.publicPath)
    await verifyBytes(targetPath, entry, `${entry.publicPath}: built CSV`)
  }
  return { imageLinks: imageLinkCount, csvFiles: csvEntries.length }
}

export async function finalizeBuiltSite({ siteRoot, distRoot, siteBase }) {
  const manifest = JSON.parse(await readFile(path.join(siteRoot, 'public/research-manifest.json'), 'utf8'))
  const htmlResult = await finalizeHtmlTree({ distRoot, siteBase })
  const csvFiles = await publishManifestCsv({ siteRoot, distRoot, manifest })
  const verified = await verifyBuiltResearchAssets({ distRoot, manifest, siteBase })
  if (verified.imageLinks !== htmlResult.imageLinks || verified.csvFiles !== csvFiles) {
    throw new Error('built asset counts changed during verification')
  }
  return { ...htmlResult, csvFiles }
}
