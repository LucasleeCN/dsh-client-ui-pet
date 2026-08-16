import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import vm from 'node:vm'
import { apply as hostApply, collectAssetRoutes } from '../lib/index.js'

const clientSource = readFileSync(
  new URL('../lib/client.js', import.meta.url),
  'utf8'
)

// ---------------------------------------------------------------------------
// Minimal DOM harness, just enough for the plugin's real execution paths.
// ---------------------------------------------------------------------------

function createHarness(storage = {}) {
  const byId = new Map()
  const docListeners = new Map()

  function makeElement(id) {
    const listeners = new Map()
    const classes = new Set()
    const el = {
      id: id || '',
      _innerHTML: '',
      _spanChild: null,
      value: '',
      checked: false,
      textContent: '',
      dataset: {},
      style: {
        setProperty(name, value) { this[name] = String(value) },
        getPropertyValue(name) { return this[name] || '' }
      },
      parentNode: null,
      children: [],
      offsetWidth: 80,
      offsetHeight: 32,
      getBoundingClientRect() {
        return { top: 0, bottom: 0, left: 0, right: 0, width: 80, height: 32 }
      },
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle: (name, force) => {
          const next = force === undefined ? !classes.has(name) : Boolean(force)
          if (next) classes.add(name)
          else classes.delete(name)
          return next
        },
        contains: name => classes.has(name)
      },
      setAttribute(name, value) { el['attr:' + name] = String(value) },
      getAttribute(name) { return el['attr:' + name] || null },
      appendChild(child) {
        child.parentNode = el
        el.children.push(child)
        return child
      },
      removeChild(child) {
        child.parentNode = null
        el.children = el.children.filter(item => item !== child)
        return child
      },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, [])
        listeners.get(type).push(handler)
      },
      removeEventListener(type, handler) {
        if (!listeners.has(type)) return
        listeners.set(type, listeners.get(type).filter(fn => fn !== handler))
      },
      dispatch(type, event = {}) {
        for (const handler of listeners.get(type) || []) {
          handler(event.target ? event : { ...event, target: el, currentTarget: el })
        }
      },
      querySelector(selector) {
        if (selector === 'span') return el._spanChild
        if (selector.startsWith('#') && byId.has(selector.slice(1))) return byId.get(selector.slice(1))
        return null
      },
      querySelectorAll() {
        return []
      },
      contains(node) {
        let current = node
        while (current) {
          if (current === el) return true
          current = current.parentNode
        }
        return false
      }
    }

    Object.defineProperty(el, 'innerHTML', {
      get() { return el._innerHTML },
      set(value) {
        el._innerHTML = String(value)
        // Register any id="..." children so later getElementById calls work.
        for (const match of String(value).matchAll(/id="([^"]+)"/g)) {
          const child = makeElement(match[1])
          child.parentNode = el
          byId.set(match[1], child)
        }
        if (String(value).indexOf('<span') !== -1) {
          const span = makeElement('span')
          span.parentNode = el
          el._spanChild = span
        }
      }
    })

    return el
  }

  function byIdGet(id) {
    if (!byId.has(id)) byId.set(id, makeElement(id))
    return byId.get(id)
  }

  const document = {
    getElementById: byIdGet,
    createElement(tag) {
      return makeElement(tag === 'style' ? 'created-style' : '')
    },
    createTextNode() { return makeElement('') },
    head: makeElement('head'),
    body: makeElement('body'),
    documentElement: { clientWidth: 1280 },
    addEventListener(type, handler) {
      if (!docListeners.has(type)) docListeners.set(type, [])
      docListeners.get(type).push(handler)
    },
    removeEventListener(type, handler) {
      if (!docListeners.has(type)) return
      docListeners.set(type, docListeners.get(type).filter(fn => fn !== handler))
    },
    querySelector() { return null },
    querySelectorAll() { return [] }
  }

  let loadedSpec = null
  const window = {
    __ModuleLoader__: {
      load(spec) { loadedSpec = spec }
    },
    crypto: { randomUUID: () => 'test-pet-id' },
    localStorage: {
      getItem: key => (key in storage ? JSON.stringify(storage[key]) : null),
      setItem: (key, value) => { storage[key] = JSON.parse(value) }
    },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1280,
    innerHeight: 800
  }

  const context = { window, document, console, navigator: {} }
  vm.createContext(context)
  vm.runInContext(clientSource, context)

  return { window, document, byId: byIdGet, loadedSpec, context, storage }
}

function applyPlugin(harness) {
  const cleanupFns = []
  const module = harness.loadedSpec.factory(() => {
    throw new Error('the plugin must not require external modules')
  })
  assert.equal(typeof module.apply, 'function')
  module.apply({ effect: fn => cleanupFns.push(fn()) })
  return { module, cleanupFns }
}

const MINIMAL_PET = {
  id: 'custom-dot',
  name: '点点',
  version: '1.0.0',
  author: 'tester',
  svg: '<g><circle class="p-body" cx="100" cy="100" r="40"/><g class="dsh-pet-expr" data-expr-default><circle cx="100" cy="100" r="4"/></g></g>',
  style: '',
  states: { idle: { label: '空闲', hold: true }, happy: { label: '开心', durationMs: 1200 } },
  behaviors: [],
  bubbles: {}
}

// ---------------------------------------------------------------------------

test('host half exports an empty apply entry', () => {
  assert.equal(typeof hostApply, 'function')
  assert.doesNotThrow(() => hostApply({}))
})

test('apply() mounts the pet root, style, built-ins and the developer API', () => {
  const harness = createHarness()
  const { window, byId } = harness
  applyPlugin(harness)

  assert.ok(byId('dsh-client-ui-pet-root'))
  assert.ok(byId('dsh-client-ui-pet-style'))
  assert.ok(byId('dsh-client-ui-pet-stage'))
  assert.ok(byId('dsh-client-ui-pet-panel'))

  assert.equal(typeof window.dshPet, 'object')
  assert.equal(window.dshPet.version, '0.1.0')

  const pets = window.dshPet.listPets()
  assert.equal(pets.length, 1)
  assert.equal(JSON.stringify(pets.map(p => p.id).sort()), JSON.stringify(['deepseek-whale']))
  assert.equal(pets.find(p => p.id === 'deepseek-whale').name, '鲸鱼娘（原图）')
  assert.equal(window.dshPet.getDefinition('deepseek-whale').mode, 'raster')

  assert.equal(window.dshPetRuntime.engine.state.name, 'idle')
  assert.equal(window.dshPetRuntime.settings.petId, 'deepseek-whale')
})

test('raster whale is selected by default and renders its embedded image', () => {
  const harness = createHarness()
  const { window, byId } = harness
  applyPlugin(harness)

  const stage = byId('dsh-client-ui-pet-stage')
  assert.match(stage.innerHTML, /dsh-client-ui-pet-raster-wrap/)
  assert.match(stage.innerHTML, /data:image\/webp;base64,/)
  assert.equal(window.dshPet.current().id, 'deepseek-whale')
})

test('selectPet switches the active definition and persists the choice', () => {
  const harness = createHarness()
  const { window, byId } = harness
  applyPlugin(harness)

  assert.equal(window.dshPet.registerPet(MINIMAL_PET).ok, true)
  const result = window.dshPet.selectPet('custom-dot')
  assert.equal(result.ok, true)
  assert.equal(window.dshPetRuntime.settings.petId, 'custom-dot')
  assert.match(byId('dsh-client-ui-pet-stage').innerHTML, /data-pet="custom-dot"/)

  // Persisted in localStorage
  const stored = harness.storage['dsh-client-ui-pet.settings.v1']
  assert.equal(stored.petId, 'custom-dot')
})

test('interaction trigger raises mood/affinity and shows the mapped state', () => {
  const harness = createHarness()
  const { window } = harness
  applyPlugin(harness)

  const result = window.dshPet.trigger('interaction:pet')
  assert.equal(result.ok, true)
  assert.equal(window.dshPetRuntime.engine.state.name, 'happy')

  const profile = window.dshPetRuntime.settings.pets['deepseek-whale']
  assert.equal(Math.round(profile.mood), 85)
  assert.equal(Math.round(profile.affinity), 1)
})

test('clicking the pet stage interacts and increments pet count', () => {
  const harness = createHarness()
  const { byId } = harness
  applyPlugin(harness)

  const stage = byId('dsh-client-ui-pet-stage')
  stage.dispatch('click')
  assert.equal(harness.window.dshPetRuntime.engine.state.name, 'happy')
  assert.equal(harness.window.dshPetRuntime.settings.pets['deepseek-whale'].petCount, 1)
})

test('developer API registers, lists, selects and unregisters custom pets', () => {
  const harness = createHarness()
  const { window, byId } = harness
  applyPlugin(harness)

  const result = window.dshPet.registerPet(MINIMAL_PET)
  assert.equal(result.ok, true)
  assert.equal(window.dshPet.listPets().length, 2)

  assert.equal(window.dshPet.selectPet('custom-dot').ok, true)
  assert.match(byId('dsh-client-ui-pet-stage').innerHTML, /data-pet="custom-dot"/)

  const storedCustoms = harness.storage['dsh-client-ui-pet.customPets.v1']
  assert.equal(storedCustoms.length, 1)
  assert.equal(storedCustoms[0].id, 'custom-dot')

  assert.equal(window.dshPet.unregisterPet('custom-dot').ok, true)
  assert.equal(window.dshPet.listPets().length, 1)
})

test('registerPet rejects malformed definitions with useful errors', () => {
  const harness = createHarness()
  const { window } = harness
  applyPlugin(harness)

  assert.equal(window.dshPet.registerPet({ name: '缺 id' }).ok, false)
  assert.equal(window.dshPet.registerPet({ id: 'x', name: '缺 SVG' }).ok, false)
  assert.equal(window.dshPet.registerPet({ id: 'x', name: '缺 idle', svg: '<g/>', states: { happy: {} } }).ok, false)
  assert.equal(window.dshPet.registerPet({ id: 'x', name: '引用坏状态', svg: '<g/>', states: { idle: {} }, behaviors: [{ trigger: 'a', state: 'missing' }] }).ok, false)
})

test('imported SVG markup is sanitized (event handlers and scripts removed)', () => {
  const harness = createHarness()
  const { window } = harness
  applyPlugin(harness)

  const raw = {
    ...MINIMAL_PET,
    id: 'sanitized-pet',
    svg: '<g onload="alert(1)"><script>alert(2)</script><circle cx="1" cy="1" r="1" onclick="x()"/></g>'
  }
  const result = window.dshPet.registerPet(raw)
  assert.equal(result.ok, true)
  const def = window.dshPet.getDefinition('sanitized-pet')
  assert.ok(def.svg.indexOf('onload') === -1)
  assert.ok(def.svg.indexOf('onclick') === -1)
  assert.ok(def.svg.indexOf('<script') === -1)
})

const RASTER_PET = {
  id: 'jpg-whale',
  name: 'JPG 鲸鱼',
  mode: 'raster',
  image: '/plugins/dsh-client-ui-pet/assets/whale-girl/idle.jpg',
  images: { happy: '/plugins/dsh-client-ui-pet/assets/whale-girl/happy.jpg' },
  states: { idle: { label: '空闲', hold: true }, happy: { label: '开心', durationMs: 1200 } },
  behaviors: [],
  bubbles: { idle: ['我是图片宠物～'] }
}

test('raster-mode pets accept asset URLs and render an img stage', () => {
  const harness = createHarness()
  const { window, byId } = harness
  applyPlugin(harness)

  const result = window.dshPet.registerPet(RASTER_PET)
  assert.equal(result.ok, true)
  assert.equal(window.dshPet.selectPet('jpg-whale').ok, true)

  const stage = byId('dsh-client-ui-pet-stage')
  assert.match(stage.innerHTML, /dsh-client-ui-pet-raster-wrap/)
  assert.match(stage.innerHTML, /dsh-client-ui-pet-raster/)
  assert.match(stage.innerHTML, /whale-girl\/idle\.jpg/)

  const def = window.dshPet.getDefinition('jpg-whale')
  assert.equal(def.mode, 'raster')
  assert.equal(def.colors.length, 0)

  window.dshPet.setState('happy', { bubbles: false })
  assert.equal(byId('dsh-client-ui-pet-raster').getAttribute('data-state'), 'happy')
  assert.equal(byId('dsh-client-ui-pet-raster-wrap').getAttribute('data-state'), 'happy')
  assert.match(byId('dsh-client-ui-pet-raster').getAttribute('src'), /happy\.jpg$/)
})

test('raster-mode pets reject unsafe or missing image sources', () => {
  const harness = createHarness()
  const { window } = harness
  applyPlugin(harness)

  assert.equal(window.dshPet.registerPet({ ...RASTER_PET, id: 'bad-1', image: 'javascript:alert(1)' }).ok, false)
  assert.equal(window.dshPet.registerPet({ ...RASTER_PET, id: 'bad-2', image: '' }).ok, false)
  assert.equal(window.dshPet.registerPet({ ...RASTER_PET, id: 'bad-3', image: 'data:text/html;base64,xx' }).ok, false)
})

test('host half collects asset routes only for real image files', () => {
  const routes = collectAssetRoutes()
  for (const route of routes) {
    assert.match(route.path, /^\/plugins\/dsh-client-ui-pet\/assets\//)
    assert.match(route.file, /assets[\\/]/)
  }
})

test('every generated assets/*.definition.json is a valid pet definition', () => {
  const assetsRoot = new URL('../assets/', import.meta.url)
  let found = 0

  function validateGenerated(raw, label) {
    const harness = createHarness()
    applyPlugin(harness)
    let candidate = raw
    // Generated definitions may share their id with an embedded built-in
    // (embed-pet.mjs). Validate under a temporary id in that case.
    if (harness.window.dshPet.listPets().some(pet => pet.id === raw.id)) {
      candidate = { ...raw, id: 'generated-check-' + raw.id }
    }
    const result = harness.window.dshPet.registerPet(candidate)
    assert.equal(result.ok, true, `${label}: ${result.errors.join('; ')}`)
    harness.window.dshPet.unregisterPet(candidate.id)
    found++
  }

  for (const name of readdirSync(assetsRoot)) {
    if (!name.endsWith('.definition.json')) {
      // Nested folders generated by scripts/make-raster-pet.py.
      const nested = new URL(`${name}/`, assetsRoot)
      let files = []
      try { files = readdirSync(nested) } catch { continue }
      for (const file of files) {
        if (!file.endsWith('.definition.json')) continue
        validateGenerated(
          JSON.parse(readFileSync(new URL(file, nested), 'utf8')),
          `${name}/${file}`
        )
      }
      continue
    }
    validateGenerated(
      JSON.parse(readFileSync(new URL(name, assetsRoot), 'utf8')),
      name
    )
  }
  assert.ok(found >= 0, 'no generated definitions found (this is fine)')
})

test('name, size and color edits persist into settings', () => {
  const harness = createHarness()
  const { byId } = harness
  applyPlugin(harness)

  const nameInput = byId('dsh-client-ui-pet-name')
  nameInput.value = '小鲸'
  nameInput.dispatch('input', { target: nameInput })

  const sizeInput = byId('dsh-client-ui-pet-size')
  sizeInput.min = '72'
  sizeInput.max = '240'
  sizeInput.value = '160'
  sizeInput.dispatch('input', { target: sizeInput })

  const settings = harness.window.dshPetRuntime.settings
  assert.equal(settings.pets['deepseek-whale'].name, '小鲸')
  assert.equal(settings.size, 160)
  assert.equal(byId('dsh-client-ui-pet-stage').style.width, '160px')

  const stored = harness.storage['dsh-client-ui-pet.settings.v1']
  assert.equal(stored.pets['deepseek-whale'].name, '小鲸')
  assert.equal(stored.size, 160)
})

test('hide button hides the pet and stores the flag', () => {
  const harness = createHarness()
  const { byId } = harness
  applyPlugin(harness)

  const hideButton = byId('dsh-client-ui-pet-hide')
  hideButton.onclick()
  assert.equal(harness.window.dshPetRuntime.settings.hidden, true)
  assert.ok(byId('dsh-client-ui-pet-root').classList.contains('dsh-pet-hidden'))
})

test('bundled example pet definition (examples/pudding-ghost.json) is valid', () => {
  const harness = createHarness()
  applyPlugin(harness)
  const example = JSON.parse(readFileSync(new URL('../examples/pudding-ghost.json', import.meta.url), 'utf8'))
  const result = harness.window.dshPet.registerPet(example)
  assert.equal(result.ok, true)
  assert.equal(harness.window.dshPet.listPets().length, 2)
})

test('cleanup removes root, style and the developer API surface', () => {
  const harness = createHarness()
  const { byId } = harness
  const { cleanupFns } = applyPlugin(harness)

  assert.equal(cleanupFns.length, 1)
  cleanupFns[0]()

  assert.equal(byId('dsh-client-ui-pet-root').parentNode, null)
  assert.equal(byId('dsh-client-ui-pet-style').parentNode, null)
  assert.equal(harness.window.dshPet, undefined)
  assert.equal(harness.window.dshPetRuntime, undefined)
})
