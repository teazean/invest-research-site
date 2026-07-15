# 私有 PDF 链接兜底 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当研究中的本地 PDF 没有权威公开 URL 时，自动生成用户可凭 GitHub 登录态访问的私有仓库 `blob/master` 绝对链接。

**Architecture:** `report-links.mjs` 保持唯一的链接选择与路径安全边界，优先使用现有权威 URL，否则依据结构化私有仓库上下文生成 GitHub blob URL。CLI 从显式参数或 GitHub Actions 环境变量取得仓库和分支，`publish.mjs` 与 `sync.mjs` 只传递上下文；本地 PDF 仍不进入公开文件集。

**Tech Stack:** Node.js 24 ESM、Vitest 4、GitHub Actions、VitePress 1.6

## Global Constraints

- 权威 HTTP(S) PDF 地址始终优先于私有兜底。
- 私有兜底固定使用 `github.com/<owner>/<repo>/blob/master/...`，不用 `raw.githubusercontent.com`。
- 不复制任何 `reports/*.pdf` 到公开仓库或 Pages。
- URL 按路径段编码并保留 `/`；拒绝 `..` 越界。
- 无合法私有仓库上下文时继续失败关闭。
- 不修改用户尚未提交的 Obsidian 文件。

---

## File Structure

- Modify `scripts/lib/report-links.mjs`: 选择权威/私有目标并构造安全的 GitHub blob URL。
- Modify `scripts/lib/cli.mjs`: 从参数或 GitHub Actions 环境解析私有仓库上下文。
- Modify `scripts/lib/publish.mjs`: 将上下文传给同步层。
- Modify `scripts/lib/sync.mjs`: 将当前源文档路径和私有上下文传给 PDF 重写器。
- Modify `tests/publisher/report-links.test.mjs`: 覆盖优先级、编码、越界与失败关闭。
- Modify `tests/publisher/cli.test.mjs`: 覆盖参数和 Actions 环境解析。
- Modify `tests/publisher/sync.test.mjs`: 覆盖端到端私有兜底且 PDF 不公开。
- Modify `README.md`: 记录本地同步参数和私有链接权限边界。

### Task 1: 安全生成私有 GitHub PDF 链接

**Files:**
- Modify: `scripts/lib/report-links.mjs`
- Modify: `tests/publisher/report-links.test.mjs`

**Interfaces:**
- Consumes: `rewriteReportLinks(markdown, linkMap, documentPath, privateReports?)`，其中 `privateReports` 为 `{ repository: string, ref: string, serverUrl?: string }`。
- Produces: 权威 URL 或 `https://github.com/<repo>/blob/<ref>/<encoded-source-path>`；返回结构仍为 `{ markdown, rewrites }`。

- [ ] **Step 1: 写私有兜底的失败测试**

```js
it('falls back to an authenticated private GitHub blob URL', () => {
  const documentPath = '投资研究/公司研究/寒武纪（688256.SH）调研/公司调研 - 寒武纪.md'
  const result = rewriteReportLinks(
    '[减值公告](reports/2026Q1_impairment.pdf)',
    new Map(),
    documentPath,
    { repository: 'teazean/obsidian-vault-invest', ref: 'master' }
  )
  expect(result.markdown).toContain(
    'https://github.com/teazean/obsidian-vault-invest/blob/master/' +
    '%E6%8A%95%E8%B5%84%E7%A0%94%E7%A9%B6/%E5%85%AC%E5%8F%B8%E7%A0%94%E7%A9%B6/' +
    '%E5%AF%92%E6%AD%A6%E7%BA%AA%EF%BC%88688256.SH%EF%BC%89%E8%B0%83%E7%A0%94/' +
    'reports/2026Q1_impairment.pdf'
  )
})
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm test -- tests/publisher/report-links.test.mjs`

Expected: FAIL，现有实现抛出 `missing authoritative report URL`。

- [ ] **Step 3: 实现最小私有 URL 构造与选择逻辑**

在 `report-links.mjs` 引入 `node:path`，增加路径分段编码、仓库格式校验和研究主题边界检查：

```js
function privateReportUrl({ documentPath, localPath, privateReports }) {
  if (!privateReports) return undefined
  const { repository, ref, serverUrl = 'https://github.com' } = privateReports
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !ref?.trim()) {
    throw new Error(`${documentPath}: invalid private report repository context`)
  }
  const topicRoot = documentPath.split('/').slice(0, 3).join('/')
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(documentPath), localPath))
  if (!resolved.startsWith(`${topicRoot}/`)) {
    throw new Error(`${documentPath}: private report path escapes its research topic`)
  }
  const encoded = resolved.split('/').map(encodeURIComponent).join('/')
  return `${serverUrl.replace(/\/$/, '')}/${repository}/blob/${encodeURIComponent(ref)}/${encoded}`
}
```

重写时先取 `linkMap.get(localPath)`，仅在缺失时调用 `privateReportUrl`；两者都不存在时保留原来的失败错误。

- [ ] **Step 4: 运行测试确认绿灯**

Run: `npm test -- tests/publisher/report-links.test.mjs`

Expected: 原有 2 项与新增私有兜底测试全部 PASS。

- [ ] **Step 5: 增加优先级和边界测试**

加入四项独立测试：权威 URL 覆盖私有兜底；中文、空格和括号按路径段编码；`reports/../other.pdf` 越界失败；缺少官方及私有上下文继续失败。

- [ ] **Step 6: 运行模块测试并提交**

Run: `npm test -- tests/publisher/report-links.test.mjs`

Expected: 全部 PASS。

Run: `git add scripts/lib/report-links.mjs tests/publisher/report-links.test.mjs && git commit -m "feat: fall back to private GitHub report links"`

### Task 2: 把 GitHub Actions 仓库上下文传入同步器

**Files:**
- Modify: `scripts/lib/cli.mjs`
- Modify: `scripts/lib/publish.mjs`
- Modify: `scripts/lib/sync.mjs`
- Modify: `tests/publisher/cli.test.mjs`
- Modify: `tests/publisher/sync.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: CLI 参数 `--private-repository`、`--private-ref`，或环境变量 `GITHUB_REPOSITORY`、`GITHUB_REF_NAME`、`GITHUB_SERVER_URL`。
- Produces: `privateReports?: { repository: string, ref: string, serverUrl: string }`，传入 `publishResearchSite`、`syncResearch` 和 `rewriteReportLinks`。

- [ ] **Step 1: 写 CLI 环境解析的失败测试**

```js
it('uses the private GitHub Actions repository context', () => {
  expect(parseSyncArguments(['--source', '/vault'], '/repo', {
    GITHUB_REPOSITORY: 'teazean/obsidian-vault-invest',
    GITHUB_REF_NAME: 'master',
    GITHUB_SERVER_URL: 'https://github.com'
  })).toEqual({
    sourceRoot: '/vault',
    siteRoot: '/repo/site',
    privateReports: {
      repository: 'teazean/obsidian-vault-invest',
      ref: 'master',
      serverUrl: 'https://github.com'
    }
  })
})
```

另写显式参数覆盖环境变量的测试。

- [ ] **Step 2: 运行 CLI 测试确认红灯**

Run: `npm test -- tests/publisher/cli.test.mjs`

Expected: FAIL，当前解析器忽略环境和新参数。

- [ ] **Step 3: 实现解析与分层传递**

将签名改为 `parseSyncArguments(args, cwd = process.cwd(), env = process.env)`。只有 repository 和 ref 同时存在时才返回 `privateReports`；`serverUrl` 默认 `https://github.com`。`publishResearchSite(options)` 调用 `syncResearch(options)`，`syncResearch` 将 `privateReports` 作为第四个参数传入 `rewriteReportLinks`。

- [ ] **Step 4: 写同步集成的失败测试**

在 fixture 新增未映射的 `reports/private.pdf` 引用，以带 `privateReports` 的 `syncResearch` 调用同步。断言公开 Markdown 使用私有 blob URL，`site/research/**/reports/private.pdf` 不存在，`result.rewrites` 包含该替换。

- [ ] **Step 5: 运行 CLI 与同步测试确认通过**

Run: `npm test -- tests/publisher/cli.test.mjs tests/publisher/sync.test.mjs`

Expected: 全部 PASS，现有无 GitHub 环境测试仍只返回原来的两个路径字段。

- [ ] **Step 6: 更新本地使用说明并提交**

README 增加带 `--private-repository teazean/obsidian-vault-invest --private-ref master` 的同步示例，并说明私有 blob 链接只对有权限且已登录的用户可见。

Run: `git add scripts/lib/cli.mjs scripts/lib/publish.mjs scripts/lib/sync.mjs tests/publisher/cli.test.mjs tests/publisher/sync.test.mjs README.md && git commit -m "feat: pass private report context through publishing"`

### Task 3: 真实寒武纪语料、推送与自动发布验收

**Files:**
- No source edits expected after Tasks 1-2.
- Generated public content will be committed by the existing private workflow.

**Interfaces:**
- Consumes: 私有仓库提交 `305c63fd64fdceac1702c87c79a4145889758912`。
- Produces: 寒武纪公开 Markdown，其中 12 份财报使用巨潮 URL，5 份无官方映射公告使用私有 blob URL。

- [ ] **Step 1: 用提交快照复现并验证本地同步**

使用 `git archive 305c63f` 提取到临时目录，避免读取用户工作树中未提交的改动。运行：

```bash
npm run content:sync -- --source "$VAULT_FIXTURE" --site-root "$TEMP_SITE" --private-repository teazean/obsidian-vault-invest --private-ref master
```

Expected: 同步成功，不再出现 `missing authoritative report URL`。

- [ ] **Step 2: 审计寒武纪 PDF 替换结果**

解析生成的公开 Markdown：断言本地 `reports/*.pdf` 为 0；私有 blob URL 对应 5 个唯一 PDF；巨潮资讯 URL 对应 12 个唯一财报 PDF；生成目录内不存在 `.pdf` 文件。

- [ ] **Step 3: 运行完整本地门禁**

Run: `npm test && npm run content:validate && npm run site:build && npm run site:verify && git diff --check`

Expected: 所有测试、当前公开语料和构建资源校验通过；临时寒武纪同步审计单独通过。

- [ ] **Step 4: 合并并推送发布器**

按 `finishing-a-development-branch` 流程合并到 `main`，在合并结果上重新运行 `npm test`，然后运行 `git push origin main`。

- [ ] **Step 5: 重新运行失败的私有发布工作流**

Run: `gh run rerun 29380765401 --repo teazean/obsidian-vault-invest --failed`

Run: `gh run watch 29380765401 --repo teazean/obsidian-vault-invest --exit-status`

Expected: 同步、测试、提交公开内容全部成功；公开仓库出现 `content: publish research from 305c63f...` 提交。

- [ ] **Step 6: 等待 Pages 并线上验收**

监控公开仓库最新 `Deploy verified research site` 工作流至成功。在线检查寒武纪页面：五个私有链接均为 `github.com/teazean/obsidian-vault-invest/blob/master/...pdf`，十二个官方报告仍为 `static.cninfo.com.cn`，公开仓库与 Pages 中不存在寒武纪 PDF 文件。
