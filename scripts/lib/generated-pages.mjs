import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

function encodeLink(link) {
  return link.replaceAll(' ', '%20')
}

function documentList(documents) {
  return documents.map(document => `- [${document.title}](${encodeLink(document.link)})`).join('\n')
}

export async function writeGeneratedPages({ catalog, siteRoot }) {
  const catalogRoot = path.join(siteRoot, 'catalog')
  await rm(catalogRoot, { recursive: true, force: true })
  await mkdir(catalogRoot, { recursive: true })

  const home = [
    '# 投资研究',
    '',
    '> 数据和结论均标注核验日期与来源；内容仅用于研究，不构成确定性投资建议。',
    '',
    '## 公司研究',
    '',
    ...catalog.companies.map(company => `- [${company.name}${company.ticker ? `（${company.ticker}）` : ''}](${encodeLink(company.catalogLink ?? `/catalog/公司研究/${company.folder}/`)})${company.dataDate ? ` — 核验日 ${company.dataDate}` : ''}`),
    '',
    '## 产业专题',
    '',
    ...catalog.industries.map(industry => `- [${industry.name}](${encodeLink(industry.catalogLink ?? `/catalog/产业专题/${industry.folder}/`)})`),
    ''
  ].join('\n')
  await writeFile(path.join(siteRoot, 'index.md'), home)

  for (const company of catalog.companies) {
    const directory = path.join(catalogRoot, '公司研究', company.folder)
    await mkdir(directory, { recursive: true })
    const page = [
      `# ${company.name}${company.ticker ? `（${company.ticker}）` : ''}`,
      '',
      company.dataDate ? `> 数据核验日：${company.dataDate}` : '',
      company.summary ? `\n## 速览\n\n${company.summary}` : '',
      '',
      '## 全部研究材料',
      '',
      documentList(company.documents),
      ''
    ].filter(line => line !== '').join('\n')
    await writeFile(path.join(directory, 'index.md'), page)
  }

  for (const industry of catalog.industries) {
    const directory = path.join(catalogRoot, '产业专题', industry.folder)
    await mkdir(directory, { recursive: true })
    const page = [
      `# ${industry.name}`,
      '',
      '## 全部研究材料',
      '',
      documentList(industry.documents),
      ''
    ].join('\n')
    await writeFile(path.join(directory, 'index.md'), page)
  }
}
