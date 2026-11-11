// Regenerates preview/*.png from client/client.js with mock data.
// Requires a local Chrome/Edge (set CHROME_PATH if it is not in a default location)
// and the react/react-dom dev dependencies (npm install).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const previewDir = join(root, 'preview')
const workDir = join(tmpdir(), 'dsh-balance-chip-shots')
const bundlePath = join(root, 'client/client.js')

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge']
  return candidates.find(path => {
    try { return readFileSync(path) && true } catch { return false }
  })
}

function umd(name) {
  const file = join(root, 'node_modules', name, 'umd', name + '.production.min.js')
  return readFileSync(file, 'utf8')
}

const variants = [
  { file: 'dsh-balance-chip-preview.png', width: 312, height: 440, query: 'panel=1&config=1&mode=amount&theme=dark' },
  { file: 'dsh-balance-chip-light.png', width: 312, height: 440, query: 'panel=1&config=1&mode=amount&theme=light' },
  { file: 'dsh-balance-chip-usage.png', width: 312, height: 330, query: 'panel=1&mode=usage&theme=dark' },
]

const browser = findBrowser()
if (!browser) throw new Error('No Chrome/Edge found; set CHROME_PATH to a headless-capable browser')

rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })
mkdirSync(previewDir, { recursive: true })

// Patch the shipped bundle: export the component and start in the state each shot needs.
let bundle = readFileSync(bundlePath, 'utf8')
bundle = bundle
  .replace('const [open, setOpen] = react.useState(false)', "const [open, setOpen] = react.useState(typeof window !== 'undefined' && window.__SHOT && window.__SHOT.panel === true)")
  .replace('const [showConfig, setShowConfig] = react.useState(false)', "const [showConfig, setShowConfig] = react.useState(typeof window !== 'undefined' && window.__SHOT && window.__SHOT.config === true)")
  .replace('    name: NS, inject:', '    BalanceRing,\n    name: NS, inject:')
writeFileSync(join(workDir, 'client.shot.js'), bundle)

const css = bundle.match(/const CSS = '([\s\S]*?)'\n/)
if (!css) throw new Error('CSS block not found in client/client.js')
writeFileSync(join(workDir, 'react.js'), umd('react'))
writeFileSync(join(workDir, 'react-dom.js'), umd('react-dom'))

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
:root {
  color-scheme: dark;
  --dsw-alias-bg-base: #1f1f22;
  --dsw-alias-bg-layer-2: #2b2b30;
  --dsw-alias-label-primary: #eeeeee;
  --dsw-alias-label-secondary: #bbbbbb;
  --dsw-alias-label-tertiary: #999999;
  --dsw-alias-border-l3: #454545;
  --dsw-alias-interactive-bg-hover: #3a3a40;
  --dsw-focus-ring-color: #60a5fa;
  --dsw-font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  --shot-bg: #17171a;
}
body[data-theme="light"] {
  color-scheme: light;
  --dsw-alias-bg-base: #ffffff;
  --dsw-alias-bg-layer-2: #ffffff;
  --dsw-alias-label-primary: #1a1a1a;
  --dsw-alias-label-secondary: #555555;
  --dsw-alias-label-tertiary: #777777;
  --dsw-alias-border-l3: #d9d9d9;
  --dsw-alias-interactive-bg-hover: #ededed;
  --shot-bg: #f4f4f5;
}
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--shot-bg);
  font-family: var(--dsw-font-family);
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}
#root { position: relative; }
${css[1]}
/* Static flow keeps the panel inside the tight viewport the shot is cropped to. */
.dbc_panel{position:static !important;left:auto !important;top:auto !important;right:auto !important;bottom:auto !important;margin-top:10px !important;visibility:visible !important;max-height:none !important;overflow:visible !important}
</style>
</head>
<body data-theme="dark">
<div id="root"></div>
<script>
  var params = new URLSearchParams(location.search);
  window.__SHOT = { panel: params.get('panel') === '1', config: params.get('config') === '1', mode: params.get('mode') || 'amount' };
  document.body.dataset.theme = params.get('theme') || 'dark';
  window.__ModuleLoader__ = { load: function (module) { window.__mod = module } };
  var now = Date.now();
  window.__snapshot = window.__SHOT.mode === 'usage'
    ? { provider: 'opencode-go', model: 'deepseek-v4.1-flash', state: 'ready', kind: 'usage-percent', refreshing: false, at: now, stale: false, failure: null, wallets: [
        { currency: 'PCT', total: '75', label: '滚动 5 小时', resetAt: '2026-11-11T22:00:00.000Z' },
        { currency: 'PCT', total: '40', label: '周', resetAt: '2026-11-17T00:00:00.000Z' },
        { currency: 'PCT', total: '90', label: '月', resetAt: '2026-12-11T00:00:00.000Z' },
      ] }
    : { provider: 'deepseek-account', model: 'deepseek-v4.1-flash', state: 'ready', refreshing: false, at: now, stale: false, failure: null, wallets: [{ currency: 'CNY', total: '250', paid: '250' }] };
</script>
<script src="react.js"></script>
<script src="react-dom.js"></script>
<script src="client.shot.js"></script>
<script>
  var React = window.React;
  var ReactDOM = window.ReactDOM;
  var makeJsx = function (type, props, key) {
    var next = Object.assign({}, props || {});
    if (key !== undefined) next.key = key;
    var children = next.children;
    delete next.children;
    var list = children === undefined ? [] : Array.isArray(children) ? children : [children];
    return React.createElement.apply(React, [type, next].concat(list));
  };
  var Tooltip = function (props) { return props.children };
  var requireShim = function (name) {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return { jsx: makeJsx, jsxs: makeJsx, Fragment: React.Fragment };
    if (name === 'react-dom') return { createPortal: ReactDOM.createPortal };
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Tooltip: Tooltip };
    throw new Error('unexpected require: ' + name);
  };
  window.fetch = function (url, init) {
    var body = init && init.method === 'POST' ? JSON.parse(init.body) : null;
    var config = body || { referenceCny: 100, referenceUsd: 10 };
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true, config: config }) } });
  };
  var plugin = window.__mod.factory(requireShim);
  var store = { subscribe: function () { return function () {} }, getSnapshot: function () { return window.__snapshot } };
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(plugin.BalanceRing, { store: store }));
  setTimeout(function () { window.dispatchEvent(new Event('resize')) }, 60);
</script>
</body>
</html>
`
writeFileSync(join(workDir, 'index.html'), html)

for (const variant of variants) {
  const out = join(previewDir, variant.file)
  const profile = join(workDir, 'profile-' + variant.file)
  const url = pathToFileURL(join(workDir, 'index.html')).href + '?' + variant.query
  const result = spawnSync(browser, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + profile,
    '--allow-file-access-from-files',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=' + variant.width + ',' + variant.height,
    '--virtual-time-budget=8000',
    '--screenshot=' + out,
    url,
  ], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error('screenshot failed: ' + variant.file)
  console.log('wrote preview/' + variant.file)
}

rmSync(workDir, { recursive: true, force: true })
