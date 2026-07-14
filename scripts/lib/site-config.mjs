export function installMarkdownRenderers(md) {
  const originalTableOpen = md.renderer.rules.table_open ?? (() => '<table>\n')
  const originalTableClose = md.renderer.rules.table_close ?? (() => '</table>\n')
  md.renderer.rules.table_open = (...args) => (
    '<div class="research-table-scroll"><div class="research-table-hint" aria-hidden="true">完整表格，可左右滑动</div>' +
    originalTableOpen(...args)
  )
  md.renderer.rules.table_close = (...args) => `${originalTableClose(...args)}</div>`

  const originalImage = md.renderer.rules.image ?? ((tokens, index, options, environment, renderer) => (
    renderer.renderToken(tokens, index, options)
  ))
  md.renderer.rules.image = (tokens, index, options, environment, renderer) => {
    const image = originalImage(tokens, index, options, environment, renderer)
    if (tokens[index - 1]?.type === 'link_open') return image
    const source = md.utils.escapeHtml(tokens[index].attrGet('src') ?? '')
    return `<a class="research-image-link" href="${source}" target="_blank" rel="noreferrer">${image}</a>`
  }
}

function topicSidebar(topic, catalogLink) {
  return [{
    text: topic.name,
    link: catalogLink,
    items: topic.documents.map(document => ({ text: document.title, link: document.link }))
  }]
}

export function createSiteConfig(catalog) {
  const sidebar = {
    '/catalog/公司研究/': catalog.companies.map(company => ({
      text: company.ticker ? `${company.name}（${company.ticker}）` : company.name,
      link: company.catalogLink
    })),
    '/catalog/产业专题/': catalog.industries.map(industry => ({
      text: industry.name,
      link: industry.catalogLink
    }))
  }

  for (const company of catalog.companies) {
    sidebar[`/research/公司研究/${company.folder}/`] = topicSidebar(company, company.catalogLink)
  }
  for (const industry of catalog.industries) {
    sidebar[`/research/产业专题/${industry.folder}/`] = topicSidebar(industry, industry.catalogLink)
  }

  return {
    title: '投资研究',
    description: '公司与产业研究资料库',
    lang: 'zh-CN',
    base: '/invest-research-site/',
    cleanUrls: true,
    lastUpdated: true,
    head: [
      ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
      ['link', { rel: 'icon', href: '/invest-research-site/favicon.svg' }]
    ],
    markdown: {
      externalLinks: { target: '_blank', rel: 'noreferrer' },
      config: installMarkdownRenderers
    },
    themeConfig: {
      researchCatalog: catalog,
      nav: [
        { text: '首页', link: '/' },
        { text: '公司研究', link: '/#公司研究' },
        { text: '产业专题', link: '/#产业专题' }
      ],
      sidebar,
      search: {
        provider: 'local',
        options: { locales: { root: { translations: { button: { buttonText: '搜索研究', buttonAriaLabel: '搜索研究' }, modal: { noResultsText: '没有找到相关内容', resetButtonTitle: '清除查询', footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' } } } } } }
      },
      outline: { level: [2, 3], label: '本页目录' },
      lastUpdated: { text: '页面更新' },
      docFooter: { prev: '上一篇', next: '下一篇' },
      footer: {
        message: '资料用于研究交流，不构成确定性投资建议。请以原始公告和最新数据为准。',
        copyright: '数据日期与来源见各研究正文'
      },
      socialLinks: [{ icon: 'github', link: 'https://github.com/teazean/invest-research-site' }]
    }
  }
}
