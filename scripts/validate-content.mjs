import path from 'node:path'
import { validatePublicContent } from './lib/manifest.mjs'

const siteRootArgument = process.argv.indexOf('--site-root')
const siteRoot = siteRootArgument === -1
  ? path.join(process.cwd(), 'site')
  : path.resolve(process.argv[siteRootArgument + 1])

try {
  const result = await validatePublicContent({ siteRoot })
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
}
