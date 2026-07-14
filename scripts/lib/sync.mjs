import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { discoverPublicationFiles, sha256 } from './files.mjs'
import { buildReportLinkMap, rewriteReportLinks } from './report-links.mjs'
import { validateMarkdownSecurity } from './security.mjs'

function topicKey(relativePath) {
  return relativePath.split('/').slice(0, 3).join('/')
}

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

export async function syncResearch({ sourceRoot, siteRoot }) {
  const files = await discoverPublicationFiles(sourceRoot)
  const markdownByTopic = new Map()

  for (const file of files.filter(file => file.kind === 'markdown')) {
    const content = await readFile(file.sourcePath, 'utf8')
    validateMarkdownSecurity(content, file.relativePath)
    const key = topicKey(file.relativePath)
    const topicFiles = markdownByTopic.get(key) ?? []
    topicFiles.push({ path: file.relativePath, content })
    markdownByTopic.set(key, topicFiles)
  }

  const reportMaps = new Map(
    [...markdownByTopic.entries()].map(([key, markdownFiles]) => [key, buildReportLinkMap(markdownFiles)])
  )
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
        const rewritten = rewriteReportLinks(
          sourceBuffer.toString('utf8'),
          reportMaps.get(topicKey(file.relativePath)) ?? new Map(),
          file.relativePath
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
    generatedAt: new Date().toISOString()
  }
}
