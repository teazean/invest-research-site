import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { publishResearchSite } from '../../scripts/lib/publish.mjs'

const roots = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('publishResearchSite', () => {
  it('passes private report context into research synchronization', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'publish-private-report-'))
    roots.push(root)
    const sourceRoot = path.join(root, 'vault')
    const siteRoot = path.join(root, 'site')
    const company = path.join(sourceRoot, '投资研究/公司研究/示例公司（000001.SZ）调研')
    await mkdir(path.join(company, 'reports'), { recursive: true })
    await writeFile(path.join(company, '公司调研 - 示例公司.md'), '# 公司调研 - 示例公司（000001.SZ）\n\n> **先说结论**\n> 完整结论。\n\n[附件](reports/private.pdf)')
    await writeFile(path.join(company, 'reports/private.pdf'), 'private')

    await publishResearchSite({
      sourceRoot,
      siteRoot,
      privateReports: {
        repository: 'teazean/obsidian-vault-invest',
        ref: 'master',
        serverUrl: 'https://github.com'
      }
    })

    expect(await readFile(path.join(
      siteRoot,
      'research/公司研究/示例公司（000001.SZ）调研/公司调研 - 示例公司.md'
    ), 'utf8')).toContain('github.com/teazean/obsidian-vault-invest/blob/master/')
  })

  it('synchronizes research and writes catalog pages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'publish-site-'))
    roots.push(root)
    const sourceRoot = path.join(root, 'vault')
    const siteRoot = path.join(root, 'site')
    const company = path.join(sourceRoot, '投资研究/公司研究/示例公司（000001.SZ）调研')
    await mkdir(company, { recursive: true })
    await writeFile(path.join(company, '公司调研 - 示例公司.md'), '# 公司调研 - 示例公司（000001.SZ）\n\n> **先说结论**\n> 完整结论。\n\n数据核验日：2026-07-14。')

    const result = await publishResearchSite({ sourceRoot, siteRoot })

    expect(result.catalog.companies).toHaveLength(1)
    expect(await readFile(path.join(siteRoot, 'index.md'), 'utf8')).toContain('示例公司（000001.SZ）')
    const manifest = JSON.parse(await readFile(path.join(siteRoot, 'public/research-manifest.json'), 'utf8'))
    expect(manifest.files).toHaveLength(1)
    expect(manifest.files[0].semanticSha256).toMatch(/^[a-f0-9]{64}$/)
  })
})
