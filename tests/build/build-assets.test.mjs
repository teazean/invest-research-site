import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const roots = []

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'build-assets-'))
  roots.push(root)
  const siteRoot = path.join(root, 'site')
  const distRoot = path.join(root, 'dist')
  const htmlPath = path.join(distRoot, 'research/产业专题/储能/研究.html')
  const imagePath = path.join(distRoot, 'assets/chart.ABC123.png')
  const clientPath = path.join(distRoot, 'assets/research.CLIENT.js')
  const privateHref = 'https://github.com/teazean/obsidian-vault-invest/blob/master/%E6%8A%95%E8%B5%84%E7%A0%94%E7%A9%B6/%E4%BA%A7%E4%B8%9A%E4%B8%93%E9%A2%98/%E5%82%A8%E8%83%BD/assets/chart.png'
  const csvPublicPath = 'research/公司研究/示例公司/csv/financials.csv'
  const csvSourcePath = path.join(siteRoot, csvPublicPath)
  const csvDistPath = path.join(distRoot, csvPublicPath)
  const csvBytes = Buffer.from('year,revenue\n2025,100\n')

  await Promise.all([
    mkdir(path.dirname(htmlPath), { recursive: true }),
    mkdir(path.dirname(imagePath), { recursive: true }),
    mkdir(path.dirname(csvSourcePath), { recursive: true }),
    mkdir(path.join(siteRoot, 'public'), { recursive: true })
  ])
  await writeFile(htmlPath, `<main><a class="research-image-link" href="${privateHref}" target="_blank" rel="noreferrer"><img src="/invest-research-site/assets/chart.ABC123.png" alt="图表"></a></main>`)
  await writeFile(imagePath, Buffer.from('unchanged-image-bytes'))
  await writeFile(clientPath, `const page='<p><a href="${privateHref}" class="research-image-link" target="_blank"><img src="'+image+'"></a></p>'`)
  await writeFile(csvSourcePath, csvBytes)
  await writeFile(path.join(siteRoot, 'public/research-manifest.json'), JSON.stringify({
    privateRepository: {
      repository: 'teazean/obsidian-vault-invest',
      ref: 'master',
      serverUrl: 'https://github.com'
    },
    files: [{
      publicPath: csvPublicPath,
      kind: 'csv',
      publicSize: csvBytes.length,
      publicSha256: sha256(csvBytes)
    }]
  }))

  return { siteRoot, distRoot, htmlPath, clientPath, privateHref, csvSourcePath, csvDistPath, csvBytes, csvPublicPath }
}

function runFinalizer(siteRoot, distRoot) {
  return spawnSync(process.execPath, [
    'scripts/finalize-site.mjs',
    '--site-root', siteRoot,
    '--dist-root', distRoot,
    '--site-base', '/invest-research-site/'
  ], { cwd: repoRoot, encoding: 'utf8' })
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('built research assets', () => {
  it('runs asset finalization after every VitePress build', async () => {
    const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))

    expect(pkg.scripts['site:build']).toBe(
      'vitepress build site && node scripts/finalize-site.mjs'
    )
  })

  it('preserves private image targets, validates client links and copies manifest CSV bytes', async () => {
    const fixture = await createFixture()
    const originalHtml = await readFile(fixture.htmlPath, 'utf8')

    const result = runFinalizer(fixture.siteRoot, fixture.distRoot)

    expect(result.status, result.stderr).toBe(0)
    expect(await readFile(fixture.htmlPath, 'utf8')).toBe(originalHtml)
    expect(originalHtml).toContain(`href="${fixture.privateHref}"`)
    expect(await readFile(fixture.csvDistPath)).toEqual(fixture.csvBytes)
    expect(JSON.parse(result.stdout)).toEqual({ htmlFiles: 1, imageLinks: 1, clientImageLinks: 1, csvFiles: 1 })
  })

  it.each([
    ['missing image', '<a class="research-image-link"></a>'],
    ['multiple images', '<a class="research-image-link"><img src="/invest-research-site/assets/chart.ABC123.png"><img src="/invest-research-site/assets/chart.ABC123.png"></a>'],
    ['path traversal', '<a class="research-image-link"><img src="/invest-research-site/%2e%2e/secret.png"></a>'],
    ['external origin', '<a class="research-image-link"><img src="https://example.com/invest-research-site/assets/chart.ABC123.png"></a>'],
    ['relative click target', '<a class="research-image-link" href="./assets/chart.png"><img src="/invest-research-site/assets/chart.ABC123.png"></a>']
  ])('fails closed for %s', async (_name, fragment) => {
    const fixture = await createFixture()
    await writeFile(fixture.htmlPath, `<main>${fragment}</main>`)

    const result = runFinalizer(fixture.siteRoot, fixture.distRoot)

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/research image link|asset URL/)
  })

  it('fails when an SPA client chunk contains a relative image click target', async () => {
    const fixture = await createFixture()
    await writeFile(fixture.clientPath, 'h("a",{class:"research-image-link",href:"./assets/chart.png"},[])')

    const result = runFinalizer(fixture.siteRoot, fixture.distRoot)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('client image link must use private GitHub blob URL')
  })

  it('fails when a manifest CSV source is missing', async () => {
    const fixture = await createFixture()
    await unlink(fixture.csvSourcePath)

    const result = runFinalizer(fixture.siteRoot, fixture.distRoot)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(fixture.csvPublicPath)
  })

  it('fails when manifest CSV bytes do not match their SHA-256', async () => {
    const fixture = await createFixture()
    await writeFile(fixture.csvSourcePath, Buffer.from('year,revenue\n2025,999\n'))

    const result = runFinalizer(fixture.siteRoot, fixture.distRoot)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(fixture.csvPublicPath)
    expect(result.stderr).toContain('SHA-256 mismatch')
  })
})
