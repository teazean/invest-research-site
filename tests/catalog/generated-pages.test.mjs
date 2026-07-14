import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeGeneratedPages } from '../../scripts/lib/generated-pages.mjs'

const roots = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('generated catalog pages', () => {
  it('adds summary navigation without replacing research files', async () => {
    const siteRoot = await mkdtemp(path.join(tmpdir(), 'catalog-pages-'))
    roots.push(siteRoot)
    const catalog = {
      companies: [{
        name: '中际旭创', ticker: '300308.SZ', folder: '中际旭创（300308.SZ）调研',
        summary: '完整结论。', dataDate: '2026-07-14',
        documents: [{ title: '公司调研', role: 'overview', link: '/research/公司研究/中际旭创（300308.SZ）调研/公司调研 - 中际旭创' }]
      }],
      industries: [{
        name: 'AI产业链', folder: 'AI产业链',
        documents: [{ title: 'AI 行业总览', link: '/research/产业专题/AI产业链/AI行业总览' }]
      }],
      documents: []
    }

    await writeGeneratedPages({ catalog, siteRoot })

    const companyIndex = await readFile(path.join(siteRoot, 'catalog/公司研究/中际旭创（300308.SZ）调研/index.md'), 'utf8')
    expect(companyIndex).toContain('完整结论。')
    expect(companyIndex).toContain('/research/公司研究/中际旭创（300308.SZ）调研/公司调研%20-%20中际旭创')
    expect(await readFile(path.join(siteRoot, 'index.md'), 'utf8')).toContain('/catalog/产业专题/AI产业链/')
    await expect(stat(path.join(siteRoot, 'research'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
