#!/usr/bin/env node
/**
 * 将 .env.local 中的变量同步到 Cloudflare Workers Secrets
 *
 * 使用方式: pnpm run cf:sync-secrets
 * 或: node scripts/sync-env-to-cloudflare.mjs
 *
 * 会排除:
 * - VITE_* (客户端变量，构建时注入)
 * - CONVEX_* (Convex 专用)
 * - 空行和注释
 */

import { readFileSync } from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const envPath = join(rootDir, '.env.local')

const EXCLUDE_PREFIXES = ['VITE_', 'CONVEX_']
const EXCLUDE_KEYS = ['ADMIN_EMAIL_ALLOWLIST'] // 已在 wrangler.jsonc vars 中

function parseEnv(content) {
  const vars = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    if (EXCLUDE_PREFIXES.some((p) => key.startsWith(p))) continue
    if (EXCLUDE_KEYS.includes(key)) continue

    let value = trimmed.slice(eqIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!value) continue
    vars.push({ key, value })
  }
  return vars
}

function putSecret(key, value) {
  return new Promise((resolve, reject) => {
    const proc = spawn('pnpm', ['exec', 'wrangler', 'secret', 'put', key], {
      cwd: rootDir,
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`wrangler secret put ${key} exited with code ${code}`))
    })
    proc.stdin.write(value, () => {
      proc.stdin.end()
    })
  })
}

async function main() {
  let content
  try {
    content = readFileSync(envPath, 'utf8')
  } catch {
    console.error('.env.local 不存在或无法读取')
    process.exit(1)
  }

  const vars = parseEnv(content)
  if (vars.length === 0) {
    console.log('没有需要同步的变量')
    return
  }

  console.log(`准备同步 ${vars.length} 个变量到 Cloudflare...`)
  console.log('变量列表:', vars.map((v) => v.key).join(', '))
  console.log('')

  for (const { key, value } of vars) {
    try {
      await putSecret(key, value)
      console.log(`✓ ${key}`)
    } catch (e) {
      console.error(`✗ ${key}:`, e.message)
      process.exit(1)
    }
  }

  console.log('')
  console.log('全部同步完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
