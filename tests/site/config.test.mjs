import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import { createSiteConfig, installMarkdownRenderers } from '../../scripts/lib/site-config.mjs'

const catalog = {
  companies: [{
    name: '中际旭创', ticker: '300308.SZ', folder: '中际旭创（300308.SZ）调研',
    catalogLink: '/catalog/公司研究/中际旭创（300308.SZ）调研/',
    documents: [{ title: '公司调研', link: '/research/公司研究/中际旭创（300308.SZ）调研/公司调研%20-%20中际旭创' }]
  }],
  industries: [{
    name: 'AI产业链', folder: 'AI产业链', catalogLink: '/catalog/产业专题/AI产业链/',
    documents: [{ title: 'AI行业总览', link: '/research/产业专题/AI产业链/AI行业总览' }]
  }],
  documents: []
}

describe('VitePress site configuration', () => {
  it('configures GitHub Pages base, Chinese search and complete topic sidebars', () => {
    const config = createSiteConfig(catalog)
    expect(config.base).toBe('/invest-research-site/')
    expect(config.lang).toBe('zh-CN')
    expect(config.themeConfig.search.provider).toBe('local')
    expect(config.themeConfig.sidebar['/research/公司研究/中际旭创（300308.SZ）调研/'][0].items).toHaveLength(1)
    expect(config.themeConfig.sidebar['/research/产业专题/AI产业链/'][0].items).toHaveLength(1)
    expect(config.themeConfig.footer.message).toContain('不构成确定性投资建议')
  })

  it('wraps tables for mobile scrolling without changing table content', () => {
    const md = new MarkdownIt()
    installMarkdownRenderers(md)
    const html = md.render('| 年度 | 收入 |\n|---|---:|\n| 2025 | 100亿元 |')
    expect(html).toContain('class="research-table-scroll"')
    expect(html).toContain('<td style="text-align:right">100亿元</td>')
    expect(html).toContain('完整表格，可左右滑动')
  })

  it('links images to their original asset for full-size inspection', () => {
    const md = new MarkdownIt()
    installMarkdownRenderers(md)
    const html = md.render('![趋势图](assets/trend.png)')
    expect(html).toContain('<a class="research-image-link" href="assets/trend.png" target="_blank" rel="noreferrer">')
    expect(html).toContain('<img src="assets/trend.png" alt="趋势图">')
  })
})
