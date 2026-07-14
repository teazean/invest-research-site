const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g
const LOCAL_REPORT = /^reports\/[^\s)]+\.pdf(?:#[^\s)]*)?$/i
const EXTERNAL_URL = /^https?:\/\//i

function stripFragment(target) {
  return target.split('#')[0]
}

export function buildReportLinkMap(markdownFiles) {
  const result = new Map()

  for (const file of markdownFiles) {
    for (const line of file.content.split(/\r?\n/)) {
      const targets = [...line.matchAll(MARKDOWN_LINK)].map(match => match[1])
      const localTargets = targets.filter(target => LOCAL_REPORT.test(target))
      const externalTargets = targets.filter(target => EXTERNAL_URL.test(target))
      if (localTargets.length === 0 || externalTargets.length === 0) continue

      for (const target of localTargets) {
        result.set(stripFragment(target), externalTargets[0])
      }
    }
  }

  return result
}

export function rewriteReportLinks(markdown, linkMap, documentPath) {
  const rewrites = []
  const rewritten = markdown.replace(MARKDOWN_LINK, (fullMatch, target) => {
    if (!LOCAL_REPORT.test(target)) return fullMatch
    const fragment = target.includes('#') ? `#${target.split('#').slice(1).join('#')}` : ''
    const localPath = stripFragment(target)
    const authoritativeUrl = linkMap.get(localPath)
    if (!authoritativeUrl) {
      throw new Error(`${documentPath}: missing authoritative report URL for ${localPath}`)
    }
    const replacement = `${authoritativeUrl}${fragment}`
    rewrites.push({ document: documentPath, from: target, to: replacement })
    return fullMatch.replace(`(${target})`, `(${replacement})`)
  })

  return { markdown: rewritten, rewrites }
}
