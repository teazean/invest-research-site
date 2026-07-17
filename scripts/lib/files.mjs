import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { classifyAttachmentPath, classifyPublicationPath, normalizeRelativePath } from './paths.mjs'

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function walk(root, current, visit) {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const absolutePath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      await walk(root, absolutePath, visit)
      continue
    }
    if (!entry.isFile()) continue

    const relativePath = normalizeRelativePath(path.relative(root, absolutePath))
    await visit({ absolutePath, relativePath })
  }
}

export async function discoverPublicationFiles(sourceRoot) {
  const output = []
  await walk(sourceRoot, sourceRoot, async ({ absolutePath, relativePath }) => {
    const kind = classifyPublicationPath(relativePath)
    if (!kind) return
    const content = await readFile(absolutePath)
    const fileStat = await stat(absolutePath)
    output.push({
      sourcePath: absolutePath,
      relativePath,
      kind,
      size: fileStat.size,
      sourceSha256: sha256(content)
    })
  })
  return output.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

export async function discoverAttachmentPaths(sourceRoot) {
  const output = []
  await walk(sourceRoot, sourceRoot, async ({ relativePath }) => {
    if (classifyAttachmentPath(relativePath)) output.push(relativePath)
  })
  return new Set(output.sort((left, right) => left.localeCompare(right)))
}
