import { describe, expect, it } from 'vitest'
import { classifyPublicationPath } from '../../scripts/lib/paths.mjs'

describe('classifyPublicationPath', () => {
  it('allows research markdown, assets and csv files', () => {
    expect(classifyPublicationPath('投资研究/公司研究/A/报告.md')).toBe('markdown')
    expect(classifyPublicationPath('投资研究/产业专题/B/assets/chart.png')).toBe('asset')
    expect(classifyPublicationPath('投资研究/公司研究/A/csv/annual.csv')).toBe('csv')
  })

  it('rejects private, raw, report and hidden paths', () => {
    expect(classifyPublicationPath('投资研究/关注池/个股关注池.md')).toBeNull()
    expect(classifyPublicationPath('投资研究/公司研究/A/reports/annual.pdf')).toBeNull()
    expect(classifyPublicationPath('投资研究/公司研究/A/data/raw.csv')).toBeNull()
    expect(classifyPublicationPath('投资研究/公司研究/A/.secret/key.txt')).toBeNull()
    expect(classifyPublicationPath('投资研究/公司研究/A/notes.txt')).toBeNull()
  })
})
