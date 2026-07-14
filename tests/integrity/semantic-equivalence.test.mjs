import { describe, expect, it } from 'vitest'
import { assertCanonicalEqual, canonicalizeMarkdown } from '../../scripts/lib/integrity.mjs'

describe('Markdown semantic equivalence', () => {
  it('detects one missing table cell', () => {
    const source = canonicalizeMarkdown('| 年度 | 收入 |\n|---|---:|\n| 2025 | 382.40亿元 |')
    const changed = canonicalizeMarkdown('| 年度 | 收入 |\n|---|---:|\n| 2025 | |')
    expect(() => assertCanonicalEqual(source, changed, '财务.md')).toThrow(/table cell/)
  })

  it('detects changed numbers, units and source text', () => {
    const source = canonicalizeMarkdown('2025 年收入 382.40 亿元，来源等级 A。')
    const changed = canonicalizeMarkdown('2025 年收入 382.40 万元，来源等级 B。')
    expect(() => assertCanonicalEqual(source, changed, '研究.md')).toThrow(/visible text/)
  })

  it('allows a report URL rewrite when the anchor text stays unchanged', () => {
    const source = canonicalizeMarkdown('[2025年报](reports/2025.pdf)')
    const published = canonicalizeMarkdown('[2025年报](https://example.com/2025.pdf)')
    expect(source.semanticSha256).toBe(published.semanticSha256)
    expect(() => assertCanonicalEqual(source, published, '研究.md')).not.toThrow()
  })
})
