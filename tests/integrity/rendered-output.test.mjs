import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyRenderedDocument, verifyRenderedSite } from '../../scripts/lib/rendered-integrity.mjs'

const roots = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('rendered document integrity', () => {
  it('passes when rendered HTML contains every source block and table cell', () => {
    const markdown = '# 财务\n\n收入 382.40 亿元。\n\n| 年度 | 收入 |\n|---|---:|\n| 2025 | 382.40亿元 |'
    const html = '<main class="vp-doc"><h1>财务<a class="header-anchor">#</a></h1><p>收入 382.40 亿元。</p><table><thead><tr><th>年度</th><th>收入</th></tr></thead><tbody><tr><td>2025</td><td>382.40亿元</td></tr></tbody></table></main>'
    expect(() => verifyRenderedDocument({ markdown, html, documentPath: '财务.md' })).not.toThrow()
  })

  it('treats validated frontmatter as metadata rather than visible body text', () => {
    const markdown = '---\ntitle: 财务研究\ntags:\n  - 投资研究\n---\n\n# 财务研究\n\n收入 100 亿元。'
    const html = '<main class="vp-doc"><h1>财务研究</h1><p>收入 100 亿元。</p></main>'
    expect(() => verifyRenderedDocument({ markdown, html, documentPath: '财务.md' })).not.toThrow()
  })

  it('accepts decoded display text while requiring the same URL target', () => {
    const markdown = '# 来源\n\nhttps://example.com/%E4%B8%AD%E6%96%87.pdf'
    const html = '<main class="vp-doc"><h1>来源</h1><p><a href="https://example.com/%E4%B8%AD%E6%96%87.pdf">https://example.com/中文.pdf</a></p></main>'
    expect(() => verifyRenderedDocument({ markdown, html, documentPath: '来源.md' })).not.toThrow()
  })

  it('fails when a rendered link target changes', () => {
    const markdown = '# 来源\n\n[公告](https://example.com/original.pdf)'
    const html = '<main class="vp-doc"><h1>来源</h1><p><a href="https://example.com/changed.pdf">公告</a></p></main>'
    expect(() => verifyRenderedDocument({ markdown, html, documentPath: '来源.md' }))
      .toThrow(/rendered link targets/)
  })

  it('fails when rendered HTML omits a source paragraph', () => {
    const markdown = '# 研究\n\n第一段。\n\n第二段包含 100 亿元。'
    const html = '<main class="vp-doc"><h1>研究</h1><p>第一段。</p></main>'
    expect(() => verifyRenderedDocument({ markdown, html, documentPath: '研究.md' }))
      .toThrow(/rendered visible text/)
  })

  it('verifies every Markdown route listed in the manifest', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'rendered-site-'))
    roots.push(root)
    const siteRoot = path.join(root, 'site')
    const distRoot = path.join(root, 'dist')
    await mkdir(path.join(siteRoot, 'research/公司研究/A'), { recursive: true })
    await mkdir(path.join(distRoot, 'research/公司研究/A'), { recursive: true })
    await mkdir(path.join(siteRoot, 'public'), { recursive: true })
    await writeFile(path.join(siteRoot, 'research/公司研究/A/研究.md'), '# 研究\n\n完整正文 100 亿元。')
    await writeFile(path.join(distRoot, 'research/公司研究/A/研究.html'), '<main class="vp-doc"><h1>研究</h1><p>完整正文 100 亿元。</p></main>')
    await writeFile(path.join(siteRoot, 'public/research-manifest.json'), JSON.stringify({
      files: [{ publicPath: 'research/公司研究/A/研究.md', kind: 'markdown' }]
    }))

    await expect(verifyRenderedSite({ siteRoot, distRoot })).resolves.toEqual({ documents: 1 })
  })
})
