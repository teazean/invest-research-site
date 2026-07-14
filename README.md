# 投资研究站点

公开地址：<https://teazean.github.io/invest-research-site/>

这是 `/Users/zhang/Documents/obsidian_vaults/invest` 的只读发布层。Obsidian 私有仓库仍是唯一写作源；本站不调用大模型生成或改写正文，只用确定性的 Node.js 程序复制、校验和渲染研究资料。

## 自动发布链路

1. Obsidian Git 把 `master` 的研究变更推送到私有仓库。
2. 私有仓库的 `publish-research.yml` 只响应 `投资研究/公司研究/**`、`投资研究/产业专题/**` 和工作流自身的变更。
3. 工作流使用仅对 `teazean/invest-research-site` 有写权限的 Deploy Key，同步公开内容并完成测试、构建和三级完整性校验。
4. 公开仓库 `main` 更新后，`deploy-pages.yml` 再次验证并部署 GitHub Pages。任一步失败，当前线上版本保持不变。

## 发布边界

发布内容：

- 公司研究和产业专题中的 Markdown；
- `assets/` 下的图片；
- `csv/` 下的 CSV 文件。

不发布内容：

- Obsidian 配置、其他笔记和隐藏文件；
- `data/` 原始处理数据；
- `reports/` 本地 PDF；PDF 引用必须转换为同一研究目录已记录的权威网址，否则发布失败；
- 本地绝对路径、Obsidian wikilink/callout 和高置信度密钥内容。

## 完整性保证

- Markdown：源文件与公开副本按顺序核对可见文本和完整表格矩阵；
- 图片：源文件与公开副本核对字节数和 SHA-256；VitePress 构建后，点击地址固定到实际生成的哈希资源，不复制或重编码图片；
- CSV：源文件与公开副本核对字节数和 SHA-256，并按完整性清单原字节复制进最终 Pages 目录；
- 渲染页面：再次核对正文块、表格单元格、显式外部链接、图片点击目标和全部 CSV 构建产物；
- 清单：`site/public/research-manifest.json` 记录全部公开文件、哈希、表格维度和 PDF 链接改写。

PDF 保持外部权威链接策略，不复制本地 PDF 到 Pages。

## 本地验证

```bash
npm ci
npm test
npm run content:validate
npm run site:build
npm run site:verify
```

重新从本机 vault 生成公开副本：

```bash
npm run content:sync -- --source /Users/zhang/Documents/obsidian_vaults/invest
```

## 故障恢复

先查看失败工作流的首个错误。内容问题应在私有 Obsidian 源笔记中修复并重新推送；发布器或页面问题在本仓库修复。不要绕过 `content:validate` 或 `site:verify`，也不要手工修改 `site/research/**`，因为下次同步会以私有源重新生成。

本站资料仅用于研究交流，不构成确定性投资建议；数据日期与来源以各篇正文为准。
