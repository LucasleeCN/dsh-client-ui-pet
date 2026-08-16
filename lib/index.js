// Host half of the companion pet plugin.
//
// The browser half (`./client.js`) contains the pet engine, built-ins, the
// customization panel and the window.dshPet developer API. This host half has
// two jobs:
//
//   1. It is the Loader entry the client-modules service discovers through
//      the package.json `dsh.client` declaration, so the web surface can
//      serve `/plugins/dsh-client-ui-pet/client.js`.
//
//   2. It serves raster pet images from the package `assets/` directory on
//      same-origin routes (`/plugins/dsh-client-ui-pet/assets/<file>`), so
//      JPG/PNG/WebP pet definitions can reference stable asset URLs instead
//      of bloating localStorage with base64 data URIs.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const inject = ['webServer']

const ASSETS_ROOT = fileURLToPath(new URL('../assets', import.meta.url))
const ASSETS_PREFIX = '/plugins/dsh-client-ui-pet/assets'

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
}

function walkFiles(root) {
  const out = []
  let entries = []
  try {
    entries = readdirSync(root)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(root, name)
    try {
      if (statSync(full).isDirectory()) out.push(...walkFiles(full))
      else out.push(full)
    } catch {}
  }
  return out
}

export function collectAssetRoutes() {
  return walkFiles(ASSETS_ROOT)
    .map(file => ({
      path: `${ASSETS_PREFIX}/${relative(ASSETS_ROOT, file).split('\\').join('/')}`,
      file
    }))
    .filter(route => MIME[extname(route.file).toLowerCase()])
}

function assetHandler(file, type) {
  return function handleAsset(req, res) {
    try {
      const data = readFileSync(file)
      res.writeHead(200, {
        'content-type': type,
        'cache-control': 'public, max-age=3600'
      })
      res.end(data)
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
    }
  }
}

export function apply(ctx) {
  if (!ctx.webServer) return
  ctx.effect(() => {
    for (const route of collectAssetRoutes()) {
      ctx.webServer.register({
        kind: 'exact',
        path: route.path,
        handler: assetHandler(route.file, MIME[extname(route.file).toLowerCase()])
      })
    }
  }, 'dsh-client-ui-pet: asset routes')
}
