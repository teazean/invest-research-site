import { describe, expect, it } from 'vitest'
import { rewriteAttachmentLinks } from '../../scripts/lib/attachment-links.mjs'

const privateRepository = {
  repository: 'teazean/obsidian-vault-invest',
  ref: 'master',
  serverUrl: 'https://github.com'
}
const documentPath = '投资研究/产业专题/光伏产业/光伏产业深度调研.md'
const attachmentPaths = new Set([
  '投资研究/产业专题/光伏产业/assets/利润状态 图.png',
  '投资研究/产业专题/光伏产业/assets/利润状态图.svg',
  '投资研究/产业专题/光伏产业/csv/利润池.csv',
  '投资研究/产业专题/光伏产业/reports/行业报告.pdf'
])

function rewrite(markdown, overrides = {}) {
  return rewriteAttachmentLinks(markdown, {
    documentPath,
    attachmentPaths,
    privateRepository,
    ...overrides
  })
}

describe('private attachment links', () => {
  it('wraps a bare image with a private blob link and preserves its image source', () => {
    const result = rewrite('![利润图](assets/利润状态 图.png)')

    expect(result.markdown).toBe(
      '[![利润图](assets/利润状态 图.png)](' +
      'https://github.com/teazean/obsidian-vault-invest/blob/master/' +
      '%E6%8A%95%E8%B5%84%E7%A0%94%E7%A9%B6/%E4%BA%A7%E4%B8%9A%E4%B8%93%E9%A2%98/' +
      '%E5%85%89%E4%BC%8F%E4%BA%A7%E4%B8%9A/assets/' +
      '%E5%88%A9%E6%B6%A6%E7%8A%B6%E6%80%81%20%E5%9B%BE.png)'
    )
    expect(result.rewrites).toEqual([expect.objectContaining({
      document: documentPath,
      from: 'assets/利润状态 图.png',
      kind: 'asset'
    })])
  })

  it.each([
    ['[SVG](assets/利润状态图.svg)', 'asset'],
    ['[CSV](csv/利润池.csv)', 'csv'],
    ['[PDF](reports/行业报告.pdf#page=6)', 'report']
  ])('rewrites %s to the private repository', (markdown, kind) => {
    const result = rewrite(markdown)

    expect(result.markdown).toContain(
      'https://github.com/teazean/obsidian-vault-invest/blob/master/'
    )
    expect(result.rewrites[0].kind).toBe(kind)
    if (kind === 'report') expect(result.markdown.endsWith('#page=6)')).toBe(true)
  })

  it('decodes an existing encoded destination and encodes it exactly once', () => {
    const result = rewrite('[CSV](csv/%E5%88%A9%E6%B6%A6%E6%B1%A0.csv)')

    expect(result.markdown).toContain('/csv/%E5%88%A9%E6%B6%A6%E6%B1%A0.csv)')
    expect(result.markdown).not.toContain('%25E5')
  })

  it('preserves a query and fragment after the private file path', () => {
    const result = rewrite('[PDF](reports/行业报告.pdf?download=1#page=6)')

    expect(result.markdown.endsWith(
      '/reports/%E8%A1%8C%E4%B8%9A%E6%8A%A5%E5%91%8A.pdf?download=1#page=6)'
    )).toBe(true)
  })

  it('leaves external sources and research note links unchanged', () => {
    const markdown = [
      '[交易所](https://example.com/report.pdf)',
      '[相关研究](相关研究.md)'
    ].join('\n')

    expect(rewrite(markdown)).toEqual({ markdown, rewrites: [] })
  })

  it('preserves an explicitly external-linked image', () => {
    const markdown = '[![利润图](assets/利润状态图.svg)](https://example.com/source)'

    expect(rewrite(markdown)).toEqual({ markdown, rewrites: [] })
  })

  it('rewrites the outer destination of an explicitly local-linked image once', () => {
    const result = rewrite(
      '[![利润图](assets/利润状态图.svg)](assets/利润状态图.svg)'
    )

    expect(result.markdown).toContain(
      '[![利润图](assets/利润状态图.svg)](https://github.com/'
    )
    expect(result.rewrites).toHaveLength(1)
  })

  it('does not rewrite Markdown-looking text in fenced or inline code', () => {
    const markdown = [
      '```markdown',
      '![图](assets/利润状态图.svg)',
      '```',
      '',
      '`[CSV](csv/利润池.csv)`'
    ].join('\n')

    expect(rewrite(markdown)).toEqual({ markdown, rewrites: [] })
  })

  it('rejects a missing attachment', () => {
    expect(() => rewrite('[CSV](csv/missing.csv)')).toThrow(
      /attachment target does not exist.*csv\/missing\.csv/
    )
  })

  it.each([
    'assets/../../secret.png',
    'assets/%2e%2e/%2e%2e/secret.png'
  ])('rejects a topic escape through %s', target => {
    expect(() => rewrite(`![图](${target})`)).toThrow(/escapes its research topic/)
  })

  it('rejects a cross-topic attachment target', () => {
    expect(() => rewrite(
      '[CSV](../../另一个行业/csv/利润池.csv)',
      { attachmentPaths: new Set(['投资研究/产业专题/另一个行业/csv/利润池.csv']) }
    )).toThrow(/escapes its research topic/)
  })

  it('rejects malformed percent encoding', () => {
    expect(() => rewrite('[CSV](csv/%E5.csv)')).toThrow(/malformed attachment encoding/)
  })

  it('rejects invalid private repository context', () => {
    expect(() => rewrite('[CSV](csv/利润池.csv)', {
      privateRepository: { repository: 'invalid repository', ref: '' }
    })).toThrow(/invalid private repository context/)
  })

  it('rejects attachment links outside the research roots', () => {
    expect(() => rewriteAttachmentLinks('[CSV](csv/利润池.csv)', {
      documentPath: '投资研究/关注池/观察.md',
      attachmentPaths: new Set(['投资研究/关注池/csv/利润池.csv']),
      privateRepository
    })).toThrow(/outside the public research roots/)
  })
})
