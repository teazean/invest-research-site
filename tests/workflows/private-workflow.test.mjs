import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const templatePath = new URL('../../workflow-templates/publish-research.yml', import.meta.url)

describe('private research publication workflow contract', () => {
  it('uses path-scoped triggers and a repository-scoped deploy key', async () => {
    const workflow = await readFile(templatePath, 'utf8')
    for (const required of [
      'branches:', '- master', '投资研究/公司研究/**', '投资研究/产业专题/**',
      '.github/workflows/publish-research.yml', 'workflow_dispatch:', 'concurrency:',
      'repository: teazean/invest-research-site', 'ssh-key: ${{ secrets.SITE_DEPLOY_KEY }}',
      'node-version: \'24\'', 'npm ci', 'scripts/sync-content.mjs', 'npm run content:validate',
      'npm run site:build', 'npm run site:verify', 'git diff --cached --quiet', 'git push origin HEAD:main'
    ]) expect(workflow).toContain(required)
    expect(workflow).not.toMatch(/secrets\.[A-Z0-9_]*PAT\b|personal[_ -]?access[_ -]?token/i)
  })
})
