// Generates the app icons from build/icon-source.png (the source of truth):
//   build/icon.png  — 512px, used as the Electron BrowserWindow/taskbar icon
//   build/icon.ico  — multi-size Windows icon for the taskbar and desktop shortcut
//
// The source is a raster PNG (the WorshipFlow Pro square app button). We embed it
// in an SVG and rasterize via resvg so we get clean multi-size output without an
// extra image-resize dependency. Alpha (rounded corners) is preserved — Windows
// shows the icon as-is.
//
// Run with:  npm run icons   (after replacing build/icon-source.png)
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'build', 'icon-source.png'))
const dataUri = 'data:image/png;base64,' + src.toString('base64')

const svg = (s) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
  `<image href="${dataUri}" xlink:href="${dataUri}" x="0" y="0" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet"/></svg>`

// Render crisply at an exact pixel width.
const renderPng = (size) => new Resvg(svg(size), { fitTo: { mode: 'width', value: size } }).render().asPng()

// Window/app icon (Electron scales this for the taskbar).
writeFileSync(join(root, 'build', 'icon.png'), renderPng(512))

// Windows .ico bundles several sizes so it stays crisp everywhere it's shown
// (taskbar, desktop shortcut, alt-tab, file explorer).
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const ico = await pngToIco(icoSizes.map(renderPng))
writeFileSync(join(root, 'build', 'icon.ico'), ico)

console.log(`Generated build/icon.png (512) and build/icon.ico (${icoSizes.join(', ')}) from icon-source.png`)
