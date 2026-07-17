import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { rewriteAttachmentLinks } from './attachment-links.mjs'
import { discoverAttachmentPaths, discoverPublicationFiles, sha256 } from './files.mjs'
import { validateMarkdownSecurity } from './security.mjs'

function publicRelativePath(relativePath) {
  return relativePath.replace(/^投资研究\//, '')
}

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

async function replaceDirectoryAtomically(stagedRoot, liveRoot) {
  const backupRoot = `${liveRoot}.backup-${process.pid}-${Date.now()}`
  const hadLiveRoot = await exists(liveRoot)
  if (hadLiveRoot) await rename(liveRoot, backupRoot)
  try {
    await rename(stagedRoot, liveRoot)
    if (hadLiveRoot) await rm(backupRoot, { recursive: true, force: true })
  } catch (error) {
    if (await exists(liveRoot)) await rm(liveRoot, { recursive: true, force: true })
    if (hadLiveRoot && await exists(backupRoot)) await rename(backupRoot, liveRoot)
    throw error
  }
}

export async function syncResearch({ sourceRoot, siteRoot, privateRepository }) {
  const files = await discoverPublicationFiles(sourceRoot)
  const attachmentPaths = await discoverAttachmentPaths(sourceRoot)

  for (const file of files.filter(file => file.kind === 'markdown')) {
    const content = await readFile(file.sourcePath, 'utf8')
    validateMarkdownSecurity(content, file.relativePath)
  }
  const stagedRoot = path.join(siteRoot, `.research-staged-${process.pid}-${Date.now()}`)
  const liveRoot = path.join(siteRoot, 'research')
  const rewrites = []
  const publishedFiles = []

  await mkdir(stagedRoot, { recursive: true })
  try {
    for (const file of files) {
      const relativeOutput = publicRelativePath(file.relativePath)
      const destination = path.join(stagedRoot, relativeOutput)
      await mkdir(path.dirname(destination), { recursive: true })
      const sourceBuffer = await readFile(file.sourcePath)
      let publicBuffer = sourceBuffer

      if (file.kind === 'markdown') {
        const rewritten = rewriteAttachmentLinks(
          sourceBuffer.toString('utf8'),
          {
            documentPath: file.relativePath,
            attachmentPaths,
            privateRepository
          }
        )
        publicBuffer = Buffer.from(rewritten.markdown)
        rewrites.push(...rewritten.rewrites)
      }

      await writeFile(destination, publicBuffer)
      publishedFiles.push({
        ...file,
        publicPath: `research/${relativeOutput}`,
        publicSize: publicBuffer.byteLength,
        publicSha256: sha256(publicBuffer)
      })
    }
    await replaceDirectoryAtomically(stagedRoot, liveRoot)
  } catch (error) {
    await rm(stagedRoot, { recursive: true, force: true })
    throw error
  }

  return {
    files: publishedFiles,
    rewrites,
    sourceRoot,
    privateRepository: privateRepository ?? null,
    generatedAt: new Date().toISOString()
  }
}
