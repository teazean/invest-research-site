import { load } from 'cheerio'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { verifyBuiltResearchAssets } from './build-assets.mjs'
import { renderMarkdown } from './integrity.mjs'
import { stripFrontmatter } from './security.mjs'

function normalizeText(value) {
  const normalized = value.replace(/\u200B/g, '').replace(/\s+/g, ' ').trim()
  try {
    return decodeURI(normalized)
  } catch {
    return normalized
  }
}

function externalLinkTargets($, root) {
  return root.find('a[href]').toArray()
    .map(anchor => $(anchor).attr('href'))
    .filter(href => /^https?:\/\//i.test(href))
    .map(normalizeText)
}

function tableMatrices($, root) {
  return root.find('table').toArray().map(table => $(table).find('tr').toArray().map(row => (
    $(row).find('th,td').toArray().map(cell => normalizeText($(cell).text()))
  )))
}

function canonicalHtml(html, selector) {
  const $ = load(html)
  const root = selector ? $(selector).first() : $('body')
  root.find('.header-anchor,.copy,.lang').remove()
  return {
    visibleBlocks: root.find('h1,h2,h3,h4,h5,h6,p,li,pre').toArray()
      .filter(element => $(element).parents('table').length === 0)
      .map(element => normalizeText($(element).text())),
    tables: tableMatrices($, root),
    externalLinks: externalLinkTargets($, root)
  }
}

function containsWithMultiplicity(actual, expected) {
  const remaining = [...actual]
  for (const value of expected) {
    const index = remaining.indexOf(value)
    if (index === -1) return false
    remaining.splice(index, 1)
  }
  return true
}

export function verifyRenderedDocument({ markdown, html, documentPath }) {
  const expected = canonicalHtml(renderMarkdown(stripFrontmatter(markdown)))
  const actual = canonicalHtml(html, '.vp-doc')
  if (JSON.stringify(expected.visibleBlocks) !== JSON.stringify(actual.visibleBlocks)) {
    throw new Error(`${documentPath}: rendered visible text differs from public Markdown`)
  }
  if (JSON.stringify(expected.tables) !== JSON.stringify(actual.tables)) {
    throw new Error(`${documentPath}: rendered table cell matrix differs from public Markdown`)
  }
  if (!containsWithMultiplicity(actual.externalLinks, expected.externalLinks)) {
    throw new Error(`${documentPath}: rendered link targets differ from public Markdown`)
  }
}

export async function verifyRenderedSite({ siteRoot, distRoot, siteBase = '/invest-research-site/' }) {
  const manifest = JSON.parse(await readFile(path.join(siteRoot, 'public/research-manifest.json'), 'utf8'))
  const markdownEntries = manifest.files.filter(entry => entry.kind === 'markdown')
  for (const entry of markdownEntries) {
    const markdownPath = path.join(siteRoot, entry.publicPath)
    const htmlPath = path.join(distRoot, entry.publicPath.replace(/\.md$/i, '.html'))
    const [source, html] = await Promise.all([
      readFile(markdownPath, 'utf8'),
      readFile(htmlPath, 'utf8')
    ])
    verifyRenderedDocument({ markdown: source, html, documentPath: entry.publicPath })
  }
  const assets = await verifyBuiltResearchAssets({ distRoot, manifest, siteBase })
  return { documents: markdownEntries.length, ...assets }
}
