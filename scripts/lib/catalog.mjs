import path from 'node:path'
import { readdir, readFile } from 'node:fs/promises'

const ROLE_ORDER = ['overview', 'financials', 'valuation', 'competitors', 'review', 'other']

function inferRole(fileName) {
  if (fileName.includes('公司调研')) return 'overview'
  if (fileName.includes('财务报表')) return 'financials'
  if (fileName.includes('股价预期') || fileName.includes('估值')) return 'valuation'
  if (fileName.includes('竞对')) return 'competitors'
  if (fileName.includes('审核')) return 'review'
  return 'other'
}

function extractSummary(markdown) {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex(line => /^>\s*\*\*先说结论\*\*\s*$/.test(line))
  if (start === -1) return ''
  const summary = []
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('>')) break
    const text = line.replace(/^>\s?/, '').trimEnd()
    if (/^\*\*[^*]+\*\*$/.test(text)) break
    if (text) summary.push(text)
  }
  return summary.join('\n')
}

function linkFor(relativePath) {
  return `/${relativePath.replace(/\.md$/i, '').replaceAll(' ', '%20')}`
}

export function parseResearchDocument(markdown, relativePath) {
  const normalizedPath = relativePath.split('\\').join('/')
  const parts = normalizedPath.split('/')
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? path.basename(normalizedPath, '.md')
  const companyIndex = parts.indexOf('公司研究')
  const industryIndex = parts.indexOf('产业专题')
  const companyFolder = companyIndex === -1 ? null : parts[companyIndex + 1]
  const isIndustryRootDocument = industryIndex !== -1 && industryIndex + 2 === parts.length
  const industryFolder = industryIndex === -1
    ? null
    : isIndustryRootDocument ? '综合产业研究' : parts[industryIndex + 1]
  const companyMatch = companyFolder?.match(/^(.+?)（([A-Za-z0-9.]+)）调研$/)
  const dataDate = markdown.match(/(?:数据核验日|数据日期)[:：]\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  const headings = [...markdown.matchAll(/^#{2,6}\s+(.+)$/gm)].map(match => match[1].trim())
  const fileName = path.basename(normalizedPath, '.md')

  return {
    title,
    relativePath: normalizedPath,
    link: linkFor(normalizedPath),
    kind: companyIndex === -1 ? 'industry' : 'company',
    company: companyMatch?.[1] ?? null,
    ticker: companyMatch?.[2] ?? null,
    topic: industryFolder ?? companyFolder,
    folder: industryFolder ?? companyFolder,
    dataDate,
    summary: extractSummary(markdown),
    headings,
    role: inferRole(fileName)
  }
}

export function buildCatalog(documents) {
  const companyGroups = new Map()
  const industryGroups = new Map()

  for (const document of documents) {
    const groups = document.kind === 'company' ? companyGroups : industryGroups
    const key = document.folder
    const group = groups.get(key) ?? []
    group.push(document)
    groups.set(key, group)
  }

  const companies = [...companyGroups.entries()].map(([folder, groupDocuments]) => {
    const sortedDocuments = [...groupDocuments].sort((left, right) => {
      const roleDifference = ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role)
      return roleDifference || left.title.localeCompare(right.title, 'zh-CN')
    })
    const overview = sortedDocuments.find(document => document.role === 'overview') ?? sortedDocuments[0]
    return {
      name: overview.company ?? folder,
      ticker: overview.ticker,
      folder,
      summary: overview.summary,
      dataDate: overview.dataDate,
      documents: sortedDocuments,
      catalogLink: `/catalog/公司研究/${folder.replaceAll(' ', '%20')}/`
    }
  }).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))

  const industries = [...industryGroups.entries()].map(([folder, groupDocuments]) => ({
    name: folder,
    folder,
    documents: [...groupDocuments].sort((left, right) => left.title.localeCompare(right.title, 'zh-CN')),
    catalogLink: `/catalog/产业专题/${folder.replaceAll(' ', '%20')}/`
  })).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))

  return { companies, industries, documents }
}

async function findMarkdown(root, current = root, output = []) {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    const target = path.join(current, entry.name)
    if (entry.isDirectory()) await findMarkdown(root, target, output)
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(target)
  }
  return output
}

export async function loadCatalogFromSite(siteRoot) {
  const researchRoot = path.join(siteRoot, 'research')
  const files = await findMarkdown(researchRoot)
  const documents = await Promise.all(files.sort().map(async file => {
    const relativePath = path.relative(siteRoot, file).split(path.sep).join('/')
    return parseResearchDocument(await readFile(file, 'utf8'), relativePath)
  }))
  return buildCatalog(documents)
}
