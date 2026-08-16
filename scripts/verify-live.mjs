// Live verification probe for dsh-client-ui-pet.
//
// Launches headless Chrome with remote debugging, opens the running
// DeepSeek Harness web UI (default http://127.0.0.1:8787/), waits for the
// plugin to mount, then reports the pet DOM through the DevTools protocol.
//
//   node scripts/verify-live.mjs [url]
//
// Set DSH_PET_SELECT_ID=<pet-id> to select a pet through window.dshPet before
// reporting (used to verify embedded raster built-ins on the real page).

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.DSH_CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = Number(process.env.DSH_CDP_PORT) || 9229
const URL = process.argv[2] || 'http://127.0.0.1:8787/'
const SELECT_PET = process.env.DSH_PET_SELECT_ID || ''
const PET_STATE = process.env.DSH_PET_STATE || ''
const SCREENSHOT = process.env.DSH_PET_SCREENSHOT || ''

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
  // Chrome 136+ requires PUT for /json/new.
  let response = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!response.ok) {
    response = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`)
  }
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
    ws.addEventListener('error', event => reject(new Error('WebSocket error')))
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
  const message = await cdp.send('Runtime.evaluate', { expression, returnByValue: true })
  if (message.exceptionDetails) throw new Error(message.exceptionDetails.text || 'evaluate failed')
  return message.result && message.result.value
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-pet-verify-'))
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore' })

  try {
    await waitForVersion()
    const target = await openTarget(URL)
    const cdp = await connect(target.webSocketDebuggerUrl)
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')

    // Wait for the heavy harness UI + our plugin to mount.
    let result = null
    let selectInjected = false
    for (let i = 0; i < 60; i++) {
      await sleep(500)
      if (!selectInjected && await evaluate(cdp, 'Boolean(window.dshPet)')) {
        if (SELECT_PET) {
          await evaluate(cdp, `window.dshPet.selectPet('${SELECT_PET}')`)
          if (PET_STATE) {
            await evaluate(cdp, `window.dshPet.setState('${PET_STATE}', { hold: true, bubbles: false })`)
          }
        }
        selectInjected = true
      }
      const expression = `(() => {
          const root = document.getElementById('dsh-client-ui-pet-root')
          const svg = document.getElementById('dsh-client-ui-pet-svg')
          const group = document.querySelector('#dsh-client-ui-pet-svg .dsh-pet-root')
          const raster = document.getElementById('dsh-client-ui-pet-raster')
          return {
            root: Boolean(root),
            pet: group ? group.getAttribute('data-pet') : null,
            state: svg ? svg.getAttribute('data-state') : null,
            api: Boolean(window.dshPet),
            pets: window.dshPet ? window.dshPet.listPets().map(p => p.id) : null,
            current: window.dshPet && window.dshPet.current ? window.dshPet.current() : null,
            raster: raster ? {
              mounted: true,
              state: raster.getAttribute('data-state'),
              src: String(raster.getAttribute('src') || '').slice(0, 80),
              naturalWidth: raster.naturalWidth,
              naturalHeight: raster.naturalHeight,
              loaded: raster.complete && raster.naturalWidth > 0
            } : { mounted: false },
            right: root ? root.style.right : null,
            bottom: root ? root.style.bottom : null,
            title: document.title
          }
        })()`
      result = await evaluate(cdp, expression)
      const ready = result && result.root && result.pets && result.pets.length
      const rasterReady = result && result.raster && result.raster.mounted && result.raster.loaded
      if (ready && (!result.raster || !result.raster.mounted || rasterReady)) break
    }

    console.log(JSON.stringify(result, null, 2))
    if (SCREENSHOT) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(SCREENSHOT, Buffer.from(shot.data, 'base64'))
      console.log('screenshot:', SCREENSHOT)
    }
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
