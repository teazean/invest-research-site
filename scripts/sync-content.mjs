import { parseSyncArguments } from './lib/cli.mjs'
import { publishResearchSite } from './lib/publish.mjs'

try {
  const options = parseSyncArguments(process.argv.slice(2))
  const result = await publishResearchSite(options)
  process.stdout.write(`${JSON.stringify({
    files: result.files.length,
    markdown: result.files.filter(file => file.kind === 'markdown').length,
    assets: result.files.filter(file => file.kind === 'asset').length,
    csv: result.files.filter(file => file.kind === 'csv').length,
    attachmentLinkRewrites: result.rewrites.length,
    companies: result.catalog.companies.length,
    industries: result.catalog.industries.length
  })}\n`)
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
}
