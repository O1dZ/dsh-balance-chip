import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const CONFIG_PATH = '/__dsh-balance-chip/config'
const DEFAULTS = { referenceCny: 50, referenceUsd: 10 }
const LIMIT = 4096

function configFile() {
  return join(homedir(), '.dsh', 'plugin-data', 'dsh-balance-chip', 'config.json')
}

function amount(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

export function sanitizeConfig(value) {
  const input = value && typeof value === 'object' ? value : {}
  return { referenceCny: amount(input.referenceCny, DEFAULTS.referenceCny), referenceUsd: amount(input.referenceUsd, DEFAULTS.referenceUsd) }
}

export async function readConfig() {
  try {
    const raw = await readFile(configFile(), 'utf8')
    return sanitizeConfig(JSON.parse(raw))
  } catch {
    return { ...DEFAULTS }
  }
}

export async function writeConfig(value) {
  const config = sanitizeConfig(value)
  await mkdir(dirname(configFile()), { recursive: true })
  await writeFile(configFile(), JSON.stringify(config, null, 2) + '\n', 'utf8')
  return config
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = ''
    req.on('data', chunk => {
      text += chunk
      if (text.length > LIMIT) {
        reject(new Error('too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(text))
    req.on('error', reject)
  })
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export async function handleConfigRequest(req, res) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, config: await readConfig() })
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    const config = await writeConfig(JSON.parse(await readBody(req)))
    sendJson(res, 200, { ok: true, config })
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid config' })
  }
}
