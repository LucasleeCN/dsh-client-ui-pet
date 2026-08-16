// Tiny static server for the standalone preview page.
//
//   node preview/server.mjs          -> http://127.0.0.1:4173/preview/
//   npm run preview                  -> same
//
// Serves the project root so preview/index.html can load ../lib/client.js
// exactly like the dsh web server would serve the client bundle.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = Number(process.env.DSH_PET_PREVIEW_PORT) || 4173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/') pathname = '/preview/index.html'
    if (pathname.endsWith('/')) pathname += 'index.html'
    // Same-origin asset URLs used by raster pet definitions:
    // /plugins/dsh-client-ui-pet/assets/<file> -> <project>/assets/<file>
    const assetPrefix = '/plugins/dsh-client-ui-pet/assets/'
    if (pathname.startsWith(assetPrefix)) {
      pathname = '/assets/' + pathname.slice(assetPrefix.length)
    }
    const filePath = normalize(join(ROOT, pathname))
    if (!filePath.startsWith(ROOT + sep) && filePath !== ROOT) {
      res.writeHead(403).end('forbidden')
      return
    }
    const body = await readFile(filePath)
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`dsh-client-ui-pet preview: http://127.0.0.1:${PORT}/preview/`)
})
