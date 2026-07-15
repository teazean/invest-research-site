import { describe, expect, it } from 'vitest'
import { buildReportLinkMap, rewriteReportLinks } from '../../scripts/lib/report-links.mjs'

const indexMarkdown = `
| 报告期 | 本地文件 | 来源 |
|---|---|---|
| 2025 | [reports/2025.pdf](reports/2025.pdf) | [巨潮资讯](https://static.cninfo.com.cn/2025.pdf) |
`

describe('report link rewriting', () => {
  it('falls back to an authenticated private GitHub blob URL', () => {
    const documentPath = '投资研究/公司研究/寒武纪（688256.SH）调研/公司调研 - 寒武纪.md'

    const result = rewriteReportLinks(
      '[减值公告](reports/2026Q1_impairment.pdf)',
      new Map(),
      documentPath,
      { repository: 'teazean/obsidian-vault-invest', ref: 'master' }
    )

    expect(result.markdown).toBe(
      '[减值公告](https://github.com/teazean/obsidian-vault-invest/blob/master/' +
      '%E6%8A%95%E8%B5%84%E7%A0%94%E7%A9%B6/%E5%85%AC%E5%8F%B8%E7%A0%94%E7%A9%B6/' +
      '%E5%AF%92%E6%AD%A6%E7%BA%AA%EF%BC%88688256.SH%EF%BC%89%E8%B0%83%E7%A0%94/' +
      'reports/2026Q1_impairment.pdf)'
    )
  })

  it('rewrites a local report link to the authoritative URL', () => {
    const map = buildReportLinkMap([{ path: '财务报表.md', content: indexMarkdown }])
    const result = rewriteReportLinks('[2025年报](reports/2025.pdf)', map, '公司调研.md')
    expect(result.markdown).toBe('[2025年报](https://static.cninfo.com.cn/2025.pdf)')
    expect(result.rewrites).toEqual([{
      document: '公司调研.md',
      from: 'reports/2025.pdf',
      to: 'https://static.cninfo.com.cn/2025.pdf'
    }])
  })

  it('keeps an authoritative URL ahead of the private fallback', () => {
    const map = new Map([['reports/2025.pdf', 'https://static.cninfo.com.cn/2025.pdf']])

    const result = rewriteReportLinks(
      '[年报](reports/2025.pdf)',
      map,
      '投资研究/公司研究/示例公司（000001.SZ）调研/公司调研.md',
      { repository: 'invalid repository', ref: '' }
    )

    expect(result.markdown).toBe('[年报](https://static.cninfo.com.cn/2025.pdf)')
  })

  it('encodes private report paths by segment while preserving slashes', () => {
    const result = rewriteReportLinks(
      '[公告](reports/公告.pdf)',
      new Map(),
      '投资研究/公司研究/示例 公司（000001.SZ）调研/公司调研.md',
      { repository: 'teazean/obsidian-vault-invest', ref: 'master' }
    )

    expect(result.markdown).toContain(
      '/%E7%A4%BA%E4%BE%8B%20%E5%85%AC%E5%8F%B8%EF%BC%88000001.SZ%EF%BC%89%E8%B0%83%E7%A0%94/' +
      'reports/%E5%85%AC%E5%91%8A.pdf'
    )
  })

  it('rejects a private report path that escapes its research topic', () => {
    expect(() => rewriteReportLinks(
      '[公告](reports/../../secret.pdf)',
      new Map(),
      '投资研究/公司研究/示例公司（000001.SZ）调研/公司调研.md',
      { repository: 'teazean/obsidian-vault-invest', ref: 'master' }
    )).toThrow(/escapes its research topic/)
  })

  it('rejects private report links outside the public research roots', () => {
    expect(() => rewriteReportLinks(
      '[附件](reports/private.pdf)',
      new Map(),
      '投资研究/关注池/内部资料/笔记.md',
      { repository: 'teazean/obsidian-vault-invest', ref: 'master' }
    )).toThrow(/outside the public research roots/)
  })

  it('rejects invalid private repository context', () => {
    expect(() => rewriteReportLinks(
      '[公告](reports/private.pdf)',
      new Map(),
      '投资研究/公司研究/示例公司（000001.SZ）调研/公司调研.md',
      { repository: 'teazean only', ref: '' }
    )).toThrow(/invalid private report repository context/)
  })

  it('fails when a local report has no authoritative mapping', () => {
    expect(() => rewriteReportLinks('[年报](reports/missing.pdf)', new Map(), '公司调研.md'))
      .toThrow(/missing authoritative report URL.*reports\/missing\.pdf/)
  })
})
