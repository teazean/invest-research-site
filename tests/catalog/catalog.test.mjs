import { describe, expect, it } from 'vitest'
import { buildCatalog, parseResearchDocument } from '../../scripts/lib/catalog.mjs'

const mainMarkdown = `# 公司调研 - 中际旭创（300308.SZ）

> **先说结论**
> 第一段完整结论。
> 第二段仍属于结论。

> **研究边界**
> 数据核验日：2026-07-14。

## 1. 一句话看懂公司

正文。
`

describe('research catalog', () => {
  it('derives company identity and exact summary without frontmatter', () => {
    const document = parseResearchDocument(
      mainMarkdown,
      'research/公司研究/中际旭创（300308.SZ）调研/公司调研 - 中际旭创.md'
    )
    expect(document).toMatchObject({
      title: '公司调研 - 中际旭创（300308.SZ）',
      company: '中际旭创',
      ticker: '300308.SZ',
      dataDate: '2026-07-14',
      summary: '第一段完整结论。\n第二段仍属于结论。',
      role: 'overview',
      kind: 'company'
    })
    expect(document.headings).toContain('1. 一句话看懂公司')
  })

  it('groups every document into a reachable company or industry topic', () => {
    const documents = [
      parseResearchDocument(mainMarkdown, 'research/公司研究/中际旭创（300308.SZ）调研/公司调研 - 中际旭创.md'),
      parseResearchDocument('# 财务报表 - 中际旭创', 'research/公司研究/中际旭创（300308.SZ）调研/财务报表 - 中际旭创.md'),
      parseResearchDocument('# AI 行业总览', 'research/产业专题/AI产业链/AI行业总览.md')
    ]
    const catalog = buildCatalog(documents)
    expect(catalog.companies).toHaveLength(1)
    expect(catalog.companies[0].documents.map(document => document.role)).toEqual(['overview', 'financials'])
    expect(catalog.industries).toHaveLength(1)
    expect(catalog.documents).toHaveLength(3)
    expect(catalog.documents.every(document => document.link.startsWith('/research/'))).toBe(true)
  })
})
