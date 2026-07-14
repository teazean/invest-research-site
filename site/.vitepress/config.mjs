import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
import { loadCatalogFromSite } from '../../scripts/lib/catalog.mjs'
import { createSiteConfig } from '../../scripts/lib/site-config.mjs'

const siteRoot = fileURLToPath(new URL('..', import.meta.url))
const catalog = await loadCatalogFromSite(siteRoot)

export default defineConfig(createSiteConfig(catalog))
