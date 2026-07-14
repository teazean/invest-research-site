import { describe, expect, it } from 'vitest'
import { buildReportLinkMap, rewriteReportLinks } from '../../scripts/lib/report-links.mjs'

const indexMarkdown = `
| 报告期 | 本地文件 | 来源 |
|---|---|---|
| 2025 | [reports/2025.pdf](reports/2025.pdf) | [巨潮资讯](https://static.cninfo.com.cn/2025.pdf) |
`

describe('report link rewriting', () => {
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

  it('fails when a local report has no authoritative mapping', () => {
    expect(() => rewriteReportLinks('[年报](reports/missing.pdf)', new Map(), '公司调研.md'))
      .toThrow(/missing authoritative report URL.*reports\/missing\.pdf/)
  })
})
