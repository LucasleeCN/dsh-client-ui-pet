// Embed a generated raster pet definition into lib/client.js built-ins.
//
//   node scripts/embed-pet.mjs <definition.json> [client.js]
//
// Definitions generated with `scripts/make-raster-pet.py --embed` inline the
// processed WebP frames as data: URIs, so the pet works on the real harness
// page immediately after a page refresh — no host restart and no asset route
// required. Re-running the script for the same pet id replaces the previous
// embedded block instead of duplicating it.

import { readFileSync, writeFileSync } from 'node:fs'

const definitionFile = process.argv[2]
const clientFile = process.argv[3] || new URL('../lib/client.js', import.meta.url)

if (!definitionFile) {
  console.error('usage: node scripts/embed-pet.mjs <definition.json> [client.js]')
  process.exit(1)
}

const definition = JSON.parse(readFileSync(definitionFile, 'utf8'))
if (definition.mode !== 'raster' || !/^data:image\//.test(definition.image || '')) {
  console.error('definition must be a raster definition generated with --embed')
  process.exit(1)
}

const petId = definition.id
const block = [
  '    /* __RASTER_PETS_SLOT_START__ */',
  `    // Generated raster pets — rebuild with scripts/make-raster-pet.py --embed`,
  `    BUILTIN_DEFINITIONS.push(${JSON.stringify(definition)});`,
  '    /* __RASTER_PETS_SLOT_END__ */'
].join('\n')

let source = readFileSync(clientFile, 'utf8')
const startMarker = '    /* __RASTER_PETS_SLOT_START__ */'
const endMarker = '    /* __RASTER_PETS_SLOT_END__ */'
const anchor = '    // ------------------------------------------------------------------\n    // Apply / cleanup'

if (!source.includes(startMarker)) {
  if (!source.includes(anchor)) {
    console.error('anchor not found in client.js')
    process.exit(1)
  }
  source = source.replace(anchor, block + '\n\n' + anchor)
  console.log(`embedded ${petId} (new raster slot)`)
} else {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker) + endMarker.length
  const before = source.slice(0, start)
  const after = source.slice(end)
  // Drop the blank line left behind by the old block.
  const cleanedAfter = after.startsWith('\n\n') ? after.slice(2) : after.replace(/^\n/, '')
  source = before + block + cleanedAfter
  console.log(`embedded ${petId} (replaced previous raster slot)`)
}

writeFileSync(clientFile, source)
console.log('updated', typeof clientFile === 'string' ? clientFile : clientFile.pathname)
