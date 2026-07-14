import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs with Node 24 or newer', () => {
    expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(24)
  })
})
