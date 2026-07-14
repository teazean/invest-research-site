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

export function validateMarkdownSecurity(markdown, documentPath) {
  if (markdown.replace(/^\uFEFF/, '').startsWith('---\n') || markdown.startsWith('---\r\n')) {
    throw new Error(`${documentPath}: YAML frontmatter is not allowed`)
  }

  for (const { label, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(markdown)) throw new Error(`${documentPath}: ${label} is not allowed`)
  }
}
