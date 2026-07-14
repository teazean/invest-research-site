import { describe, expect, it } from 'vitest'
import { parseSyncArguments } from '../../scripts/lib/cli.mjs'

describe('parseSyncArguments', () => {
  it('requires a source and accepts an explicit site root', () => {
    expect(parseSyncArguments(['--source', '/vault', '--site-root', '/repo/site'], '/repo')).toEqual({
      sourceRoot: '/vault',
      siteRoot: '/repo/site'
    })
  })

  it('defaults the site root to the current repository site directory', () => {
    expect(parseSyncArguments(['--source', '/vault'], '/repo')).toEqual({
      sourceRoot: '/vault',
      siteRoot: '/repo/site'
    })
  })

  it('fails without a source', () => {
    expect(() => parseSyncArguments([], '/repo')).toThrow(/--source is required/)
  })
})
