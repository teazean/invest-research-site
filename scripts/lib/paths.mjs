const MARKDOWN_EXTENSION = /\.md$/i
const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|svg)$/i
const CSV_EXTENSION = /\.csv$/i
const PDF_EXTENSION = /\.pdf$/i

export function normalizeRelativePath(relativePath) {
  return relativePath.split('\\').join('/').replace(/^\.\//, '')
}

function allowedResearchPath(normalized) {
  const parts = normalized.split('/')
  const allowedRoot = normalized.startsWith('投资研究/公司研究/') ||
    normalized.startsWith('投资研究/产业专题/')

  return allowedRoot && !parts.some(part => part.startsWith('.') || part === '..')
}

export function classifyAttachmentPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  if (!allowedResearchPath(normalized)) return null
  if (normalized.includes('/assets/') && IMAGE_EXTENSION.test(normalized)) return 'asset'
  if (normalized.includes('/csv/') && CSV_EXTENSION.test(normalized)) return 'csv'
  if (normalized.includes('/reports/') && PDF_EXTENSION.test(normalized)) return 'report'
  return null
}

export function classifyPublicationPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  if (!allowedResearchPath(normalized) || normalized.includes('/data/')) return null
  if (MARKDOWN_EXTENSION.test(normalized)) return 'markdown'
  const attachmentKind = classifyAttachmentPath(normalized)
  return attachmentKind === 'report' ? null : attachmentKind
}
