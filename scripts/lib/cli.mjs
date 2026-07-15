import path from 'node:path'

function optionValue(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

export function parseSyncArguments(args, cwd = process.cwd(), env = process.env) {
  const sourceRoot = optionValue(args, '--source')
  if (!sourceRoot) throw new Error('--source is required')
  const siteRoot = optionValue(args, '--site-root') ?? path.join(cwd, 'site')
  const repository = optionValue(args, '--private-repository') ?? env.GITHUB_REPOSITORY
  const ref = optionValue(args, '--private-ref') ?? env.GITHUB_REF_NAME
  const result = { sourceRoot: path.resolve(sourceRoot), siteRoot: path.resolve(siteRoot) }
  if (repository && ref) {
    result.privateReports = {
      repository,
      ref,
      serverUrl: env.GITHUB_SERVER_URL ?? 'https://github.com'
    }
  }
  return result
}
