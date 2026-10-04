import { readFile, writeFile } from 'node:fs/promises'
const account = await readFile(new URL('./client/account-store.js', import.meta.url), 'utf8')
const wire = await readFile(new URL('./lib/wire.js', import.meta.url), 'utf8')
const template = await readFile(new URL('./client/template.js', import.meta.url), 'utf8')
await writeFile(new URL('./client/client.js', import.meta.url), template.replace('/* ACCOUNT_STORE */', account).replace('/* WIRE */', wire.replaceAll('export function', 'function')))
