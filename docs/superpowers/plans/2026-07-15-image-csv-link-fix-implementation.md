# GitHub Pages 图片与 CSV 链接修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让构建后的全部自动包裹图片可点击打开实际哈希资源，并让完整性清单中的 17 个 CSV 原字节进入 GitHub Pages 部署产物。

**Architecture:** VitePress 继续负责 Markdown 与图片打包；新的构建后模块只处理已经确定的 `dist` 产物，将图片外层链接绑定到子图片最终 `src`，并依据完整性清单复制 CSV。渲染验证复用同一套路径解析与文件校验接口，对链接漂移、路径越界、文件缺失和内容篡改失败关闭。

**Tech Stack:** Node.js 24 ESM、VitePress 1.6、Cheerio 1.2、Vitest 4、SHA-256 完整性清单

## Global Constraints

- 不修改 Obsidian vault 或公开 Markdown 正文。
- 不复制、压缩或重编码图片；图片链接使用 VitePress 已生成的哈希资源。
- CSV 仅取自 `research-manifest.json` 中 `kind: "csv"` 的条目，并保持路径和字节完全一致。
- PDF 继续使用既有权威外链，不复制本地 PDF。
- 所有站内资源路径必须位于 `/invest-research-site/` base 和 `dist` 根目录内。

---

## File Structure

- Create `scripts/lib/build-assets.mjs`: HTML 图片链接最终化、站内资源路径解析、CSV 复制和构建资源校验。
- Create `scripts/finalize-site.mjs`: 可传入 `--site-root`、`--dist-root` 和 `--site-base` 的命令行入口。
- Create `tests/build/build-assets.test.mjs`: 构建后处理、异常结构、越界路径、CSV 完整性的行为测试。
- Modify `scripts/lib/rendered-integrity.mjs`: 在正文等价校验后调用构建资源校验。
- Modify `tests/integrity/rendered-output.test.mjs`: 覆盖图片目标和 CSV 的成功/失败闭环。
- Modify `package.json`: 让 `site:build` 串联 VitePress 和最终化脚本。

### Task 1: 构建后图片链接与 CSV 发布

**Files:**
- Create: `scripts/lib/build-assets.mjs`
- Create: `scripts/finalize-site.mjs`
- Create: `tests/build/build-assets.test.mjs`

**Interfaces:**
- Consumes: `site/public/research-manifest.json` 的 `{ files: ManifestEntry[] }`，其中 CSV 条目提供 `publicPath`、`publicSize`、`publicSha256`。
- Produces: `finalizeBuiltSite({ siteRoot, distRoot, siteBase }): Promise<{ htmlFiles: number, imageLinks: number, csvFiles: number }>`。
- Produces: `verifyBuiltResearchAssets({ distRoot, manifest, siteBase }): Promise<{ imageLinks: number, csvFiles: number }>`。

- [ ] **Step 1: 写一个先失败的端到端测试**

测试创建临时 `site` 与 `dist`：HTML 中图片 `href="./assets/chart.png"`、图片 `src="/invest-research-site/assets/chart.ABC123.png"`，`dist/assets` 中存在哈希图片，清单中存在一个 CSV。执行：

```js
const result = spawnSync(process.execPath, [
  'scripts/finalize-site.mjs',
  '--site-root', siteRoot,
  '--dist-root', distRoot,
  '--site-base', '/invest-research-site/'
], { cwd: repoRoot, encoding: 'utf8' })

expect(result.status).toBe(0)
expect(await readFile(htmlPath, 'utf8')).toContain(
  'href="/invest-research-site/assets/chart.ABC123.png"'
)
expect(await readFile(csvDistPath)).toEqual(csvBytes)
```

- [ ] **Step 2: 运行测试并确认旧实现失败**

Run: `npm test -- tests/build/build-assets.test.mjs`

Expected: FAIL，CLI 尚不存在，退出状态不是 `0`。

- [ ] **Step 3: 实现最小构建后处理模块**

`build-assets.mjs` 实现以下确定性流程：

```js
export async function finalizeBuiltSite({ siteRoot, distRoot, siteBase }) {
  const manifest = JSON.parse(await readFile(
    path.join(siteRoot, 'public/research-manifest.json'), 'utf8'
  ))
  const htmlResult = await finalizeHtmlTree({ distRoot, siteBase })
  const csvFiles = await publishManifestCsv({ siteRoot, distRoot, manifest })
  await verifyBuiltResearchAssets({ distRoot, manifest, siteBase })
  return { ...htmlResult, csvFiles }
}
```

HTML 遍历只写回含 `.research-image-link` 的文件；每个链接必须有且仅有一个 `img[src]`，并将 `href` 设为该 `src`。`resolveSiteAssetPath` 对 URL 解码后确认 pathname 以 `siteBase` 开头，再用 `path.resolve` 和目录边界检查阻止 `..` 越界。

CSV 发布逐项读取源文件，先核对 `publicSize` 与 `publicSha256`，创建目标目录后复制，再次读取目标核对相同字段。CLI 解析三个参数，失败时输出堆栈并设置退出码 `1`。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- tests/build/build-assets.test.mjs`

Expected: PASS，HTML 链接与最终 `img src` 相同，CSV 目标与源字节一致。

- [ ] **Step 5: 增加异常路径测试**

在同一测试文件加入：

```js
it.each([
  ['没有图片', '<a class="research-image-link"></a>'],
  ['多张图片', '<a class="research-image-link"><img src="/invest-research-site/assets/a.png"><img src="/invest-research-site/assets/b.png"></a>'],
  ['越界路径', '<a class="research-image-link"><img src="/invest-research-site/%2e%2e/secret.png"></a>']
])('%s 时失败关闭', async (_name, fragment) => {
  const result = await runFixture(fragment)
  expect(result.status).toBe(1)
})
```

另加 CSV 源文件缺失、大小正确但 SHA-256 不一致两个测试，均要求退出码 `1` 且错误消息含目标 `publicPath`。

- [ ] **Step 6: 运行异常测试并修正边界**

Run: `npm test -- tests/build/build-assets.test.mjs`

Expected: 全部 PASS；任何异常不产生成功构建结果。

- [ ] **Step 7: 提交构建资源模块**

```bash
git add scripts/lib/build-assets.mjs scripts/finalize-site.mjs tests/build/build-assets.test.mjs
git commit -m "fix: finalize image links and publish CSV assets"
```

### Task 2: 将资源完整性接入站点验证

**Files:**
- Modify: `scripts/lib/rendered-integrity.mjs`
- Modify: `tests/integrity/rendered-output.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `verifyBuiltResearchAssets({ distRoot, manifest, siteBase })`。
- Produces: `verifyRenderedSite({ siteRoot, distRoot, siteBase = '/invest-research-site/' }): Promise<{ documents: number, imageLinks: number, csvFiles: number }>`。

- [ ] **Step 1: 写缺失图片和 CSV 的失败测试**

扩展临时站点夹具，加入一个已正确最终化的图片链接、对应哈希图片和一个清单 CSV。先断言完整夹具返回：

```js
await expect(verifyRenderedSite({ siteRoot, distRoot })).resolves.toEqual({
  documents: 1,
  imageLinks: 1,
  csvFiles: 1
})
```

随后分别删除哈希图片、删除 CSV、篡改 CSV，要求 Promise reject，消息分别包含 `image target`、CSV 路径和 `SHA-256 mismatch`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/integrity/rendered-output.test.mjs`

Expected: FAIL，现有返回值只有 `{ documents: 1 }`，也不会发现构建资源缺失。

- [ ] **Step 3: 接入统一构建资源校验**

在读取一次 manifest 并完成所有 Markdown 等价校验后执行：

```js
const assets = await verifyBuiltResearchAssets({ distRoot, manifest, siteBase })
return { documents: markdownEntries.length, ...assets }
```

验证器要求每个 `.research-image-link` 的 `href === img[src]`、目标为 `dist` 内普通文件，并按清单验证全部 CSV 的大小与 SHA-256。

- [ ] **Step 4: 运行渲染完整性测试**

Run: `npm test -- tests/integrity/rendered-output.test.mjs`

Expected: PASS，成功夹具返回三个计数，缺失或篡改夹具均准确失败。

- [ ] **Step 5: 提交验证闭环**

```bash
git add scripts/lib/rendered-integrity.mjs tests/integrity/rendered-output.test.mjs
git commit -m "test: verify built image and CSV assets"
```

### Task 3: 串联构建命令并验证真实数据

**Files:**
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 的 `scripts/finalize-site.mjs`。
- Produces: `npm run site:build` 依次执行 VitePress 构建与资源最终化。

- [ ] **Step 1: 写构建脚本契约测试**

在 `tests/build/build-assets.test.mjs` 读取 `package.json`，先要求：

```js
expect(pkg.scripts['site:build']).toBe(
  'vitepress build site && node scripts/finalize-site.mjs'
)
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/build/build-assets.test.mjs`

Expected: FAIL，现有脚本只执行 `vitepress build site`。

- [ ] **Step 3: 更新构建脚本与维护说明**

将脚本改为：

```json
"site:build": "vitepress build site && node scripts/finalize-site.mjs"
```

README 的发布流程说明构建后会把图片点击地址固定到哈希资源，并按清单发布全部 CSV；PDF 仍为外部权威链接。

- [ ] **Step 4: 运行局部和全量验证**

Run:

```bash
npm test
npm run content:validate
npm run site:build
npm run site:verify
```

Expected: 41 个既有测试及新增测试全部通过；内容校验返回 125 个文件；构建最终化报告 64 个图片链接和 17 个 CSV；站点验证返回 36 篇文档、64 个图片链接和 17 个 CSV。

- [ ] **Step 5: 直接核对真实构建产物**

Run:

```bash
rg -o 'class="research-image-link"[^>]*href="[^"]+"' site/.vitepress/dist/research | wc -l
find site/.vitepress/dist/research -type f -name '*.csv' | wc -l
```

Expected: 图片链接计数 `64`，CSV 计数 `17`；抽查 HTML 中 `href` 与子图片 `src` 完全相同。

- [ ] **Step 6: 提交构建串联**

```bash
git add package.json README.md tests/build/build-assets.test.mjs
git commit -m "build: publish finalized research assets"
```

### Task 4: 推送并验证 GitHub Pages

**Files:**
- No source file changes expected.

**Interfaces:**
- Consumes: 已通过本地验证的 `main` 分支构建。
- Produces: 可公开访问且图片/CSV 均返回 HTTP 200 的 Pages 站点。

- [ ] **Step 1: 检查提交范围与工作树**

Run:

```bash
git status --short
git log --oneline --decorate -6
git diff origin/main...HEAD --stat
```

Expected: 工作树干净，差异只包含本设计、计划、实现、测试和 README。

- [ ] **Step 2: 推送并等待 Actions 成功**

Run:

```bash
git push origin main
gh run list --repo teazean/invest-research-site --limit 3
gh run watch --repo teazean/invest-research-site <run-id> --exit-status
```

Expected: Pages 发布工作流成功结束。

- [ ] **Step 3: 线上验收**

从储能页面 HTML 提取“储能在电力系统中的位置”图片的 `href` 与 `src`，断言完全相同并请求 HTTP 200；请求正文引用的 3 个中际旭创 CSV，断言均为 HTTP 200。再用移动端视口打开页面并点击该图，确认不会出现站点 404 页面。

- [ ] **Step 4: 最终核对 PDF 策略未漂移**

Run:

```bash
rg -n '\.pdf([)#?]|$)' site/research
```

Expected: PDF 引用仍为既有 `https://` 权威外链，不出现本地 PDF 发布路径。

