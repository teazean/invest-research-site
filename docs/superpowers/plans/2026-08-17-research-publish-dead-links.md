# Research Publish Dead-Link Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the private-vault-to-public-site workflow so the innovation-drug research is published, while private `sources/*.html` snapshots remain private and strict VitePress dead-link checks remain enabled.

**Architecture:** Extend both sides of the existing attachment boundary: filesystem discovery inventories private source snapshots without publishing them, and the Markdown transformer rewrites eligible links to authenticated GitHub blob URLs. Correct the one invalid directory link in the vault, validate the complete current corpus in an isolated worktree, then fast-forward the publisher to `main` before pushing the vault commit that triggers publication.

**Tech Stack:** Node.js 24, ES modules, Vitest 4, VitePress 1.6, Git, GitHub Actions, GitHub Pages.

## Global Constraints

- Only `.html` and `.htm` files under a `sources/` path inside an allowlisted company or industry topic are private source attachments.
- Source HTML must be present in `discoverAttachmentPaths` so missing targets fail closed, but absent from `discoverPublicationFiles`, the public repository, and the Pages artifact.
- Existing topic-containment, percent-decoding, URL-encoding, repository-context, fenced-code, and inline-code behavior must remain unchanged.
- Direct HTTP(S) links, Markdown research-note links, and HTML files outside `sources/` must remain unchanged.
- VitePress dead-link checks must not be disabled or relaxed.
- Do not change the innovation-drug research content.
- In the vault repository, stage only the Tencent financial-note correction. Preserve and report the existing local commit `a7b1461` separately before pushing `master`.
- Every code behavior change follows red-green TDD, and every success claim must be backed by fresh command output.

---

### Task 1: Discover Private HTML Sources Without Publishing Them

**Files:**
- Modify: `scripts/lib/paths.mjs`
- Modify: `tests/publisher/sync.test.mjs`

**Interfaces:**
- `classifyAttachmentPath(relativePath)` returns `source` for allowlisted research paths containing `/sources/` and ending in `.html` or `.htm`.
- `classifyPublicationPath(relativePath)` returns `null` for both `report` and `source` attachments.
- `discoverAttachmentPaths(sourceRoot)` includes private source HTML; `discoverPublicationFiles(sourceRoot)` excludes it.

- [ ] **Step 1: Add a failing discovery test**

In `fixture()`, create the source directory and two files:

```js
await mkdir(path.join(company, 'sources'), { recursive: true })
await writeFile(path.join(company, 'sources/官方快照.html'), '<html>private</html>')
await writeFile(path.join(company, 'sources/旧版快照.htm'), '<html>private</html>')
```

Extend `discovers only allowlisted publication files` so the public-file expectation remains unchanged, while `discoverAttachmentPaths` additionally contains:

```js
'投资研究/公司研究/示例公司（000001.SZ）调研/sources/官方快照.html',
'投资研究/公司研究/示例公司（000001.SZ）调研/sources/旧版快照.htm'
```

Also assert that neither source snapshot appears in `discoverPublicationFiles`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/publisher/sync.test.mjs -t "discovers only allowlisted publication files"
```

Expected: FAIL because `discoverAttachmentPaths` does not classify either source snapshot.

- [ ] **Step 3: Implement the minimal filesystem classifier**

In `scripts/lib/paths.mjs`, add:

```js
const HTML_EXTENSION = /\.html?$/i
```

Extend `classifyAttachmentPath`:

```js
if (normalized.includes('/sources/') && HTML_EXTENSION.test(normalized)) return 'source'
```

Keep source snapshots private in `classifyPublicationPath`:

```js
return attachmentKind === 'report' || attachmentKind === 'source' ? null : attachmentKind
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run tests/publisher/sync.test.mjs -t "discovers only allowlisted publication files"
```

Expected: PASS; both HTML variants are discoverable attachments and neither is a publication file.

---

### Task 2: Rewrite Source-Snapshot Links to Private Blob URLs

**Files:**
- Modify: `scripts/lib/attachment-links.mjs`
- Modify: `tests/publisher/attachment-links.test.mjs`
- Modify: `tests/publisher/sync.test.mjs`

**Interfaces:**
- `privateBlobUrl(...)` returns `{ url, resolvedPath, suffix, kind: 'source' }` for an existing same-topic `sources/*.html` or `sources/*.htm` target.
- `rewriteAttachmentLinks(...)` records a `source` rewrite and preserves a query or fragment.
- `syncResearch(...)` rewrites the link without copying the HTML file.

- [ ] **Step 1: Add failing transformer tests**

Add both source files to the unit-test `attachmentPaths` set, then extend the parameterized rewrite cases with:

```js
['[HTML](sources/官方快照.html#证据)', 'source']
```

Assert that the generated target contains `/sources/%E5%AE%98%E6%96%B9%E5%BF%AB%E7%85%A7.html#证据)` and that `result.rewrites[0].kind` is `source`. The existing transformer preserves query/fragment suffixes verbatim.

Add a negative case proving that an existing HTML file outside `sources/` is not rewritten:

```js
it('does not rewrite HTML outside the sources directory', () => {
  const markdown = '[专题页](pages/专题.html)'
  expect(rewrite(markdown, {
    attachmentPaths: new Set([
      '投资研究/产业专题/光伏产业/pages/专题.html'
    ])
  })).toEqual({ markdown, rewrites: [] })
})
```

- [ ] **Step 2: Run the transformer test and verify RED**

Run:

```bash
npx vitest run tests/publisher/attachment-links.test.mjs
```

Expected: the source rewrite case fails because `.html` is not a recognized attachment; existing tests and the outside-`sources` negative case remain green.

- [ ] **Step 3: Implement the minimal Markdown classifier**

In `scripts/lib/attachment-links.mjs`, add:

```js
const HTML_EXTENSION = /\.html?$/i
```

Extend `attachmentKind(decodedPath)` after the existing report rule:

```js
if (segments.includes('sources') && HTML_EXTENSION.test(decodedPath)) return 'source'
```

Do not change path resolution, topic-boundary validation, existence validation, repository validation, Markdown scanning, or URL construction.

- [ ] **Step 4: Extend the synchronization integration test**

In the sync fixture's company-research Markdown, add:

```md
[官方快照](sources/官方快照.html)
```

In `copies public files and rewrites every local attachment click privately`, assert:

```js
expect(publicMarkdown).toContain('[官方快照](https://github.com/teazean/obsidian-vault-invest/blob/master/')
await expect(stat(path.join(publicRoot, 'sources/官方快照.html')))
  .rejects.toMatchObject({ code: 'ENOENT' })
expect(new Set(result.rewrites.map(rewrite => rewrite.kind)))
  .toEqual(new Set(['asset', 'csv', 'report', 'source']))
```

Update the expected rewrite count to include the source link.

- [ ] **Step 5: Run focused and complete tests**

Run:

```bash
npx vitest run tests/publisher/attachment-links.test.mjs tests/publisher/sync.test.mjs
npm test
git diff --check
```

Expected: all tests pass, there are no whitespace errors, and no HTML source snapshot is copied publicly.

- [ ] **Step 6: Commit the publisher fix**

Run:

```bash
git add scripts/lib/paths.mjs scripts/lib/attachment-links.mjs \
  tests/publisher/attachment-links.test.mjs tests/publisher/sync.test.mjs
git diff --cached --check
git commit -m "fix: rewrite private HTML source links"
```

---

### Task 3: Remove the Invalid Vault Directory Link

**Files:**
- Modify in `/Users/zhang/Documents/obsidian_vaults/invest`: `投资研究/公司研究/腾讯控股（0700.HK）调研/财务报表 - 腾讯控股.md`

**Interfaces:**
- The explanatory sentence points readers to the existing table instead of linking to a directory with no public index.
- The four valid `sources/*.html` links in the Tencent technology note remain unchanged.

- [ ] **Step 1: Record the vault baseline and isolate the target**

Run:

```bash
git -C /Users/zhang/Documents/obsidian_vaults/invest status --short --branch
git -C /Users/zhang/Documents/obsidian_vaults/invest log --oneline origin/master..HEAD
```

Expected: `master` is ahead by the existing morning-brief commit `a7b1461`; no uncommitted files are present. If the state differs, stop and inspect before editing.

- [ ] **Step 2: Apply the single content correction**

Replace:

```md
- 财报原文：[reports](reports/)
```

with:

```md
- 财报原文：详见本页“已保存原始报告”表中的“本地快照”和“官方来源”列。
```

- [ ] **Step 3: Verify the target and preserved source links**

Run:

```bash
rg -n "\]\(reports/\)" "/Users/zhang/Documents/obsidian_vaults/invest/投资研究/公司研究/腾讯控股（0700.HK）调研"
rg -n "sources/(Hy3_official|Hy3_preview|AIM_ad_case|Omdia_2025Q3_china_cloud_syndication)\.html" "/Users/zhang/Documents/obsidian_vaults/invest/投资研究/公司研究/腾讯控股（0700.HK）调研/技术与壁垒 - 腾讯控股.md"
git -C /Users/zhang/Documents/obsidian_vaults/invest diff --check
```

Expected: the first search has no matches, the second reports exactly four preserved links, and `diff --check` is clean.

- [ ] **Step 4: Commit only the corrected note**

Run:

```bash
git -C /Users/zhang/Documents/obsidian_vaults/invest add -- \
  "投资研究/公司研究/腾讯控股（0700.HK）调研/财务报表 - 腾讯控股.md"
git -C /Users/zhang/Documents/obsidian_vaults/invest diff --cached --name-only
git -C /Users/zhang/Documents/obsidian_vaults/invest commit -m "fix: remove invalid reports directory link"
```

Expected: exactly one staged path before the commit.

---

### Task 4: Validate the Current Corpus in an Isolated Publication Tree

**Files:**
- No additional source edits expected.
- Temporary public-site worktree and vault archive under `/tmp`.

**Interfaces:**
- Consumes the public-site branch `HEAD` and vault `HEAD` as immutable snapshots.
- Produces a synchronized temporary site that passes tests, content validation, VitePress build, and rendered-output verification.

- [ ] **Step 1: Create isolated snapshots**

Run:

```bash
PUBLIC_FIXTURE=$(mktemp -d /tmp/invest-research-site-validation.XXXXXX)
VAULT_FIXTURE=$(mktemp -d /tmp/invest-vault-validation.XXXXXX)
git worktree add --detach "$PUBLIC_FIXTURE" HEAD
git -C /Users/zhang/Documents/obsidian_vaults/invest archive HEAD | tar -x -C "$VAULT_FIXTURE"
npm ci --prefix "$PUBLIC_FIXTURE"
```

- [ ] **Step 2: Synchronize the complete vault snapshot**

Run:

```bash
node "$PUBLIC_FIXTURE/scripts/sync-content.mjs" \
  --source "$VAULT_FIXTURE" \
  --site-root "$PUBLIC_FIXTURE/site" \
  --private-repository teazean/obsidian-vault-invest \
  --private-ref master
```

Expected: synchronization succeeds, reports at least four `source` attachment rewrites indirectly through the increased rewrite count, and emits no missing-target error.

- [ ] **Step 3: Prove the Tencent outputs have no failing local routes**

Run:

```bash
rg -n "\]\((?:\./)?reports/?\)|\]\(sources/.*\.html?" \
  "$PUBLIC_FIXTURE/site/research/公司研究/腾讯控股（0700.HK）调研"
rg -n "github\.com/teazean/obsidian-vault-invest/blob/master/.*/sources/.*\.html?" \
  "$PUBLIC_FIXTURE/site/research/公司研究/腾讯控股（0700.HK）调研/技术与壁垒 - 腾讯控股.md"
find "$PUBLIC_FIXTURE/site/research" -type f \( -name '*.html' -o -name '*.htm' \)
```

Expected: the first and third commands have no output; the second reports four private GitHub blob links.

- [ ] **Step 4: Run every local publication gate**

Run:

```bash
npm --prefix "$PUBLIC_FIXTURE" test
npm --prefix "$PUBLIC_FIXTURE" run content:validate
npm --prefix "$PUBLIC_FIXTURE" run site:build
npm --prefix "$PUBLIC_FIXTURE" run site:verify
```

Expected: every command exits zero and VitePress reports no dead links.

- [ ] **Step 5: Clean up only the exact temporary targets**

Run:

```bash
git worktree remove "$PUBLIC_FIXTURE"
rm -rf -- "$VAULT_FIXTURE"
```

Before the `rm`, confirm `VAULT_FIXTURE` starts with `/tmp/invest-vault-validation.`.

---

### Task 5: Publish the Fix and Verify GitHub Actions and Pages

**Files:**
- Public-site branch commits, pushed by fast-forward to `teazean/invest-research-site:main`.
- Vault `master` commits, pushed to `teazean/obsidian-vault-invest:master`.
- Generated research content, committed by the private vault workflow.

**Interfaces:**
- The vault workflow checks out public-site `main`, so the publisher fix must reach `main` before the vault push.
- The vault research-note commit triggers `Publish research to public site` through its path filter.

- [ ] **Step 1: Run final publisher verification and confirm fast-forward safety**

Run:

```bash
npm test
git diff --check
git status --short --branch
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
```

Expected: tests pass, the worktree is clean, and the branch is a fast-forward descendant of the current remote `main`. If the ancestry check fails, stop and reconcile; do not force-push.

- [ ] **Step 2: Push the approved publisher branch directly to `main`**

Because the publication workflow consumes `invest-research-site:main` and the user explicitly authorized remote publication, push the verified fast-forward result:

```bash
git push origin HEAD:main
git ls-remote --heads origin main
```

Expected: remote `main` points to the verified publisher commit; no force option is used.

- [ ] **Step 3: Report the pre-existing vault commit, then push vault `master`**

Before pushing, state explicitly that the vault range contains both:

- pre-existing `a7b1461` (`vault backup: 2026-08-17 08:43:05`, morning-brief update);
- the new Tencent dead-link correction.

Then run:

```bash
git -C /Users/zhang/Documents/obsidian_vaults/invest status --short --branch
git -C /Users/zhang/Documents/obsidian_vaults/invest log --oneline origin/master..HEAD
git -C /Users/zhang/Documents/obsidian_vaults/invest push origin master
```

Expected: a normal fast-forward push; no uncommitted file is included.

- [ ] **Step 4: Monitor the research publication workflow**

Run:

```bash
VAULT_SHA=$(git -C /Users/zhang/Documents/obsidian_vaults/invest rev-parse HEAD)
gh run list --repo teazean/obsidian-vault-invest \
  --workflow "Publish research to public site" --commit "$VAULT_SHA" --limit 3
PUBLISH_RUN_ID=$(gh run list --repo teazean/obsidian-vault-invest \
  --workflow "Publish research to public site" --commit "$VAULT_SHA" \
  --json databaseId --jq '.[0].databaseId')
gh run watch "$PUBLISH_RUN_ID" --repo teazean/obsidian-vault-invest --exit-status
```

Expected: synchronization, tests, validation, VitePress build, rendered verification, and public-content push all succeed. If `PUBLISH_RUN_ID` is empty because GitHub has not registered the run yet, repeat the two `gh run list` commands after a short interval instead of watching an unrelated run.

- [ ] **Step 5: Verify the generated innovation-drug content in the public repository**

Run:

```bash
git fetch origin main
git log --oneline --decorate -3 origin/main
git ls-tree -r --name-only origin/main | rg "创新药"
```

Expected: `origin/main` contains a bot commit named `content: publish research from <vault SHA>` and the innovation-drug overview/catalog files.

- [ ] **Step 6: Monitor Pages deployment and verify the rendered site**

Run:

```bash
gh run list --repo teazean/invest-research-site --limit 5
gh api repos/teazean/invest-research-site/pages --jq .html_url
```

Wait for the deployment triggered by the bot content commit to succeed, then open `http://teazean.github.io/invest-research-site/` and verify that the innovation-drug entry and overview render. Check that Tencent source-snapshot links point to private `github.com/teazean/obsidian-vault-invest/blob/master/.../sources/*.html` URLs rather than local Pages routes.

## Final Verification Checklist

- [ ] Focused red-green evidence was captured for source discovery and Markdown rewriting.
- [ ] `npm test`, `content:validate`, `site:build`, and `site:verify` all passed against the current complete vault snapshot.
- [ ] No `.html` or `.htm` source snapshot was copied into public research content.
- [ ] The public publisher was fast-forwarded to `main` before the vault trigger commit was pushed.
- [ ] The vault push range was disclosed and contained no uncommitted files.
- [ ] The private publication workflow and public Pages deployment both succeeded.
- [ ] The innovation-drug research is visible on GitHub and the rendered site.
