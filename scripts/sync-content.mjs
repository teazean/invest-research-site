import { parseSyncArguments } from './lib/cli.mjs'
import { syncResearch } from './lib/sync.mjs'

try {
  const options = parseSyncArguments(process.argv.slice(2))
  const result = await syncResearch(options)
  process.stdout.write(`${JSON.stringify({
    files: result.files.length,
    markdown: result.files.filter(file => file.kind === 'markdown').length,
    assets: result.files.filter(file => file.kind === 'asset').length,
    csv: result.files.filter(file => file.kind === 'csv').length,
    reportLinkRewrites: result.rewrites.length
  })}\n`)
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
}
