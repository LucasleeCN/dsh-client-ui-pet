// Live verification of raster (JPG) pets on the running DeepSeek Harness.
//
// The host-side asset route only activates after a harness restart, so this
// probe uses the `--embed` definition (data:image/webp;base64 URIs): it opens
// the real 8787 web UI, registers the definition through window.dshPet, and
// verifies the <img> actually decodes — no host restart required.
//
//   node scripts/verify-raster-live.mjs [definition.json] [url]

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.DSH_CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = Number(process.env.DSH_CDP_PORT) || 9230
const URL = process.argv[3] || 'http://127.0.0.1:8787/'
const DEFINITION_FILE = process.argv[2] ||
  new URL('../assets/pipeline-check/pipeline-check.embed.definition.json', import.meta.url)

const definition = JSON.parse(readFileSync(DEFINITION_FILE, 'utf8'))
const definitionLiteral = JSON.stringify(definition)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForVersion() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (response.ok) return response.json()
    } catch {}
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint did not come up')
}

async function openTarget(url) {
  let response = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!response.ok) response = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`)
  if (!response.ok) throw new Error(`could not open target: HTTP ${response.status}`)
  return response.json()
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    }
  })
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('WebSocket error')))
  })
  return {
    async send(method, params = {}) {
      await ready
      const id = nextId++
      const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
      ws.send(JSON.stringify({ id, method, params }))
      return result
    },
    close() { try { ws.close() } catch {} }
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'evaluate failed')
  return result.result && result.result.value
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-pet-raster-'))
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' })

  try {
    await waitForVersion()
    const target = await openTarget(URL)
    const cdp = await connect(target.webSocketDebuggerUrl)
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')

    // Wait for the harness UI and the plugin API.
    let mounted = false
    for (let i = 0; i < 40 && !mounted; i++) {
      await sleep(500)
      mounted = Boolean(await evaluate(cdp, 'Boolean(window.dshPet)'))
    }
    if (!mounted) throw new Error('window.dshPet did not appear on the real page')

    const registerResult = await evaluate(cdp,
      `window.dshPet.registerPet(${definitionLiteral})`)
    const selectResult = await evaluate(cdp,
      `window.dshPet.selectPet('${definition.id}')`)

    await sleep(700)
    const status = await evaluate(cdp, `(() => {
      const img = document.getElementById('dsh-client-ui-pet-raster')
      return {
        registered: ${JSON.stringify(registerResult)},
        selected: ${JSON.stringify(selectResult)},
        current: window.dshPet.current(),
        pets: window.dshPet.listPets().map(p => p.id),
        mounted: Boolean(img),
        state: img ? img.getAttribute('data-state') : null,
        isDataUri: img ? img.src.startsWith('data:image/webp;base64,') : false,
        naturalWidth: img ? img.naturalWidth : 0,
        naturalHeight: img ? img.naturalHeight : 0,
        loaded: Boolean(img && img.complete && img.naturalWidth > 0)
      }
    })()`)

    console.log(JSON.stringify(status, null, 2))
    cdp.close()
  } finally {
    chrome.kill()
    await sleep(400)
    try { rmSync(profile, { recursive: true, force: true }) } catch {}
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
