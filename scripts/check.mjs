import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(path))
    else out.push(path)
  }
  return out
}
const sensitive = [
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,})\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /[A-Z]:[\\/](?:Users|DeepSeekHarness)[\\/]/i,
  /(?:\/Users\/|\/home\/)[A-Za-z0-9_.-]+\//,
]
let checked = 0
for (const path of await walk(root)) {
  if (path.endsWith('.png')) continue
  const text = await readFile(path, 'utf8')
  for (const pattern of sensitive) assert.equal(pattern.test(text), false, 'Potential private content in ' + relative(root, path))
  if (/\.(?:js|mjs)$/.test(path)) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' })
    assert.equal(result.status, 0, relative(root, path) + ': ' + result.stderr)
  }
  checked++
}
const read = path => readFile(join(root, path), 'utf8')
const [account, wire, template, client] = await Promise.all(['client/account-store.js', 'lib/wire.js', 'client/template.js', 'client/client.js'].map(read))
const expected = template.replace('/* ACCOUNT_STORE */', account).replace('/* WIRE */', wire.replaceAll('export function', 'function'))
assert.equal(client, expected, 'Generated client differs from sources; run npm run build')
console.log('Checked syntax, generated client and common privacy patterns in ' + checked + ' text files.')
