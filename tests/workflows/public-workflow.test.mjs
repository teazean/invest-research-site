import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const workflowPath = new URL('../../.github/workflows/deploy-pages.yml', import.meta.url)

describe('public GitHub Pages workflow', () => {
  it('deploys only the fully verified VitePress artifact', async () => {
    const workflow = await readFile(workflowPath, 'utf8')
    for (const required of [
      'push:', 'main', 'workflow_dispatch:', 'contents: read', 'pages: write', 'id-token: write',
      'actions/checkout@v5', 'actions/setup-node@v6', "node-version: '24'", 'npm ci', 'npm test',
      'npm run content:validate', 'npm run site:build', 'npm run site:verify',
      'actions/configure-pages@v4', 'actions/upload-pages-artifact@v3',
      'path: site/.vitepress/dist', 'actions/deploy-pages@v4', 'cancel-in-progress: false'
    ]) expect(workflow).toContain(required)
  })
})
