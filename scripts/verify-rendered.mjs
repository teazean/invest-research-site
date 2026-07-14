import path from 'node:path'
import { verifyRenderedSite } from './lib/rendered-integrity.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const siteRoot = path.resolve(argument('--site-root', path.join(process.cwd(), 'site')))
const distRoot = path.resolve(argument('--dist-root', path.join(siteRoot, '.vitepress/dist')))

try {
  const result = await verifyRenderedSite({ siteRoot, distRoot })
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
}
