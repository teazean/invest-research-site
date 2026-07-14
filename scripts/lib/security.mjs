import { parse } from 'yaml'

const FORBIDDEN_PATTERNS = [
  { label: 'Obsidian embed', pattern: /!\[\[[\s\S]*?\]\]/ },
  { label: 'Obsidian wikilink', pattern: /\[\[[\s\S]*?\]\]/ },
  { label: 'Obsidian callout', pattern: /^>\s*\[![^\]]+\]/m },
  { label: 'local absolute path', pattern: /(?:^|[\s("'])\/Users\//m },
  { label: 'GitHub token', pattern: /\b(?:github_pat_|ghp_)[A-Za-z0-9_]{20,}\b/ },
  { label: 'OpenAI-style secret', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'AWS access key', pattern: /\bAKIA[A-Z0-9]{16}\b/ },
  { label: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ }
]

const ALLOWED_FRONTMATTER_FIELDS = new Set([
  'title', 'date', 'updated', 'tags', 'cssclasses', 'aliases', 'status'
])

function validateString(value, field, documentPath) {
  if (typeof value !== 'string' || value.length > 500) {
    throw new Error(`${documentPath}: frontmatter ${field} must be a bounded string`)
  }
}

function validateStringList(value, field, documentPath) {
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error(`${documentPath}: frontmatter ${field} must be a bounded string list`)
  }
  for (const item of value) validateString(item, field, documentPath)
}

function validateFrontmatter(markdown, documentPath) {
  const normalized = markdown.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')
  if (!normalized.startsWith('---\n')) return

  const closingIndex = normalized.indexOf('\n---\n', 4)
  if (closingIndex === -1) throw new Error(`${documentPath}: unterminated YAML frontmatter`)

  let metadata
  try {
    metadata = parse(normalized.slice(4, closingIndex), {
      maxAliasCount: 0,
      uniqueKeys: true
    })
  } catch (error) {
    throw new Error(`${documentPath}: invalid YAML frontmatter: ${error.message}`)
  }

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`${documentPath}: YAML frontmatter must be a mapping`)
  }

  for (const [field, value] of Object.entries(metadata)) {
    if (!ALLOWED_FRONTMATTER_FIELDS.has(field)) {
      throw new Error(`${documentPath}: unsafe frontmatter field ${field} is not allowed`)
    }
    if (field === 'tags' || field === 'aliases') validateStringList(value, field, documentPath)
    else if (field === 'cssclasses') {
      validateStringList(value, field, documentPath)
      if (value.some(item => item !== 'wide-tables')) {
        throw new Error(`${documentPath}: only the wide-tables CSS class is allowed`)
      }
    } else validateString(value, field, documentPath)
  }
}

export function stripFrontmatter(markdown) {
  const normalized = markdown.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')
  if (!normalized.startsWith('---\n')) return normalized
  const closingIndex = normalized.indexOf('\n---\n', 4)
  return closingIndex === -1 ? normalized : normalized.slice(closingIndex + 5)
}

export function validateMarkdownSecurity(markdown, documentPath) {
  validateFrontmatter(markdown, documentPath)

  for (const { label, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(markdown)) throw new Error(`${documentPath}: ${label} is not allowed`)
  }
}
