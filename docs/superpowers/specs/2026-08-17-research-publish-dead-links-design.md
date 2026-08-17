# Research Publish Dead-Link Repair Design

## Context

The private vault already contains the innovation-drug research on `master`, but the `Publish research to public site` workflow fails before it can commit synchronized content to `teazean/invest-research-site`. The failure is reproducible with the current vault and public-site publisher.

The build reports five dead links:

- one directory link to `reports/` in the Tencent financial-report note;
- four local HTML snapshot links under `sources/` in the Tencent technology note.

PDF, image, and CSV attachments are already rewritten to authenticated private-repository blob URLs. HTML source snapshots are not classified as attachments, so they remain relative VitePress routes even though the publisher does not copy HTML files into the public corpus.

## Goal

Restore the private-vault-to-public-site publishing pipeline without weakening dead-link validation, while preserving authenticated access to local HTML source snapshots and allowing the innovation-drug research to appear on the public website.

## Non-goals

- Do not disable or relax VitePress dead-link checks.
- Do not publish private HTML snapshot contents into the public repository.
- Do not refactor unrelated synchronization, catalog, build, or deployment behavior.
- Do not change the innovation-drug research content.

## Considered approaches

### 1. Extend the attachment rewriter and fix the directory link — selected

Recognize `.html` and `.htm` files under a research topic's `sources/` directory as private attachments. Rewrite their Markdown links to authenticated GitHub blob URLs using the same repository/ref context already used for PDFs, CSVs, and images. Replace the Tencent note's `reports/` directory link with explanatory text pointing readers to the existing report table.

This is reusable, preserves source access, and keeps strict dead-link validation.

### 2. Hard-code GitHub blob URLs in research Markdown

This avoids publisher changes but duplicates repository and branch information throughout research notes. It is fragile when repositories, branches, or paths change.

### 3. Ignore the dead links in VitePress

This restores the build fastest but hides genuine content-integrity regressions. It is rejected.

## Architecture

### Attachment classification

`scripts/lib/attachment-links.mjs` remains the single boundary for deciding which local Markdown targets are private attachments. It will add one classification rule:

- a target whose resolved path contains a `sources` segment and ends in `.html` or `.htm` has attachment kind `source`.

All existing path normalization, topic-boundary checks, existence checks, repository validation, URL encoding, code-fence exclusion, and Markdown-link preservation continue unchanged.

### Content correction

The vault note `投资研究/公司研究/腾讯控股（0700.HK）调研/财务报表 - 腾讯控股.md` will no longer link to a directory that has no public index page. The sentence will tell readers to use the report table's local-snapshot and official-source columns.

### Data flow

1. The vault workflow checks out the private vault and public-site publisher.
2. `sync-content.mjs` discovers allowlisted Markdown and attachment paths.
3. The attachment rewriter sees `sources/example.html`, validates that the file exists inside the same research topic, and emits a private GitHub blob URL.
4. VitePress receives an external URL instead of a nonexistent local route.
5. Strict content validation and site build pass.
6. The workflow commits synchronized innovation-drug research to the public-site repository.

## Error handling and security

- Missing HTML snapshot targets must still fail synchronization.
- HTML paths escaping the current company or industry topic must still fail.
- Absolute URLs, anchors, protocol-relative URLs, and unrelated `.html` routes must not be rewritten.
- HTML contents remain in the private vault; public readers without vault permission will not gain access.
- Dead-link checks stay enabled so unrelated broken internal routes continue to block publication.

## Testing

The change follows red-green TDD:

1. Add a failing unit test showing that an existing `sources/*.html` link should become an authenticated private blob URL with kind `source`.
2. Add or extend a negative test proving that an HTML file outside `sources/` is not rewritten.
3. Implement the minimal classifier change.
4. Run the focused attachment-link test, then the complete test suite.
5. Synchronize the current vault into a temporary site tree with explicit private repository/ref arguments.
6. Run `content:validate`, `site:build`, and `site:verify`; confirm the five dead links disappear.

## Release sequence

1. Commit and push the public-site publisher change.
2. Commit and push the single vault content correction. The existing local morning-brief backup commit will be reported separately before any vault push.
3. Trigger `Publish research to public site` on the vault repository.
4. Wait for the workflow to complete successfully.
5. Verify that the innovation-drug catalog and overview page exist in the public-site repository and rendered website.

## Success criteria

- The focused HTML attachment test fails before implementation and passes afterward.
- All public-site tests pass.
- Current vault synchronization reports successful attachment rewrites.
- VitePress reports zero dead links for the Tencent notes.
- The GitHub Actions publish run succeeds.
- The innovation-drug research is visible in the public catalog and website.
