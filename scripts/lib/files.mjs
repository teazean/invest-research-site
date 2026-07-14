import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { classifyPublicationPath, normalizeRelativePath } from './paths.mjs'

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function walk(root, current, output) {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const absolutePath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      await walk(root, absolutePath, output)
      continue
    }
    if (!entry.isFile()) continue

    const relativePath = normalizeRelativePath(path.relative(root, absolutePath))
    const kind = classifyPublicationPath(relativePath)
    if (!kind) continue
    const content = await readFile(absolutePath)
    const fileStat = await stat(absolutePath)
    output.push({
      sourcePath: absolutePath,
      relativePath,
      kind,
      size: fileStat.size,
      sourceSha256: sha256(content)
    })
  }
}

export async function discoverPublicationFiles(sourceRoot) {
  const output = []
  await walk(sourceRoot, sourceRoot, output)
  return output.sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0)
}
