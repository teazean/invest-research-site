import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverPublicationFiles } from '../../scripts/lib/files.mjs'
import { syncResearch } from '../../scripts/lib/sync.mjs'

const temporaryRoots = []

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'research-publisher-'))
  temporaryRoots.push(root)
  const company = path.join(root, 'vault/投资研究/公司研究/示例公司（000001.SZ）调研')
  await mkdir(path.join(company, 'assets'), { recursive: true })
  await mkdir(path.join(company, 'csv'), { recursive: true })
  await mkdir(path.join(company, 'reports'), { recursive: true })
  await mkdir(path.join(company, 'data'), { recursive: true })
  await mkdir(path.join(root, 'vault/投资研究/关注池'), { recursive: true })

  await writeFile(path.join(company, '财务报表 - 示例公司.md'), [
    '# 财务报表 - 示例公司',
    '| 报告期 | 本地文件 | 来源 |',
    '|---|---|---|',
    '| 2025 | [本地](reports/2025.pdf) | [巨潮资讯](https://static.cninfo.com.cn/2025.pdf) |'
  ].join('\n'))
  await writeFile(path.join(company, '公司调研 - 示例公司.md'), '# 公司调研\n\n[2025年报](reports/2025.pdf)')
  await writeFile(path.join(company, 'assets/chart.png'), Buffer.from([0, 1, 2, 3]))
  await writeFile(path.join(company, 'csv/annual.csv'), 'year,revenue\n2025,100\n')
  await writeFile(path.join(company, 'reports/2025.pdf'), 'not-public')
  await writeFile(path.join(company, 'data/raw.csv'), 'not-public')
  await writeFile(path.join(root, 'vault/投资研究/关注池/个股关注池.md'), '# private')

  return { root, company, sourceRoot: path.join(root, 'vault'), siteRoot: path.join(root, 'site') }
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('research synchronization', () => {
  it('discovers only allowlisted publication files', async () => {
    const { sourceRoot } = await fixture()
    const files = await discoverPublicationFiles(sourceRoot)
    expect(files.map(file => file.relativePath)).toEqual([
      '投资研究/公司研究/示例公司（000001.SZ）调研/assets/chart.png',
      '投资研究/公司研究/示例公司（000001.SZ）调研/csv/annual.csv',
      '投资研究/公司研究/示例公司（000001.SZ）调研/公司调研 - 示例公司.md',
      '投资研究/公司研究/示例公司（000001.SZ）调研/财务报表 - 示例公司.md'
    ])
  })

  it('copies allowed files, preserves bytes and rewrites report links', async () => {
    const { sourceRoot, siteRoot } = await fixture()
    const result = await syncResearch({ sourceRoot, siteRoot })
    const publicRoot = path.join(siteRoot, 'research/公司研究/示例公司（000001.SZ）调研')

    expect(await readFile(path.join(publicRoot, 'assets/chart.png'))).toEqual(Buffer.from([0, 1, 2, 3]))
    expect(await readFile(path.join(publicRoot, 'csv/annual.csv'), 'utf8')).toBe('year,revenue\n2025,100\n')
    expect(await readFile(path.join(publicRoot, '公司调研 - 示例公司.md'), 'utf8'))
      .toContain('[2025年报](https://static.cninfo.com.cn/2025.pdf)')
    await expect(stat(path.join(publicRoot, 'reports/2025.pdf'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(result.files).toHaveLength(4)
    expect(result.rewrites).toHaveLength(2)
  })

  it('uses a private GitHub link for an unmapped report without publishing the PDF', async () => {
    const { company, sourceRoot, siteRoot } = await fixture()
    await writeFile(path.join(company, '私有公告.md'), '# 私有公告\n\n[附件](reports/private.pdf)')
    await writeFile(path.join(company, 'reports/private.pdf'), 'private-pdf')

    const result = await syncResearch({
      sourceRoot,
      siteRoot,
      privateReports: {
        repository: 'teazean/obsidian-vault-invest',
        ref: 'master',
        serverUrl: 'https://github.com'
      }
    })
    const publicRoot = path.join(siteRoot, 'research/公司研究/示例公司（000001.SZ）调研')
    const publicMarkdown = await readFile(path.join(publicRoot, '私有公告.md'), 'utf8')

    expect(publicMarkdown).toContain(
      'https://github.com/teazean/obsidian-vault-invest/blob/master/' +
      '%E6%8A%95%E8%B5%84%E7%A0%94%E7%A9%B6/%E5%85%AC%E5%8F%B8%E7%A0%94%E7%A9%B6/' +
      '%E7%A4%BA%E4%BE%8B%E5%85%AC%E5%8F%B8%EF%BC%88000001.SZ%EF%BC%89%E8%B0%83%E7%A0%94/' +
      'reports/private.pdf'
    )
    await expect(stat(path.join(publicRoot, 'reports/private.pdf'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(result.rewrites).toContainEqual(expect.objectContaining({
      document: '投资研究/公司研究/示例公司（000001.SZ）调研/私有公告.md',
      from: 'reports/private.pdf'
    }))
  })
})
