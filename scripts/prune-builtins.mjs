// Prune the hand-drawn SVG built-in pets from lib/client.js.
//
//   node scripts/prune-builtins.mjs [client.js]
//
// Removes everything between the "Built-in pet 1/4" section divider and the
// generated raster slot (/* __RASTER_PETS_SLOT_START__ */), keeping the
// Developer API function and the raster slot intact. Idempotent.

import { readFileSync, writeFileSync } from 'node:fs'

const clientFile = process.argv[2] || new URL('../lib/client.js', import.meta.url)
const firstHeader = '    // Built-in pet 1/4 — DeepSeek 鲸鱼娘 (whale girl)'
const divider = '    // ------------------------------------------------------------------'
const rasterSlot = '    /* __RASTER_PETS_SLOT_START__ */'

const source = readFileSync(clientFile, 'utf8')
const headerAt = source.indexOf(firstHeader)
if (headerAt === -1) {
  console.log('no hand-drawn built-in blocks found; nothing to prune')
  process.exit(0)
}
const slotAt = source.indexOf(rasterSlot)
if (slotAt === -1 || slotAt < headerAt) {
  console.error('raster slot not found after the hand-drawn blocks; refusing to prune')
  process.exit(1)
}
const start = source.lastIndexOf(divider, headerAt)
if (start === -1) {
  console.error('section divider not found; refusing to prune')
  process.exit(1)
}

const pruned = source.slice(0, start) + source.slice(slotAt).replace(/^\n+/, '')
writeFileSync(clientFile, pruned)
console.log(`pruned hand-drawn built-ins from ${typeof clientFile === 'string' ? clientFile : clientFile.pathname}`)
