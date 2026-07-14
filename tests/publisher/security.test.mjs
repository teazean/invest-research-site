import { describe, expect, it } from 'vitest'
import { validateMarkdownSecurity } from '../../scripts/lib/security.mjs'

describe('validateMarkdownSecurity', () => {
  it.each([
    ['unsafe YAML field', '---\nlayout: home\n---\n# A'],
    ['unsafe CSS class', '---\ncssclasses:\n  - private-layout\n---\n# A'],
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

  it('accepts the bounded research metadata used by the vault', () => {
    const markdown = `---
title: AI产业链深度调研
date: 2026-07-03
updated: 2026-07-14
tags:
  - 投资研究
  - AI
cssclasses:
  - wide-tables
aliases:
  - 人工智能产业链
status: reviewed
---

# AI产业链深度调研`

    expect(() => validateMarkdownSecurity(markdown, '研究.md')).not.toThrow()
  })
})
