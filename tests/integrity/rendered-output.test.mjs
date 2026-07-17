import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyRenderedDocument, verifyRenderedSite } from '../../scripts/lib/rendered-integrity.mjs'

const roots = []

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

async function createRenderedSiteFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'rendered-site-'))
  roots.push(root)
  const siteRoot = path.join(root, 'site')
  const distRoot = path.join(root, 'dist')
  const imagePath = path.join(distRoot, 'assets/chart.HASH.png')
  const csvBytes = Buffer.from('year,revenue\n2025,100\n')
  const csvPublicPath = 'research/公司研究/A/financials.csv'
  const csvPath = path.join(distRoot, csvPublicPath)
  const privateHref = 'https://github.com/teazean/obsidian-vault-invest/blob/master/%E6%8A%95%E8%B5%84%E7%A0%94%E7%A9%B6/%E5%85%AC%E5%8F%B8%E7%A0%94%E7%A9%B6/A/assets/chart.png'
  await mkdir(path.join(siteRoot, 'research/公司研究/A'), { recursive: true })
  await mkdir(path.join(distRoot, 'research/公司研究/A'), { recursive: true })
  await mkdir(path.join(distRoot, 'assets'), { recursive: true })
  await mkdir(path.join(siteRoot, 'public'), { recursive: true })
  await writeFile(path.join(siteRoot, 'research/公司研究/A/研究.md'), '# 研究\n\n完整正文 100 亿元。')
  await writeFile(path.join(distRoot, 'research/公司研究/A/研究.html'), `<main class="vp-doc"><h1>研究</h1><p>完整正文 100 亿元。</p><a class="research-image-link" href="${privateHref}"><img src="/invest-research-site/assets/chart.HASH.png"></a></main>`)
  await writeFile(imagePath, Buffer.from('image'))
  await writeFile(csvPath, csvBytes)
  await writeFile(path.join(siteRoot, 'public/research-manifest.json'), JSON.stringify({
    privateRepository: {
      repository: 'teazean/obsidian-vault-invest',
      ref: 'master',
      serverUrl: 'https://github.com'
    },
    files: [
      { publicPath: 'research/公司研究/A/研究.md', kind: 'markdown' },
      {
        publicPath: csvPublicPath,
        kind: 'csv',
        publicSize: csvBytes.length,
        publicSha256: sha256(csvBytes)
      }
    ]
  }))
  return {
    siteRoot,
    distRoot,
    htmlPath: path.join(distRoot, 'research/公司研究/A/研究.html'),
    imagePath,
    csvPath,
    csvBytes,
    csvPublicPath
  }
}

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
    const fixture = await createRenderedSiteFixture()

    await expect(verifyRenderedSite(fixture)).resolves.toEqual({
      documents: 1,
      htmlFiles: 1,
      imageLinks: 1,
      clientImageLinks: 0,
      csvFiles: 1
    })
  })

  it('fails when a linked built image is missing', async () => {
    const fixture = await createRenderedSiteFixture()
    await rm(fixture.imagePath)

    await expect(verifyRenderedSite(fixture)).rejects.toThrow(/image target/)
  })

  it('fails when an image click target is relative', async () => {
    const fixture = await createRenderedSiteFixture()
    await writeFile(fixture.htmlPath, '<main class="vp-doc"><h1>研究</h1><p>完整正文 100 亿元。</p><a class="research-image-link" href="./assets/chart.png"><img src="/invest-research-site/assets/chart.HASH.png"></a></main>')

    await expect(verifyRenderedSite(fixture)).rejects.toThrow(/private GitHub blob URL/)
  })

  it('fails when a manifest CSV is missing from the build', async () => {
    const fixture = await createRenderedSiteFixture()
    await rm(fixture.csvPath)

    await expect(verifyRenderedSite(fixture)).rejects.toThrow(fixture.csvPublicPath)
  })

  it('fails when a built CSV has been tampered with', async () => {
    const fixture = await createRenderedSiteFixture()
    await writeFile(fixture.csvPath, Buffer.from('year,revenue\n2025,999\n'))

    await expect(verifyRenderedSite(fixture)).rejects.toThrow(/SHA-256 mismatch/)
  })
})
