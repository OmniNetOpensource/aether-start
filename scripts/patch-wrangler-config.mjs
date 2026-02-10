/* global console, process */
import { readFileSync, writeFileSync } from 'fs'

const wranglerSrc = readFileSync('wrangler.jsonc', 'utf8')
const match = wranglerSrc.match(/"database_id"\s*:\s*"([^"]+)"/)
if (!match) {
  console.error('Could not find database_id in wrangler.jsonc')
  process.exit(1)
}

const dbId = match[1]
const configPath = 'dist/server/wrangler.json'
const config = readFileSync(configPath, 'utf8')
writeFileSync(
  configPath,
  config.replaceAll('REPLACE_WITH_D1_DATABASE_ID', dbId),
)
console.log(`Patched D1 database_id: ${dbId}`)
