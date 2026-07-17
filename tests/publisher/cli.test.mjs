import { describe, expect, it } from 'vitest'
import { parseSyncArguments } from '../../scripts/lib/cli.mjs'

describe('parseSyncArguments', () => {
  it('uses the private GitHub Actions repository context', () => {
    expect(parseSyncArguments(['--source', '/vault'], '/repo', {
      GITHUB_REPOSITORY: 'teazean/obsidian-vault-invest',
      GITHUB_REF_NAME: 'master',
      GITHUB_SERVER_URL: 'https://github.com'
    })).toEqual({
      sourceRoot: '/vault',
      siteRoot: '/repo/site',
      privateRepository: {
        repository: 'teazean/obsidian-vault-invest',
        ref: 'master',
        serverUrl: 'https://github.com'
      }
    })
  })

  it('lets explicit private repository arguments override the Actions context', () => {
    expect(parseSyncArguments([
      '--source', '/vault',
      '--private-repository', 'owner/private-vault',
      '--private-ref', 'master'
    ], '/repo', {
      GITHUB_REPOSITORY: 'wrong/repository',
      GITHUB_REF_NAME: 'wrong-branch'
    }).privateRepository).toEqual({
      repository: 'owner/private-vault',
      ref: 'master',
      serverUrl: 'https://github.com'
    })
  })

  it('requires a source and accepts an explicit site root', () => {
    expect(parseSyncArguments(['--source', '/vault', '--site-root', '/repo/site'], '/repo', {})).toEqual({
      sourceRoot: '/vault',
      siteRoot: '/repo/site'
    })
  })

  it('defaults the site root to the current repository site directory', () => {
    expect(parseSyncArguments(['--source', '/vault'], '/repo', {})).toEqual({
      sourceRoot: '/vault',
      siteRoot: '/repo/site'
    })
  })

  it('fails without a source', () => {
    expect(() => parseSyncArguments([], '/repo', {})).toThrow(/--source is required/)
  })
})
