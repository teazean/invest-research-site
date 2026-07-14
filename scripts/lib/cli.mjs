import path from 'node:path'

function optionValue(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

export function parseSyncArguments(args, cwd = process.cwd()) {
  const sourceRoot = optionValue(args, '--source')
  if (!sourceRoot) throw new Error('--source is required')
  const siteRoot = optionValue(args, '--site-root') ?? path.join(cwd, 'site')
  return { sourceRoot: path.resolve(sourceRoot), siteRoot: path.resolve(siteRoot) }
}
