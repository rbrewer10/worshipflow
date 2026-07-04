// Generates the raster app icons from build/icon.svg (the source of truth):
//   build/icon.png  — 512px, used as the Electron BrowserWindow/taskbar icon
//   build/icon.ico  — multi-size Windows icon for the taskbar and desktop shortcut
//
// Run with:  npm run icons   (after editing build/icon.svg)
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'build', 'icon.svg'))

// Render the SVG crisply at an exact pixel width.
function renderPng(size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  return resvg.render().asPng()
}

// Window/app icon (Electron scales this for the taskbar).
writeFileSync(join(root, 'build', 'icon.png'), renderPng(512))

// Windows .ico bundles several sizes so it stays crisp everywhere it's shown
// (taskbar, desktop shortcut, alt-tab, file explorer).
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const ico = await pngToIco(icoSizes.map(renderPng))
writeFileSync(join(root, 'build', 'icon.ico'), ico)

console.log(`Generated build/icon.png (512) and build/icon.ico (${icoSizes.join(', ')})`)
