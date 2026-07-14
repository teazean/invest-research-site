import { createHash } from 'node:crypto'
import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({ html: true, linkify: false, typographer: false })

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function inlineVisibleText(token) {
  return (token.children ?? []).map(child => {
    if (child.type === 'text' || child.type === 'code_inline' || child.type === 'html_inline') return child.content
    if (child.type === 'image') return child.content
    if (child.type === 'softbreak' || child.type === 'hardbreak') return '\n'
    return ''
  }).join('')
}

export function canonicalizeMarkdown(source) {
  const tokens = markdown.parse(source, {})
  const visibleBlocks = []
  const tables = []
  let currentTable = null
  let currentRow = null
  let currentCell = null

  for (const token of tokens) {
    if (token.type === 'table_open') currentTable = []
    if (token.type === 'tr_open') currentRow = []
    if (token.type === 'th_open' || token.type === 'td_open') currentCell = ''
    if (token.type === 'inline') {
      const text = inlineVisibleText(token)
      visibleBlocks.push(text)
      if (currentCell !== null) currentCell += text
    }
    if (token.type === 'th_close' || token.type === 'td_close') {
      currentRow.push(currentCell)
      currentCell = null
    }
    if (token.type === 'tr_close') {
      currentTable.push(currentRow)
      currentRow = null
    }
    if (token.type === 'table_close') {
      tables.push(currentTable)
      currentTable = null
    }
  }

  const semanticPayload = JSON.stringify({ visibleBlocks, tables })
  const joinedText = visibleBlocks.join('\n')
  return {
    visibleBlocks,
    tables,
    numericTokens: joinedText.match(/(?:\d{4}(?:Q[1-4]|H[12])?|\d[\d,.]*)(?:%|倍|亿元|万元|元|美元|人民币)?/g) ?? [],
    semanticSha256: sha256(semanticPayload)
  }
}

export function assertCanonicalEqual(source, published, documentPath) {
  if (JSON.stringify(source.tables) !== JSON.stringify(published.tables)) {
    throw new Error(`${documentPath}: table cell matrix changed during publication`)
  }
  if (JSON.stringify(source.visibleBlocks) !== JSON.stringify(published.visibleBlocks)) {
    throw new Error(`${documentPath}: visible text changed during publication`)
  }
  if (source.semanticSha256 !== published.semanticSha256) {
    throw new Error(`${documentPath}: semantic SHA-256 mismatch`)
  }
}

export function renderMarkdown(source) {
  return markdown.render(source)
}
