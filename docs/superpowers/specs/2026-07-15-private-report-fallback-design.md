# 私有 PDF 链接兜底设计

## 背景与根因

公开站点不发布 Obsidian 研究目录中的 `reports/*.pdf`。发布器目前要求每个本地 PDF 链接都能从同一研究主题的 Markdown 中找到权威公开 URL；如果找不到，发布会失败关闭。

寒武纪研究新增了五份只有本地链接、没有权威公开 URL 映射的公告，导致私有仓库工作流在同步阶段停止。用户确认：找不到远程 PDF 时，可以链接到其有权限访问的 GitHub 私有仓库文件。

## 目标与非目标

目标：

- 权威公开 URL 存在时继续优先使用。
- 权威 URL 缺失时，生成私有仓库 `blob/master` 的绝对链接。
- 保持本地 PDF 不进入公开仓库和 Pages 构建产物。
- 对中文、空格、括号和其他非 ASCII 路径生成有效 URL。
- 保持发布可测试、确定且失败关闭。

非目标：

- 不把私有 PDF 复制到公开站点。
- 不生成 `raw.githubusercontent.com` 直链；私有仓库跨域原始文件地址不能可靠复用 `github.com` 登录态。
- 不降低 Markdown、本地路径、数据完整性或密钥检查。
- 不自动搜索或猜测公告的官方地址。

## 发布规则

对每个 Markdown 中的 `reports/<file>.pdf` 链接，按以下顺序选择公开页面中的目标：

1. 如果同一研究主题已有本地 PDF 与权威 HTTP(S) 地址的映射，使用权威地址。
2. 否则，如果发布上下文提供了私有仓库名称和分支，生成：

   `https://github.com/<owner>/<repo>/blob/master/<URL 编码后的完整源文件路径>`

3. 否则抛出明确错误，指出缺失映射的文档和本地 PDF 路径。

私有地址中的完整源路径从当前 Markdown 的目录与相对 `reports/` 路径组合得到。每个路径段独立使用 `encodeURIComponent` 编码，目录分隔符 `/` 保留。路径必须规范化并确认仍位于允许发布的 `投资研究/公司研究` 或 `投资研究/产业专题` 目录内，不接受 `..` 越界。

## 配置与数据流

- `scripts/lib/cli.mjs` 解析可选参数 `--private-repository` 和 `--private-ref`。
- 参数未显式提供时，分别读取 GitHub Actions 自带的 `GITHUB_REPOSITORY` 和 `GITHUB_REF_NAME`。
- 当前私有工作流运行于 `teazean/obsidian-vault-invest` 的 `master` 分支，因此无需写入密钥，也无需新增 GitHub Secret。
- `scripts/lib/publish.mjs` 和 `scripts/lib/sync.mjs` 只负责传递结构化的私有仓库上下文。
- `scripts/lib/report-links.mjs` 负责目标选择、路径校验和 URL 构造。
- 同步生成的公开 Markdown 和完整性清单继续记录最终替换后的绝对 URL。

本地手动同步可显式执行：

```bash
npm run content:sync -- \
  --source /Users/zhang/Documents/obsidian_vaults/invest \
  --private-repository teazean/obsidian-vault-invest \
  --private-ref master
```

## 权限与隐私边界

- `github.com/.../blob/master/...` 使用 GitHub 网页登录态鉴权。
- 已登录且对私有仓库有权限的用户可以查看文件页面并打开 PDF。
- 未登录或无权限的访问者会看到登录页或 404，PDF 内容不会公开。
- 公开 Markdown 会暴露私有仓库名称、分支和研究文件路径；用户已明确接受这一边界。
- 不把访问令牌、签名 URL 或临时凭据写入公开 Markdown。

## 错误处理

- 权威 URL 与私有兜底同时可用时，必须选择权威 URL。
- 私有仓库名称必须是 `<owner>/<repo>`，分支不能为空。
- 本地 PDF 解析后的完整路径若越出当前研究主题或允许的研究根目录，发布失败。
- URL 编码失败、配置非法或无法构造确定地址时，发布失败，不保留原始相对 PDF 链接。
- 现有同步目录的原子替换逻辑保持不变；任何错误都不会留下半成品公开目录。

## 测试与验收

遵循 TDD：

1. 先写失败测试，要求缺少权威地址时生成私有 `blob/master` 链接。
2. 验证中文、空格和括号路径按段编码，且 `/` 保留。
3. 验证权威 URL 始终覆盖私有兜底。
4. 验证缺少私有仓库配置时仍抛出原有错误。
5. 验证 `..` 越界路径、非法仓库名称和空分支失败。
6. 使用寒武纪研究运行本地完整同步，确认五个缺失公告转换为私有链接，其余十二份年报/季报仍使用巨潮资讯地址。
7. 运行全量测试、内容校验、站点构建和渲染完整性校验。
8. 推送发布器后重新运行私有仓库工作流，确认同步、测试、提交和 Pages 部署全部成功。

验收标准：寒武纪研究能够自动发布；官方 PDF 仍使用官方地址；仅五个无官方映射的公告使用私有 GitHub `blob/master` 地址；任何本地 PDF 都不进入公开仓库或 Pages。
