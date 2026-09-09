// Injects a static server-rendered snapshot of the landing page into
// dist/index.html after the client build, so a plain HTTP fetch (no
// JavaScript execution) sees real page content instead of an empty
// <div id="root">. This is a build-time optimization only — if anything
// here fails, it must never break `npm run build`, so every failure mode
// just logs a warning and leaves dist/index.html as the client build
// produced it (still fine, thanks to the <noscript> fallback in index.html).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DIST_INDEX = resolve('dist/index.html')
const SSR_ENTRY = resolve('dist-ssr/entry-server.js')

function bail(reason) {
  console.warn(`[prerender] Skipped: ${reason}`)
  process.exit(0)
}

if (!existsSync(DIST_INDEX)) bail('dist/index.html not found — run `vite build` first')
if (!existsSync(SSR_ENTRY)) bail('dist-ssr/entry-server.js not found — SSR build step did not produce output')

try {
  const { render } = await import(SSR_ENTRY)
  const appHtml = render('/')
  if (!appHtml || typeof appHtml !== 'string' || appHtml.length < 50) {
    bail('rendered output looked empty or too short')
  }

  const template = readFileSync(DIST_INDEX, 'utf-8')
  const marker = '<!--prerender-root-end-->'
  const rootOpenTag = '<div id="root">'
  const markerIdx = template.indexOf(marker)
  const rootIdx = template.indexOf(rootOpenTag)
  if (markerIdx === -1 || rootIdx === -1 || markerIdx < rootIdx) {
    bail('could not find the expected #root markers in dist/index.html')
  }

  const before = template.slice(0, rootIdx)
  const after = template.slice(markerIdx) // starts at the marker comment itself
  const finalHtml = `${before}${rootOpenTag}${appHtml}</div>${after}`

  writeFileSync(DIST_INDEX, finalHtml)
  console.log(`[prerender] Injected ${appHtml.length.toLocaleString()} chars of static landing-page HTML into dist/index.html`)
} catch (err) {
  bail(`render threw — ${err?.stack || err}`)
}
