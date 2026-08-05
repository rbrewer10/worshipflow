// src/main/backgroundLib.ts
// Manages the local background library: uploads + generated images.
import { app, shell } from 'electron'
import { join, extname } from 'path'
import { mkdirSync, copyFileSync, readdirSync, unlinkSync, existsSync, createWriteStream } from 'fs'
import { createHash } from 'crypto'
import https from 'https'
import {
  listFoldersIn, createFolderIn, renameFolderIn, moveFileToFolder, deleteFolderIn
} from './backgroundFolders'
import type { FileMove } from './backgroundFolders'

function uploadsDir(): string {
  const d = join(app.getPath('userData'), 'backgrounds', 'uploads')
  mkdirSync(d, { recursive: true })
  return d
}

// Opens the uploads folder in the OS file manager so images can be dropped in
// directly instead of one at a time through the app's dialog. uploadsDir()
// already creates the directory if it doesn't exist yet, so this never fails
// on a fresh install with no uploads.
export async function openBackgroundsFolder(): Promise<void> {
  const dir = uploadsDir()
  const err = await shell.openPath(dir)
  if (err) throw new Error(err)
}

function generatedDir(): string {
  const d = join(app.getPath('userData'), 'backgrounds', 'generated')
  mkdirSync(d, { recursive: true })
  return d
}

export type BgEntry = {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
  folder: string | null
}

const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|avi)$/i

export function listBackgrounds(): BgEntry[] {
  const results: BgEntry[] = []

  for (const dir of [uploadsDir(), generatedDir()]) {
    const kind = dir.includes('generated') ? 'generated' : 'upload'
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // One level deep only — flat folders, no nested subfolders.
        const subDir = join(dir, entry.name)
        for (const f of readdirSync(subDir)) {
          if (!IMAGE_EXT.test(f) && !VIDEO_EXT.test(f)) continue
          results.push({ filename: f, path: join(subDir, f), kind, isVideo: VIDEO_EXT.test(f), folder: entry.name })
        }
        continue
      }
      const f = entry.name
      if (!IMAGE_EXT.test(f) && !VIDEO_EXT.test(f)) continue
      results.push({ filename: f, path: join(dir, f), kind, isVideo: VIDEO_EXT.test(f), folder: null })
    }
  }
  return results
}

export function listBackgroundFolders(): string[] {
  return listFoldersIn([uploadsDir(), generatedDir()])
}

export function createBackgroundFolder(name: string): void {
  createFolderIn(uploadsDir(), [uploadsDir(), generatedDir()], name)
}

export function renameBackgroundFolder(oldName: string, newName: string): FileMove[] {
  return renameFolderIn([uploadsDir(), generatedDir()], oldName, newName)
}

export function moveBackground(filePath: string, folderName: string | null): string {
  return moveFileToFolder([uploadsDir(), generatedDir()], filePath, folderName)
}

export function deleteBackgroundFolder(name: string): FileMove[] {
  return deleteFolderIn([uploadsDir(), generatedDir()], name)
}

export function copyBackground(srcPath: string): string {
  const hash = createHash('md5').update(srcPath + Date.now()).digest('hex').slice(0, 8)
  const ext = extname(srcPath) || '.mp4'
  const filename = `${hash}${ext}`
  const dest = join(uploadsDir(), filename)
  copyFileSync(srcPath, dest)
  return dest
}

export function deleteBackground(filePath: string): void {
  // Safety: only allow deleting files inside the backgrounds dirs.
  const allowed = [uploadsDir(), generatedDir()]
  if (!allowed.some((d) => filePath.startsWith(d))) return
  if (existsSync(filePath)) unlinkSync(filePath)
}

export function downloadToGenerated(url: string, filename: string, signal?: AbortSignal): Promise<string> {
  const dest = join(generatedDir(), filename)
  return new Promise((resolve, reject) => {
    const get = (target: string, redirects: number): void => {
      const req = https.get(target, { timeout: 120000, signal }, (res) => {
        const status = res.statusCode ?? 0
        // Follow redirects (Pollinations / CDNs may 30x).
        if (status >= 300 && status < 400 && res.headers.location && redirects < 5) {
          res.resume()
          get(new URL(res.headers.location, target).toString(), redirects + 1)
          return
        }
        if (status !== 200) {
          res.resume()
          reject(new Error(`Image download failed (HTTP ${status})`))
          return
        }
        const file = createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve(dest) })
        file.on('error', (err) => { file.close(); reject(err) })
      })
      req.on('timeout', () => req.destroy(new Error('Image download timed out')))
      req.on('error', reject)
    }
    get(url, 0)
  })
}
