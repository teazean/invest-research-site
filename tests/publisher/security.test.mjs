import { describe, expect, it } from 'vitest'
import { validateMarkdownSecurity } from '../../scripts/lib/security.mjs'

describe('validateMarkdownSecurity', () => {
  it.each([
    ['YAML frontmatter', '---\ntitle: secret\n---\n# A'],
    ['Obsidian wikilink', '# A\n[[private note]]'],
    ['Obsidian embed', '# A\n![[private.png]]'],
    ['Obsidian callout', '# A\n> [!warning] private'],
    ['local absolute path', '# A\n/Users/zhang/private.csv'],
    ['GitHub token', '# A\nghp_abcdefghijklmnopqrstuvwxyz123456'],
    ['private key', '# A\n-----BEGIN PRIVATE KEY-----']
  ])('rejects %s', (_label, markdown) => {
    expect(() => validateMarkdownSecurity(markdown, '研究.md')).toThrow()
  })

  it('accepts standard GFM research content', () => {
    expect(() => validateMarkdownSecurity('# 研究\n\n| 年度 | 收入 |\n|---|---:|\n| 2025 | 100亿元 |', '研究.md'))
      .not.toThrow()
  })
})
