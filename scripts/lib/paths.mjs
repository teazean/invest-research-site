const MARKDOWN_EXTENSION = /\.md$/i
const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|svg)$/i
const CSV_EXTENSION = /\.csv$/i

export function normalizeRelativePath(relativePath) {
  return relativePath.split('\\').join('/').replace(/^\.\//, '')
}

export function classifyPublicationPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  const parts = normalized.split('/')
  const allowedRoot = normalized.startsWith('投资研究/公司研究/') ||
    normalized.startsWith('投资研究/产业专题/')

  if (!allowedRoot || parts.some(part => part.startsWith('.') || part === '..')) return null
  if (normalized.includes('/reports/') || normalized.includes('/data/')) return null
  if (MARKDOWN_EXTENSION.test(normalized)) return 'markdown'
  if (normalized.includes('/assets/') && IMAGE_EXTENSION.test(normalized)) return 'asset'
  if (normalized.includes('/csv/') && CSV_EXTENSION.test(normalized)) return 'csv'
  return null
}
