import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sha256 } from './files.mjs'
import { assertCanonicalEqual, canonicalizeMarkdown } from './integrity.mjs'

async function walkFiles(root, current = root, output = []) {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    const target = path.join(current, entry.name)
    if (entry.isDirectory()) await walkFiles(root, target, output)
    else if (entry.isFile()) output.push(path.relative(path.dirname(root), target).split(path.sep).join('/'))
  }
  return output
}

export async function createIntegrityManifest({ syncResult, siteRoot }) {
  const files = []
  for (const file of syncResult.files) {
    const entry = {
      sourceRelativePath: file.relativePath,
      publicPath: file.publicPath,
      kind: file.kind,
      sourceSize: file.size,
      publicSize: file.publicSize,
      sourceSha256: file.sourceSha256,
      publicSha256: file.publicSha256
    }

    if (file.kind === 'markdown') {
      const sourceMarkdown = await readFile(file.sourcePath, 'utf8')
      const publicMarkdown = await readFile(path.join(siteRoot, file.publicPath), 'utf8')
      const sourceCanonical = canonicalizeMarkdown(sourceMarkdown)
      const publicCanonical = canonicalizeMarkdown(publicMarkdown)
      assertCanonicalEqual(sourceCanonical, publicCanonical, file.relativePath)
      entry.semanticSha256 = sourceCanonical.semanticSha256
      entry.tableDimensions = sourceCanonical.tables.map(table => ({
        rows: table.length,
        columns: table.reduce((maximum, row) => Math.max(maximum, row.length), 0)
      }))
      entry.numericTokenCount = sourceCanonical.numericTokens.length
    } else if (file.sourceSha256 !== file.publicSha256 || file.size !== file.publicSize) {
      throw new Error(`${file.relativePath}: binary/CSV copy differs from source`)
    }
    files.push(entry)
  }

  const manifest = {
    version: 2,
    privateRepository: syncResult.privateRepository ?? null,
    rewrites: syncResult.rewrites,
    files: files.sort((left, right) => left.publicPath.localeCompare(right.publicPath))
  }
  await mkdir(path.join(siteRoot, 'public'), { recursive: true })
  await writeFile(path.join(siteRoot, 'public/research-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export async function validatePublicContent({ siteRoot }) {
  const manifestPath = path.join(siteRoot, 'public/research-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const actualFiles = (await walkFiles(path.join(siteRoot, 'research'))).sort()
  const expectedFiles = manifest.files.map(file => file.publicPath).sort()
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('public research file list differs from integrity manifest')
  }

  for (const entry of manifest.files) {
    const target = path.join(siteRoot, entry.publicPath)
    const content = await readFile(target)
    const fileStat = await stat(target)
    if (fileStat.size !== entry.publicSize) throw new Error(`${entry.publicPath}: size mismatch`)
    if (sha256(content) !== entry.publicSha256) throw new Error(`${entry.publicPath}: SHA-256 mismatch`)
    if (entry.kind === 'markdown') {
      const canonical = canonicalizeMarkdown(content.toString('utf8'))
      if (canonical.semanticSha256 !== entry.semanticSha256) {
        throw new Error(`${entry.publicPath}: semantic SHA-256 mismatch`)
      }
    }
  }
  return { files: manifest.files.length }
}
