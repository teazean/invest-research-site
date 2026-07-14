import path from 'node:path'
import { finalizeBuiltSite } from './lib/build-assets.mjs'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const siteRoot = path.resolve(argument('--site-root', path.join(process.cwd(), 'site')))
const distRoot = path.resolve(argument('--dist-root', path.join(siteRoot, '.vitepress/dist')))
const siteBase = argument('--site-base', '/invest-research-site/')

try {
  const result = await finalizeBuiltSite({ siteRoot, distRoot, siteBase })
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
}
