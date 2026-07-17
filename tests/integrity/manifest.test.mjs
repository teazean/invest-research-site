import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createIntegrityManifest, validatePublicContent } from '../../scripts/lib/manifest.mjs'
import { sha256 } from '../../scripts/lib/files.mjs'

const roots = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('integrity manifest', () => {
  it('records semantic equality and byte hashes without absolute source paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'manifest-'))
    roots.push(root)
    const sourceRoot = path.join(root, 'vault')
    const siteRoot = path.join(root, 'site')
    await mkdir(path.join(sourceRoot, '投资研究/公司研究/A'), { recursive: true })
    await mkdir(path.join(siteRoot, 'research/公司研究/A'), { recursive: true })
    await writeFile(path.join(sourceRoot, '投资研究/公司研究/A/研究.md'), '[年报](reports/a.pdf) 数据 100亿元')
    await writeFile(path.join(siteRoot, 'research/公司研究/A/研究.md'), '[年报](https://example.com/a.pdf) 数据 100亿元')
    const source = await readFile(path.join(sourceRoot, '投资研究/公司研究/A/研究.md'))
    const published = await readFile(path.join(siteRoot, 'research/公司研究/A/研究.md'))
    const syncResult = {
      sourceRoot,
      privateRepository: {
        repository: 'teazean/obsidian-vault-invest',
        ref: 'master',
        serverUrl: 'https://github.com'
      },
      rewrites: [{
        document: '投资研究/公司研究/A/研究.md',
        from: 'reports/a.pdf',
        to: 'https://example.com/a.pdf',
        kind: 'report'
      }],
      files: [{
        sourcePath: path.join(sourceRoot, '投资研究/公司研究/A/研究.md'),
        relativePath: '投资研究/公司研究/A/研究.md',
        publicPath: 'research/公司研究/A/研究.md',
        kind: 'markdown',
        size: source.length,
        publicSize: published.length,
        sourceSha256: sha256(source),
        publicSha256: sha256(published)
      }]
    }

    const manifest = await createIntegrityManifest({ syncResult, siteRoot })
    expect(JSON.stringify(manifest)).not.toContain(sourceRoot)
    expect(manifest.privateRepository).toEqual(syncResult.privateRepository)
    expect(manifest.files[0].semanticSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('fails validation when a published file changes after manifest creation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'manifest-change-'))
    roots.push(root)
    const siteRoot = path.join(root, 'site')
    await mkdir(path.join(siteRoot, 'research/公司研究/A'), { recursive: true })
    const publicPath = 'research/公司研究/A/data.csv'
    const original = Buffer.from('year,value\n2025,100\n')
    await writeFile(path.join(siteRoot, publicPath), original)
    const manifest = { version: 1, rewrites: [], files: [{
      sourceRelativePath: '投资研究/公司研究/A/data.csv', publicPath, kind: 'csv',
      sourceSize: original.length, publicSize: original.length,
      sourceSha256: sha256(original), publicSha256: sha256(original)
    }] }
    await mkdir(path.join(siteRoot, 'public'), { recursive: true })
    await writeFile(path.join(siteRoot, 'public/research-manifest.json'), JSON.stringify(manifest))
    await writeFile(path.join(siteRoot, publicPath), 'year,value\n2025,101\n')

    await expect(validatePublicContent({ siteRoot })).rejects.toThrow(/SHA-256 mismatch/)
  })
})
