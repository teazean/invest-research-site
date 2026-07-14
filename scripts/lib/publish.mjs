import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildCatalog, parseResearchDocument } from './catalog.mjs'
import { writeGeneratedPages } from './generated-pages.mjs'
import { syncResearch } from './sync.mjs'

export async function publishResearchSite({ sourceRoot, siteRoot }) {
  const syncResult = await syncResearch({ sourceRoot, siteRoot })
  const documents = []

  for (const file of syncResult.files.filter(file => file.kind === 'markdown')) {
    const markdown = await readFile(path.join(siteRoot, file.publicPath), 'utf8')
    documents.push(parseResearchDocument(markdown, file.publicPath))
  }

  const catalog = buildCatalog(documents)
  await writeGeneratedPages({ catalog, siteRoot })
  return { ...syncResult, catalog }
}
