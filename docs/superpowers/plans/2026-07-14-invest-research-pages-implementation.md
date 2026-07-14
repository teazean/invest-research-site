# Investment Research Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a deterministic, mobile-first GitHub Pages site from the complete company and industry research stored in the private `invest` Obsidian vault.

**Architecture:** A private-repository workflow reacts to research pushes, checks out the public site with a repository-scoped deploy key, and runs a versioned publisher from the site repository. The publisher creates an allowlisted Markdown/assets/CSV copy plus an integrity manifest; a public-repository workflow validates that copy, builds a VitePress site, verifies rendered HTML against the manifest, and deploys only a successful artifact.

**Tech Stack:** Node.js 24, npm, VitePress 1.6.4, Vue 3, markdown-it 14.3.0, Cheerio 1.2.0, Vitest 4.1.10, GitHub Actions, GitHub Pages.

## Global Constraints

- The Obsidian vault remains the only authored source of truth.
- Publish only `投资研究/公司研究/**` and `投资研究/产业专题/**`.
- Include GFM Markdown, `assets/` images, and `csv/` files; exclude `reports/`, `data/`, hidden files, Obsidian configuration, and every other vault path.
- Preserve every paragraph, heading, list item, quote, table row/cell, numeric value, unit, date, source label, and counterargument.
- Copy images and CSV files byte-for-byte and verify SHA-256 plus size.
- Rewrite `reports/*.pdf` links only to authoritative URLs found in the same company research corpus; fail closed when a mapping is missing.
- The summary/mobile layer is additive and can never replace the complete source document or complete table.
- No LLM is called during synchronization, build, validation, or deployment.
- Any synchronization, integrity, build, or rendered-output failure leaves the previously deployed site untouched.
- Public URL: `https://teazean.github.io/invest-research-site/`; VitePress base: `/invest-research-site/`.

---

### Task 1: Project and Test Harness

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `.gitignore`
- Create: `vitest.config.mjs`
- Create: `tests/fixtures/vault/投资研究/公司研究/示例公司（000001.SZ）调研/公司调研 - 示例公司.md`
- Create: `tests/smoke.test.mjs`

**Interfaces:**
- Produces npm commands `test`, `content:sync`, `content:validate`, `site:dev`, `site:build`, and `site:verify`.
- Pins Node to `>=24` and exact direct dependency versions in `package-lock.json`.

- [ ] **Step 1: Write the failing harness test**

```js
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs with Node 24 or newer', () => {
    expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(24)
  })
})
```

- [ ] **Step 2: Add the package definition**

```json
{
  "name": "invest-research-site",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "vitest run",
    "content:sync": "node scripts/sync-content.mjs",
    "content:validate": "node scripts/validate-content.mjs",
    "site:dev": "vitepress dev site",
    "site:build": "vitepress build site",
    "site:verify": "node scripts/verify-rendered.mjs"
  },
  "devDependencies": {
    "cheerio": "1.2.0",
    "markdown-it": "14.3.0",
    "vitepress": "1.6.4",
    "vitest": "4.1.10",
    "vue": "3.5.22"
  }
}
```

- [ ] **Step 3: Install locked dependencies and run the test**

Run: `npm install && npm test`

Expected: one passing test and a generated `package-lock.json`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore vitest.config.mjs tests
git commit -m "chore: scaffold deterministic site toolchain"
```

### Task 2: Allowlisted Content Synchronization

**Files:**
- Create: `scripts/lib/paths.mjs`
- Create: `scripts/lib/files.mjs`
- Create: `scripts/lib/security.mjs`
- Create: `scripts/lib/report-links.mjs`
- Create: `scripts/lib/sync.mjs`
- Create: `scripts/sync-content.mjs`
- Test: `tests/publisher/sync.test.mjs`
- Test: `tests/publisher/report-links.test.mjs`
- Test: `tests/publisher/security.test.mjs`

**Interfaces:**
- Produces `discoverPublicationFiles(sourceRoot): Promise<PublicationFile[]>`.
- Produces `buildReportLinkMap(markdownFiles): Map<string, string>`.
- Produces `rewriteReportLinks(markdown, linkMap, documentPath): { markdown, rewrites }`.
- Produces `syncResearch({ sourceRoot, siteRoot }): Promise<SyncResult>`.
- `PublicationFile` is `{ sourcePath, relativePath, kind: 'markdown'|'asset'|'csv', size, sourceSha256 }`.
- `SyncResult` is `{ files, rewrites, removedPaths, sourceRoot, generatedAt }`.

- [ ] **Step 1: Write failing allowlist and exclusion tests**

```js
it('publishes only research markdown, assets and csv files', async () => {
  const files = await discoverPublicationFiles(fixtureRoot)
  expect(files.map(file => file.relativePath)).toEqual([
    '投资研究/公司研究/示例公司（000001.SZ）调研/公司调研 - 示例公司.md',
    '投资研究/公司研究/示例公司（000001.SZ）调研/assets/chart.png',
    '投资研究/公司研究/示例公司（000001.SZ）调研/csv/annual.csv'
  ])
  expect(files.some(file => file.relativePath.includes('/reports/'))).toBe(false)
  expect(files.some(file => file.relativePath.includes('/data/'))).toBe(false)
})
```

- [ ] **Step 2: Implement normalized path classification**

```js
export function classifyPublicationPath(relativePath) {
  const normalized = relativePath.split('\\').join('/')
  const allowedRoot = normalized.startsWith('投资研究/公司研究/') ||
    normalized.startsWith('投资研究/产业专题/')
  if (!allowedRoot || normalized.split('/').some(part => part.startsWith('.'))) return null
  if (normalized.includes('/reports/') || normalized.includes('/data/')) return null
  if (normalized.endsWith('.md')) return 'markdown'
  if (normalized.includes('/assets/') && /\.(png|jpe?g|webp|gif|svg)$/i.test(normalized)) return 'asset'
  if (normalized.includes('/csv/') && normalized.endsWith('.csv')) return 'csv'
  return null
}
```

- [ ] **Step 3: Write failing PDF rewrite tests**

```js
it('rewrites a local report link to its authoritative URL', () => {
  const map = buildReportLinkMap([{ path: '财务报表.md', content: indexMarkdown }])
  const result = rewriteReportLinks('[年报](reports/2025.pdf)', map, '公司调研.md')
  expect(result.markdown).toBe('[年报](https://static.cninfo.com.cn/2025.pdf)')
})

it('fails when a local report has no authoritative mapping', () => {
  expect(() => rewriteReportLinks('[年报](reports/missing.pdf)', new Map(), '公司调研.md'))
    .toThrow(/missing authoritative report URL/)
})
```

- [ ] **Step 4: Implement per-company report mapping and deterministic rewriting**

Use Markdown link parsing to map each `reports/<name>.pdf` target to the external HTTP(S) PDF/source URL on the same table row or list line. Keep link text unchanged and record `{ document, from, to }` for every replacement.

- [ ] **Step 5: Write and implement security tests**

Reject first-line YAML delimiters, `[[wikilinks]]`, `![[embeds]]`, Obsidian callouts, `/Users/` paths, `../` paths escaping the research root, and high-confidence secret prefixes (`github_pat_`, `ghp_`, `sk-`, `AKIA`, private-key headers).

- [ ] **Step 6: Implement atomic synchronization**

Write into a temporary sibling directory, compare the complete file set, then rename it to `site/research`. Never partially mutate the live public content directory. Preserve Markdown bytes except recorded report-link target replacements; copy assets and CSV bytes unchanged.

- [ ] **Step 7: Run focused tests and commit**

Run: `npm test -- tests/publisher`

Expected: all synchronization, link, and security tests pass.

```bash
git add scripts tests/publisher
git commit -m "feat: add fail-closed research publisher"
```

### Task 3: Catalog, Navigation, and Additive Summary Pages

**Files:**
- Create: `scripts/lib/markdown.mjs`
- Create: `scripts/lib/catalog.mjs`
- Create: `scripts/lib/generated-pages.mjs`
- Create: `site/index.md`
- Test: `tests/catalog/catalog.test.mjs`
- Test: `tests/catalog/generated-pages.test.mjs`

**Interfaces:**
- Produces `parseResearchDocument(markdown, relativePath): ResearchDocument`.
- Produces `buildCatalog(publicationFiles): ResearchCatalog`.
- Produces `writeGeneratedPages({ catalog, siteRoot }): Promise<void>`.
- `ResearchDocument` includes `{ title, relativePath, kind, company, ticker, dataDate, summary, headings }`.
- `ResearchCatalog` includes `{ companies, industries, documents }` and stable VitePress links.

- [ ] **Step 1: Write failing metadata tests using real heading patterns**

```js
it('derives company identity without adding frontmatter', () => {
  const doc = parseResearchDocument(markdown, '投资研究/公司研究/中际旭创（300308.SZ）调研/公司调研 - 中际旭创.md')
  expect(doc.title).toBe('公司调研 - 中际旭创（300308.SZ）')
  expect(doc.company).toBe('中际旭创')
  expect(doc.ticker).toBe('300308.SZ')
  expect(doc.dataDate).toBe('2026-07-14')
})
```

- [ ] **Step 2: Implement AST-based metadata extraction**

Extract the first H1, folder identity, the first `数据核验日` or `数据日期`, and the first `先说结论` blockquote. Do not generate prose; summaries are exact text slices with a source anchor.

- [ ] **Step 3: Write failing grouping and navigation tests**

Verify that `公司调研`, `财务报表`, `股价预期`, `竞对对比`, and remaining Markdown files are assigned to deterministic navigation slots while every document remains reachable.

- [ ] **Step 4: Generate additive index pages**

Generate navigation/summary Markdown under `site/catalog/`; never replace files under `site/research`. Root and topic indexes render exact extracted summaries and links to complete documents.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/catalog`

Expected: all metadata, grouping, and reachability tests pass.

```bash
git add scripts site/index.md tests/catalog
git commit -m "feat: generate complete research catalog"
```

### Task 4: Three-Stage Integrity Verification

**Files:**
- Create: `scripts/lib/hash.mjs`
- Create: `scripts/lib/integrity.mjs`
- Create: `scripts/lib/rendered-integrity.mjs`
- Create: `scripts/validate-content.mjs`
- Create: `scripts/verify-rendered.mjs`
- Test: `tests/integrity/manifest.test.mjs`
- Test: `tests/integrity/semantic-equivalence.test.mjs`
- Test: `tests/integrity/rendered-output.test.mjs`

**Interfaces:**
- Produces `canonicalizeMarkdown(markdown): CanonicalDocument`.
- Produces `createIntegrityManifest(syncResult): IntegrityManifest`.
- Produces `verifyPublicCopy({ sourceRoot, siteRoot, manifest }): VerificationResult`.
- Produces `verifyRenderedSite({ siteRoot, distRoot, manifest }): VerificationResult`.
- `CanonicalDocument` contains ordered text blocks, headings, list items, quotes, table matrices, numeric/unit/date/source tokens, and `semanticSha256`.

- [ ] **Step 1: Write failing semantic-equivalence tests**

```js
it('detects one missing table cell', () => {
  const source = canonicalizeMarkdown('| 年度 | 收入 |\n|---|---:|\n| 2025 | 382.40 |')
  const changed = canonicalizeMarkdown('| 年度 | 收入 |\n|---|---:|\n| 2025 | |')
  expect(() => assertCanonicalEqual(source, changed)).toThrow(/table cell/)
})

it('ignores an allowed link target rewrite but preserves anchor text', () => {
  const source = canonicalizeMarkdown('[2025年报](reports/2025.pdf)')
  const published = canonicalizeMarkdown('[2025年报](https://example.com/2025.pdf)')
  expect(source.semanticSha256).toBe(published.semanticSha256)
})
```

- [ ] **Step 2: Implement ordered Markdown canonicalization**

Use markdown-it tokens to capture human-visible text and complete table matrices. Normalize only line-ending and insignificant whitespace; never normalize digits, punctuation, units, dates, currencies, percentages, or source grades.

- [ ] **Step 3: Implement the integrity manifest**

Write `site/public/research-manifest.json` with source/public paths, kind, sizes, source/public SHA-256, semantic SHA-256, table dimensions, numeric token counts, and recorded link rewrites.

- [ ] **Step 4: Write failing rendered-output tests**

Create fixture HTML with one omitted paragraph and assert `verifyRenderedSite` fails. Create complete VitePress-shaped HTML under `.vp-doc` and assert it passes after header-anchor and generated-summary nodes are removed.

- [ ] **Step 5: Implement HTML verification**

Use Cheerio to inspect the rendered `.vp-doc` content for every source Markdown page, compare ordered visible blocks and exact table matrices, then compare numeric/unit/date/source token multisets. Generated index pages are excluded from source equivalence but must pass link checks.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- tests/integrity`

Expected: all mutation-detection and complete-output tests pass.

```bash
git add scripts tests/integrity
git commit -m "feat: enforce end-to-end content integrity"
```

### Task 5: Mobile-First VitePress Site

**Files:**
- Create: `site/.vitepress/config.mjs`
- Create: `site/.vitepress/theme/index.mjs`
- Create: `site/.vitepress/theme/Layout.vue`
- Create: `site/.vitepress/theme/ResearchHome.vue`
- Create: `site/.vitepress/theme/ResearchTabs.vue`
- Create: `site/.vitepress/theme/styles.css`
- Create: `tests/site/config.test.mjs`
- Create: `tests/site/theme.test.mjs`

**Interfaces:**
- Consumes `ResearchCatalog` and generated index pages.
- Produces VitePress pages under `site/.vitepress/dist` with base `/invest-research-site/`.

- [ ] **Step 1: Write failing configuration tests**

Assert the base path, Chinese locale, local search, nav groups, global disclaimer, and dynamically generated sidebars match the catalog.

- [ ] **Step 2: Implement VitePress configuration**

Use `base: '/invest-research-site/'`, `lang: 'zh-CN'`, `cleanUrls: true`, local search, last-updated labels, GitHub source link, and catalog-derived sidebars.

- [ ] **Step 3: Implement B-layout components**

Render company summary cards and topic tabs as additive navigation. Each card links to the exact source document/heading. Every company document remains listed in the sidebar and an “全部材料” section.

- [ ] **Step 4: Implement responsive styles**

Use a readable mobile line length, 16px minimum body text, sticky topic tabs, collapsible navigation, full-width images, and `overflow-x: auto` table containers with a visible swipe hint. Never hide columns or rows with CSS.

- [ ] **Step 5: Build and run site tests**

Run: `npm test -- tests/site && npm run site:build`

Expected: tests pass and VitePress emits `site/.vitepress/dist/index.html`.

- [ ] **Step 6: Commit**

```bash
git add site tests/site
git commit -m "feat: add mobile-first research reading experience"
```

### Task 6: Import and Verify All Existing Research

**Files:**
- Generate: `site/research/**`
- Generate: `site/catalog/**`
- Generate: `site/public/research-manifest.json`
- Modify tests only when a newly discovered valid GFM pattern needs explicit supported behavior.

**Interfaces:**
- Consumes the live vault at `/Users/zhang/Documents/obsidian_vaults/invest` for the initial run.
- Produces a complete public copy of 36 Markdown files, 2 company topics, and 3 industry topics.

- [ ] **Step 1: Run the initial synchronization**

Run:

```bash
npm run content:sync -- --source /Users/zhang/Documents/obsidian_vaults/invest
```

Expected: 36 Markdown files plus all allowlisted assets/CSV files, no PDFs or raw `data/` files.

- [ ] **Step 2: Run full validation and build**

Run:

```bash
npm test
npm run content:validate
npm run site:build
npm run site:verify
```

Expected: zero failures; all source/public/rendered manifests reconcile.

- [ ] **Step 3: Inspect desktop and mobile pages**

Start `npm run site:dev -- --host 127.0.0.1`, then use browser automation at 1440×900 and 390×844 to verify homepage, search, 中际旭创 summary, full financial table, images, company cross-links, and one industry topic.

- [ ] **Step 4: Commit public content**

```bash
git add site/research site/catalog site/public/research-manifest.json
git commit -m "content: publish existing company and industry research"
```

### Task 7: Public GitHub Pages Workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Test: `tests/workflows/public-workflow.test.mjs`

**Interfaces:**
- Triggers on `main` push and `workflow_dispatch`.
- Produces a GitHub Pages deployment only after tests, content validation, build, and rendered integrity verification pass.

- [ ] **Step 1: Write a workflow structure test**

Assert the workflow uses Node 24, `npm ci`, `npm test`, content validation, build, rendered verification, Pages artifact upload, minimal deployment permissions, and non-cancelling Pages concurrency.

- [ ] **Step 2: Implement the workflow**

Follow the official VitePress Pages pattern with `actions/checkout@v5`, `actions/setup-node@v6`, `actions/configure-pages@v4`, `actions/upload-pages-artifact@v3`, and `actions/deploy-pages@v4`. Upload only `site/.vitepress/dist`.

- [ ] **Step 3: Test and commit**

Run: `npm test -- tests/workflows/public-workflow.test.mjs`

```bash
git add .github/workflows/deploy-pages.yml tests/workflows/public-workflow.test.mjs
git commit -m "ci: deploy verified research site to Pages"
```

### Task 8: Private Trigger, Repository-Scoped Authentication, and Live Launch

**Files:**
- Create in private vault: `.github/workflows/publish-research.yml`
- Create in public repo: `tests/workflows/private-workflow.test.mjs`
- Configure externally: public-repo write Deploy Key and private-repo `SITE_DEPLOY_KEY` secret.

**Interfaces:**
- Private workflow triggers on `master` pushes affecting company research, industry research, or itself, plus `workflow_dispatch`.
- Calls `node <site-checkout>/scripts/sync-content.mjs --source <vault-checkout> --site-root <site-checkout>/site`.
- Pushes `content: publish research from <private-sha>` only when the public copy changes.

- [ ] **Step 1: Write the private-workflow contract test**

Assert exact branch/path filters, manual dispatch, concurrency, SSH checkout of the public repository, validation before commit, and no PAT references.

- [ ] **Step 2: Implement the private workflow**

Checkout the private repository normally, checkout `teazean/invest-research-site` into `site-repo` using `${{ secrets.SITE_DEPLOY_KEY }}`, install locked site dependencies, run synchronization and validation, then commit/push only a non-empty diff.

- [ ] **Step 3: Generate and install a scoped deploy key**

Generate a new Ed25519 key pair with no passphrase in a temporary directory. Add the public key to `teazean/invest-research-site` with write access; store the private key as the `SITE_DEPLOY_KEY` Actions secret on `teazean/obsidian-vault-invest`; remove the temporary local key files after both API calls succeed.

- [ ] **Step 4: Run all local verification**

Run:

```bash
npm test
npm run content:validate
npm run site:build
npm run site:verify
git status --short
```

Expected: tests and checks pass; only the intended private-workflow change remains in the vault repository.

- [ ] **Step 5: Push both repositories**

Push public `main`, then commit and push the private workflow on `master`. Trigger the private workflow manually once to prove full cross-repository synchronization.

- [ ] **Step 6: Verify GitHub Actions and the live site**

Use `gh run watch`/`gh run view --log-failed` for both workflows. Verify HTTPS and HTTP 200 for the root, 中际旭创 main page, its financial page, and one industry page; run a mobile browser smoke test against the deployed URL.

- [ ] **Step 7: Record launch evidence**

Update `README.md` with architecture, public URL, included/excluded content, automatic trigger behavior, local verification commands, and failure recovery. Commit and push only after final verification passes.
