# Private Attachment Links Design

## Goal

Eliminate recurring attachment 404s on the GitHub Pages research site by giving every vault-local attachment one deterministic click target in the private Obsidian repository, while preserving public inline image rendering and all research content.

## Confirmed Scope

- Vault-local attachments under `assets/`, `csv/`, and `reports/` use an authenticated absolute GitHub `blob/<ref>` URL when clicked.
- Inline PNG, JPEG, WebP, GIF, and SVG images remain public build assets so they render inside GitHub Pages without GitHub authentication.
- Direct `http://` and `https://` source links to exchanges, company sites, CNInfo, regulators, and other publishers remain unchanged.
- Markdown links to other research notes remain internal GitHub Pages routes.
- The private repository is `teazean/obsidian-vault-invest` and the publication ref is `master`, supplied through the existing publisher context rather than duplicated in content.

## Root Cause

The existing image fix operates after VitePress builds the site. It rewrites image anchors only in generated HTML so that `href` equals the hashed public `img src`. Direct page loads therefore work.

VitePress also emits client-side JavaScript for SPA navigation. That JavaScript is generated before the HTML finalizer runs and still contains the original relative anchor, for example:

```html
<a class="research-image-link" href="./assets/光伏八条子产业链利润状态地图.png">
```

When a reader reaches the article through site navigation, the client bundle renders this relative link. Clicking it requests a nonexistent `/research/.../assets/...` path and GitHub Pages returns 404. Post-processing HTML cannot make the server-rendered and client-rendered paths consistent.

## Chosen Architecture

Rewrite attachment click targets during private-to-public Markdown synchronization, before VitePress compiles either HTML or client JavaScript.

The publisher produces explicit public Markdown for a bare image:

```markdown
[![光伏八条子产业链利润状态地图](assets/光伏八条子产业链利润状态地图.png)](https://github.com/teazean/obsidian-vault-invest/blob/master/%E6%8A%95%E8%B5%84%E7%A0%94%E7%A9%B6/.../assets/%E5%85%89%E4%BC%8F%E5%85%AB%E6%9D%A1%E5%AD%90%E4%BA%A7%E4%B8%9A%E9%93%BE%E5%88%A9%E6%B6%A6%E7%8A%B6%E6%80%81%E5%9C%B0%E5%9B%BE.png)
```

VitePress transforms only the inner image source into its public hashed asset. The outer private GitHub URL is already absolute and is compiled identically into server HTML and client JavaScript.

Regular local attachment links are rewritten in place:

```markdown
[年度财务 CSV](csv/annual_financials.csv)
```

becomes:

```markdown
[年度财务 CSV](https://github.com/teazean/obsidian-vault-invest/blob/master/.../csv/annual_financials.csv)
```

The same rule applies to local PDFs even when another line contains an authoritative web URL. Direct authoritative links remain available in the article but no longer replace the local attachment target.

## Components and Responsibilities

### Attachment link transformer

A focused publisher module will:

- identify Markdown image embeds and ordinary links whose destinations resolve below `assets/`, `csv/`, or `reports/`;
- preserve the image source while adding an explicit private outer link to bare images;
- rewrite ordinary attachment destinations to the private blob URL;
- preserve query strings and fragments where meaningful;
- decode existing percent-encoded path segments before filesystem validation, then encode each GitHub path segment exactly once;
- record every destination rewrite in the research manifest;
- leave external URLs and research-note links untouched.

The existing private URL construction and topic-boundary checks will be generalized from report-only behavior rather than duplicated.

### Synchronizer

The synchronizer will supply the source file inventory and private repository context to the transformer. It will fail before replacing the live public research tree if any referenced local attachment:

- does not exist in the private source snapshot;
- escapes its company or industry topic;
- uses malformed percent encoding;
- lacks valid private repository or ref context.

Images and CSV files continue to be copied byte-for-byte into the public source tree for inline rendering and completeness verification. PDFs continue to stay out of the public repository.

### Markdown renderer

The custom renderer will stop inventing a relative image anchor. For an explicit image link produced by synchronization, it will decorate the existing outer anchor with `research-image-link`, `target="_blank"`, and `rel="noreferrer"` without changing its `href`. It may retain table wrappers and other presentation-only behavior.

### Build asset verification

The build finalizer will no longer mutate image `href` attributes. It will verify instead that:

- each inline image `src` resolves to a real public hashed build asset;
- each image anchor is an absolute private GitHub blob URL for the expected repository and ref;
- no research image anchor uses a relative or public hashed click target;
- published CSV bytes still match the source manifest;
- rendered external targets match the synchronized public Markdown.

This invariant must hold in both generated HTML and VitePress client page chunks. A build-level regression test will inspect the emitted client bundle, not only static HTML.

## Link Policy

| Source target | Inline display | Click target after publication |
|---|---|---|
| `assets/chart.png` image embed | Public hashed Pages image | Private GitHub blob |
| `assets/chart.svg` image embed | Public hashed Pages image | Private GitHub blob |
| `assets/chart.png` ordinary link | None | Private GitHub blob |
| `csv/table.csv` | None | Private GitHub blob |
| `reports/report.pdf` | None | Private GitHub blob |
| Relative research `.md` link | GitHub Pages page | GitHub Pages page |
| Existing `https://...` source | None | Original URL unchanged |

## Data Integrity and Security

- Transformation changes only attachment destinations and the link wrapper around bare images; visible text, headings, tables, numeric tokens, image bytes, and CSV bytes remain unchanged.
- Canonical semantic comparison continues to run between private source Markdown and synchronized public Markdown.
- Topic containment is checked after percent decoding and path normalization to prevent `..`, encoded traversal, cross-company links, and cross-industry links.
- Private GitHub links require a logged-in account with repository permission. This is expected and must be documented in the public-site README.
- No private PDF is copied to the public repository or Pages artifact.

## Testing Strategy

The implementation follows red-green-refactor cycles and adds coverage for:

1. Bare PNG and SVG embeds become explicit private links while retaining their local image sources.
2. Ordinary image, CSV, and PDF links become private absolute URLs.
3. Chinese names, spaces, already-percent-encoded names, fragments, and query strings are encoded once and resolve to existing source files.
4. External source URLs and internal note links remain unchanged.
5. Missing files, invalid context, malformed encoding, topic traversal, and cross-topic attachment targets fail publication.
6. Synchronization preserves attachment bytes and records all rewrites.
7. VitePress static HTML and client page JavaScript both contain the private image click URL and contain no relative `research-image-link` target.
8. Full tests, content validation, production build, rendered-site verification, and live HTTP checks pass.

## Rollout

1. Update the publisher and tests in `invest-research-site`.
2. Run a complete local synchronization against an exact private repository commit and execute all verification commands.
3. Push the publisher change to public `main`.
4. Trigger the private publication workflow so all existing Markdown is regenerated under the new policy.
5. Wait for the public Pages workflow and verify the affected photovoltaic image through both direct load and in-site navigation.
6. Audit all published attachment links to confirm there are no remaining local clickable `assets/`, `csv/`, or `reports/` destinations.

## Acceptance Criteria

- Clicking any published vault-local image, SVG, CSV, or PDF opens the corresponding authenticated private GitHub blob URL.
- Inline images remain visible on GitHub Pages.
- Direct page loads and SPA navigation produce the same attachment click target.
- No published attachment click leads to a GitHub Pages 404.
- Existing official web citations remain unchanged.
- No visible research content, table cell, number, image byte, or CSV byte is lost or changed by publication.
- The public repository and Pages artifact contain no PDF files.
