# Private Attachment Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every vault-local image, SVG, CSV, and PDF click target an authenticated absolute private GitHub blob URL while keeping inline images public and eliminating SPA-only attachment 404s.

**Architecture:** Rewrite local attachment destinations in the private-to-public Markdown synchronization stage so VitePress compiles the same absolute click target into server HTML and client JavaScript. Keep public image sources and CSV copies for rendering and byte verification, keep PDFs private, and replace the post-build HTML mutation with build-artifact validation.

**Tech Stack:** Node.js 24, ESM, Vitest 4, Markdown-it 14, VitePress 1.6, Cheerio 1.2, GitHub Actions, GitHub Pages.

## Global Constraints

- Local attachment click targets under `assets/`, `csv/`, and `reports/` must use `https://github.com/teazean/obsidian-vault-invest/blob/master/...`.
- Inline images must remain visible through public VitePress hashed assets.
- Direct HTTP(S) citations and Markdown links to research notes must remain unchanged.
- Visible text, headings, tables, numbers, image bytes, and CSV bytes must remain semantically or byte-for-byte identical.
- A referenced local attachment must exist and remain inside its company or industry topic after percent decoding and normalization.
- No PDF may be copied into the public repository or Pages artifact.
- Every behavior change must follow a red-green-refactor test cycle.

---

### Task 1: Source-Preserving Attachment Link Transformer

**Files:**
- Create: `scripts/lib/attachment-links.mjs`
- Create: `tests/publisher/attachment-links.test.mjs`
- Delete after replacement: `scripts/lib/report-links.mjs`
- Delete after replacement: `tests/publisher/report-links.test.mjs`

**Interfaces:**
- Consumes: `markdown: string`, `documentPath: string`, `attachmentPaths: Set<string>`, `privateRepository: { repository: string, ref: string, serverUrl?: string }`.
- Produces: `rewriteAttachmentLinks(markdown, { documentPath, attachmentPaths, privateRepository }) -> { markdown: string, rewrites: Array<{ document, from, to, kind }> }`.
- Produces: `privateBlobUrl({ documentPath, target, attachmentPaths, privateRepository }) -> { url, resolvedPath, suffix, kind } | null`.

- [ ] **Step 1: Write failing tests for all link-policy classes**

Create the test fixture and first two expectations exactly as follows:

```js
import { describe, expect, it } from 'vitest'
import { rewriteAttachmentLinks } from '../../scripts/lib/attachment-links.mjs'

const privateRepository = {
  repository: 'teazean/obsidian-vault-invest',
  ref: 'master',
  serverUrl: 'https://github.com'
}
const documentPath = '投资研究/产业专题/光伏产业/光伏产业深度调研.md'
const attachmentPaths = new Set([
  '投资研究/产业专题/光伏产业/assets/利润状态 图.png',
  '投资研究/产业专题/光伏产业/assets/利润状态图.svg',
  '投资研究/产业专题/光伏产业/csv/利润池.csv',
  '投资研究/产业专题/光伏产业/reports/行业报告.pdf'
])

it('wraps a bare image with a private blob link and preserves its image source', () => {
  const result = rewriteAttachmentLinks('![利润图](assets/利润状态 图.png)', {
    documentPath, attachmentPaths, privateRepository
  })
  expect(result.markdown).toBe(
    '[![利润图](assets/利润状态 图.png)](' +
    'https://github.com/teazean/obsidian-vault-invest/blob/master/' +
    '%E6%8A%95%E8%B5%84%E7%A0%94%E7%A9%B6/%E4%BA%A7%E4%B8%9A%E4%B8%93%E9%A2%98/' +
    '%E5%85%89%E4%BC%8F%E4%BA%A7%E4%B8%9A/assets/' +
    '%E5%88%A9%E6%B6%A6%E7%8A%B6%E6%80%81%20%E5%9B%BE.png)'
  )
  expect(result.rewrites).toHaveLength(1)
})

it.each([
  ['[SVG](assets/利润状态图.svg)', 'asset'],
  ['[CSV](csv/利润池.csv)', 'csv'],
  ['[PDF](reports/行业报告.pdf#page=6)', 'report']
])('rewrites %s to the private repository', (markdown, kind) => {
  const result = rewriteAttachmentLinks(markdown, {
    documentPath, attachmentPaths, privateRepository
  })
  expect(result.markdown).toContain('https://github.com/teazean/obsidian-vault-invest/blob/master/')
  expect(result.rewrites[0].kind).toBe(kind)
})
```

Add separate cases proving that percent-encoded Chinese paths are encoded once, fragments are preserved, direct HTTP(S) and `.md` links remain byte-identical, an explicitly external-linked image remains deliberate, and code fences/inline code are not changed. Add rejection cases for malformed encoding, missing files, literal and encoded traversal, cross-topic paths, invalid repository names, and missing refs.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/publisher/attachment-links.test.mjs
```

Expected: FAIL because `scripts/lib/attachment-links.mjs` does not exist.

- [ ] **Step 3: Implement the source-preserving scanner and URL builder**

Implement:

```js
export function privateBlobUrl({ documentPath, target, attachmentPaths, privateRepository })
export function rewriteAttachmentLinks(markdown, options)
```

The module scans links outside fenced/inline code without reserializing Markdown; recognizes bare images, ordinary links, and explicitly linked images; resolves only `assets`, `csv`, and `reports`; separates suffixes; decodes once; normalizes with `path.posix`; checks topic containment and attachment-set membership; encodes each GitHub segment once; applies replacements from the end; wraps only bare local images; and records `{ document, from, to, kind }`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run tests/publisher/attachment-links.test.mjs
```

Expected: all transformer tests pass with no warnings.

- [ ] **Step 5: Remove the report-only transformer and commit**

Run:

```bash
git rm scripts/lib/report-links.mjs tests/publisher/report-links.test.mjs
git add scripts/lib/attachment-links.mjs tests/publisher/attachment-links.test.mjs
git commit -m "feat: rewrite local attachment links privately"
```

---

### Task 2: Synchronizer, CLI, and Manifest Integration

**Files:**
- Modify: `scripts/lib/files.mjs`
- Modify: `scripts/lib/sync.mjs`
- Modify: `scripts/lib/cli.mjs`
- Modify: `scripts/lib/manifest.mjs`
- Modify: `scripts/sync-content.mjs`
- Modify: `tests/publisher/sync.test.mjs`
- Modify: `tests/publisher/cli.test.mjs`
- Modify: `tests/catalog/publish.test.mjs`
- Modify: `tests/integrity/manifest.test.mjs`

**Interfaces:**
- Produces: `discoverAttachmentPaths(sourceRoot) -> Promise<Set<string>>`, including private PDFs that are not publication files.
- Renames publisher context: `privateReports` to `privateRepository`.
- Adds manifest field: `privateRepository: { repository, ref, serverUrl }`.

- [ ] **Step 1: Add failing synchronization and manifest tests**

Extend the sync fixture with a PNG, CSV, private PDF, a Markdown file referencing all three, and an unchanged official HTTPS link. Assert three private blob targets, the unchanged local inner image source, unchanged official URL, copied image/CSV bytes, no public PDF, three rewrite kinds, and no absolute local filesystem path in the manifest.

Update CLI expectations to:

```js
privateRepository: {
  repository: 'teazean/obsidian-vault-invest',
  ref: 'master',
  serverUrl: 'https://github.com'
}
```

- [ ] **Step 2: Run integration tests and verify RED**

Run:

```bash
npx vitest run tests/publisher/sync.test.mjs tests/publisher/cli.test.mjs tests/catalog/publish.test.mjs tests/integrity/manifest.test.mjs
```

Expected: failures reference report-only rewriting, `privateReports`, and missing attachment inventory/manifest context.

- [ ] **Step 3: Implement discovery and synchronization**

Refactor the existing filesystem walk in `files.mjs` and export `discoverAttachmentPaths`. Include allowed images/SVG under `assets`, `.csv` under `csv`, and `.pdf` under `reports` within both research roots. Do not add reports to `discoverPublicationFiles`.

In `sync.mjs`, build the attachment set once, call `rewriteAttachmentLinks` for every Markdown file, preserve atomic directory replacement, return `privateRepository`, and remove report URL maps. Rename the CLI property and output counter to `privateRepository` and `attachmentLinkRewrites`. Serialize repository context and rewrites in the manifest without serializing source absolute paths.

- [ ] **Step 4: Run integration tests and verify GREEN**

Run:

```bash
npx vitest run tests/publisher/sync.test.mjs tests/publisher/cli.test.mjs tests/catalog/publish.test.mjs tests/integrity/manifest.test.mjs
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit the integrated publisher**

Run:

```bash
git add scripts/lib/files.mjs scripts/lib/sync.mjs scripts/lib/cli.mjs scripts/lib/manifest.mjs scripts/sync-content.mjs tests/publisher/sync.test.mjs tests/publisher/cli.test.mjs tests/catalog/publish.test.mjs tests/integrity/manifest.test.mjs
git commit -m "feat: publish private attachment targets"
```

---

### Task 3: Make HTML and Client Rendering Share the Same Link

**Files:**
- Modify: `scripts/lib/site-config.mjs`
- Modify: `scripts/lib/build-assets.mjs`
- Modify: `tests/site/config.test.mjs`
- Modify: `tests/build/build-assets.test.mjs`
- Modify: `tests/integrity/rendered-output.test.mjs`

**Interfaces:**
- The Markdown renderer decorates an existing image anchor but never creates or changes its destination.
- `verifyBuiltResearchAssets({ distRoot, manifest, siteBase })` validates image sources and private click targets in HTML and emitted JS.

- [ ] **Step 1: Write failing renderer and build tests**

Render synchronized Markdown and assert the existing private anchor receives the research class without changing its URL:

```js
const html = md.render(
  '[![趋势图](assets/trend.png)](' +
  'https://github.com/teazean/obsidian-vault-invest/blob/master/' +
  '%E6%8A%95%E8%B5%84%E7%A0%94%E7%A9%B6/assets/trend.png)'
)
expect(html).toContain('class="research-image-link"')
expect(html).toContain('target="_blank"')
expect(html).toContain('<img src="assets/trend.png" alt="趋势图">')
```

Update the build fixture to use a public hashed `img src` and private blob `href`. Add a client JS fixture containing a relative `research-image-link` and assert rejection with `client image link must use private GitHub blob URL`; replace it with the private URL and assert success.

- [ ] **Step 2: Run renderer/build tests and verify RED**

Run:

```bash
npx vitest run tests/site/config.test.mjs tests/build/build-assets.test.mjs tests/integrity/rendered-output.test.mjs
```

Expected: current renderer synthesizes a relative link, current finalizer overwrites private hrefs, and current verifier misses the client chunk.

- [ ] **Step 3: Replace mutation with invariant checks**

In `site-config.mjs`, remove the image rule that creates `href` from `src`. Decorate an existing image-containing `link_open` with `research-image-link`, `_blank`, and `noreferrer`, preserving `href`.

In `build-assets.mjs`, stop writing HTML; verify each image anchor and public hashed `src`; require each `href` to use the private blob prefix from `manifest.privateRepository`; scan emitted JS for image anchors and enforce the same prefix; retain CSV publication/byte checks; and return `{ htmlFiles, imageLinks, clientImageLinks, csvFiles }`.

- [ ] **Step 4: Run renderer/build tests and verify GREEN**

Run:

```bash
npx vitest run tests/site/config.test.mjs tests/build/build-assets.test.mjs tests/integrity/rendered-output.test.mjs
```

Expected: all selected tests pass, including the SPA client regression.

- [ ] **Step 5: Commit the rendering fix**

Run:

```bash
git add scripts/lib/site-config.mjs scripts/lib/build-assets.mjs tests/site/config.test.mjs tests/build/build-assets.test.mjs tests/integrity/rendered-output.test.mjs
git commit -m "fix: keep attachment links stable across navigation"
```

---

### Task 4: Full-Corpus Migration, Documentation, and Release

**Files:**
- Modify: `README.md`
- Generate: `site/index.md`
- Generate: `site/catalog/**`
- Generate: `site/research/**`
- Generate: `site/public/research-manifest.json`

**Interfaces:**
- Uses: `node scripts/sync-content.mjs --source /Users/zhang/Documents/obsidian_vaults/invest --site-root /Users/zhang/invest_codex/invest-research-site/site --private-repository teazean/obsidian-vault-invest --private-ref master`.
- Produces: a regenerated corpus and Pages deployment with no local attachment click targets.

- [ ] **Step 1: Document the policy**

Add:

```markdown
### Attachment links

Inline research images are published as verified GitHub Pages assets so articles remain readable. Clicking a vault-local image, SVG, CSV, or PDF opens the corresponding `blob/master` path in the private `teazean/obsidian-vault-invest` repository. The reader must be logged into a GitHub account with repository access. Direct official-source links remain unchanged.
```

- [ ] **Step 2: Run the complete publication**

Run:

```bash
npm ci
git -C /Users/zhang/Documents/obsidian_vaults/invest fetch origin master
private_sha=$(git -C /Users/zhang/Documents/obsidian_vaults/invest rev-parse origin/master)
snapshot=$(mktemp -d /tmp/invest-vault-publication.XXXXXX)
git -C /Users/zhang/Documents/obsidian_vaults/invest archive "$private_sha" | tar -x -C "$snapshot"
node scripts/sync-content.mjs \
  --source "$snapshot" \
  --site-root /Users/zhang/invest_codex/invest-research-site/site \
  --private-repository teazean/obsidian-vault-invest \
  --private-ref master
npm test
npm run content:validate
npm run site:build
npm run site:verify
rm -rf "$snapshot"
```

Expected: the generated corpus corresponds exactly to the fetched private `origin/master` commit; all tests and validators pass; build/verify report HTML, image, client-image, and CSV counts; no PDF exists below `site/research` or `site/.vitepress/dist`.

- [ ] **Step 3: Audit generated targets**

Run an audit over public Markdown and built HTML/JS. It must find zero local clickable `assets`, `csv`, or `reports` targets; more than zero private attachment targets; zero missing public images; and zero public PDFs. Record exact real-corpus counts.

- [ ] **Step 4: Commit generated content**

Run:

```bash
git add README.md site/index.md site/catalog site/research site/public/research-manifest.json
git commit -m "content: migrate attachment links to private blobs"
```

- [ ] **Step 5: Push and execute both workflows**

Run:

```bash
git push origin main
gh workflow run "Publish research to public site" -R teazean/obsidian-vault-invest --ref master
private_sha=$(gh api repos/teazean/obsidian-vault-invest/commits/master --jq .sha)
private_run_id=$(gh run list -R teazean/obsidian-vault-invest --workflow "Publish research to public site" --limit 20 --json databaseId,headSha | jq -r --arg sha "$private_sha" 'map(select(.headSha == $sha)) | first | .databaseId')
gh run watch "$private_run_id" -R teazean/obsidian-vault-invest --exit-status
pages_run_id=$(gh run list -R teazean/invest-research-site --limit 20 --json databaseId,displayTitle | jq -r --arg sha "$private_sha" 'map(select(.displayTitle | contains($sha))) | first | .databaseId')
gh run watch "$pages_run_id" -R teazean/invest-research-site --exit-status
```

Require both resolved run IDs to be nonempty before watching them; if either lookup returns `null`, stop and inspect `gh run list` rather than watching an older run.

- [ ] **Step 6: Verify the live photovoltaic page**

Test both direct loading and home -> 产业专题 -> 光伏产业 -> 光伏产业深度调研 SPA navigation. In both paths, assert the image is visible, the anchor begins with the private blob prefix, no `teazean.github.io/.../assets/...` click occurs, authenticated GitHub resolves the private path, and live index/manifest return HTTP 200. Finish with a remote full-corpus attachment audit.
