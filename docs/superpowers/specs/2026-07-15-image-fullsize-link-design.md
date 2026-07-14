# GitHub Pages 原图链接修复设计

## 背景与根因

VitePress 会把 Markdown 图片的 `<img src>` 转换为带内容哈希的构建资源，例如 `/assets/图片.CuK3ODk4.png`。当前自定义 Markdown 渲染器同时生成了一个外层 `<a href="./assets/图片.png">`，但 Vite 不会转换普通链接的 `href`，且原始相对路径没有进入 Pages 构建产物。因此图片显示正常，点击却进入 404。

实测原图与哈希资源字节数、SHA-256 完全一致，哈希版没有压缩或重编码。

## 设计决策

采用构建后 HTML 修复，不复制原图，也不依赖浏览器端 JavaScript：

1. VitePress 正常构建并生成最终哈希图片资源。
2. 独立的构建后处理模块遍历 `site/.vitepress/dist/**/*.html`。
3. 对每个 `.research-image-link`，读取其唯一子图片的最终 `src`，把外层链接的 `href` 更新为同一地址。
4. 保留 `target="_blank"` 和 `rel="noreferrer"`，不改变图片、正文或 Markdown 源文件。
5. 写回 HTML 后，完整性验证逐个解析图片链接，将站内 URL 映射到 `dist` 文件并确认目标存在。

## 模块边界

- `scripts/lib/image-links.mjs`：只负责修复一个 HTML 文档、遍历构建目录和验证站内原图链接。
- `scripts/finalize-site.mjs`：构建后的命令行入口。
- `package.json`：`site:build` 在 VitePress 构建成功后调用最终化脚本。
- `scripts/lib/rendered-integrity.mjs`：复用图片链接验证接口，使 `site:verify` 对缺失目标失败关闭。

## 约束与错误处理

- 每个 `.research-image-link` 必须且只能包含一张带 `src` 的图片；结构异常时构建失败。
- 只接受站内、位于 `/invest-research-site/` base 下的图片目标；不得产生越界路径。
- URL 解码失败、目标文件缺失或目标不是普通文件时验证失败。
- 外部图片链接和作者已显式包裹的图片不在本次改动范围内。
- 不复制或重编码图片，不改变图片字节，不修改 Obsidian vault。

## 测试与验收

遵循 TDD：

1. 单元测试先复现旧 HTML 中 `href` 与哈希 `src` 不一致，并要求修复后两者相同。
2. 测试异常结构和越界 URL 必须失败。
3. 构建输出验证测试要求链接目标文件存在；删除目标文件后必须失败。
4. 运行全部测试、内容校验、站点构建和 36 篇页面渲染校验。
5. 抽查线上问题图片：显示 URL 与点击 URL 均返回 HTTP 200；移动端点击不再进入 404。

验收标准：全部自动包裹图片的外层链接都指向其实际渲染资源，最终构建中不存在失效的 `.research-image-link`。
