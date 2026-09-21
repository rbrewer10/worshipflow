import { BrowserWindow, dialog, session } from 'electron'
import { mkdtempSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createSong, findExistingSong } from './db'
import { decodeSongFileBytes, importLyrics } from '../shared/lyricImport'

const SONGSELECT_URL = 'https://songselect.ccli.com/'
const PARTITION = 'persist:songselect'

let songSelectWin: BrowserWindow | null = null
let downloadHooked = false
let importSink: ((song: SongSelectImportResult) => void) | null = null
const recentKeys = new Map<string, number>()
const inFlight = new Set<string>()

export type SongSelectImportResult = { id: number; title: string; created: boolean; ccli?: string }

function importKey(song: { ccli?: string; title: string }): string {
  const ccli = (song.ccli ?? '').replace(/\D/g, '')
  return ccli ? `ccli:${ccli}` : `title:${song.title.trim().toLowerCase()}`
}

function wasJustImported(key: string): boolean {
  const now = Date.now()
  const prev = recentKeys.get(key)
  recentKeys.set(key, now)
  return prev != null && now - prev < 12_000
}

function importFromText(raw: string): SongSelectImportResult {
  const song = importLyrics(raw)
  if (!song) throw new Error('That file did not look like SongSelect lyrics.')
  const key = importKey(song)
  const existing = findExistingSong({ ccli: song.ccli, title: song.title, author: song.author })
  if (existing) return { id: existing.id, title: existing.title, created: false, ccli: song.ccli }
  if (inFlight.has(key)) {
    const again = findExistingSong({ ccli: song.ccli, title: song.title, author: song.author })
    if (again) return { id: again.id, title: again.title, created: false, ccli: song.ccli }
  }
  inFlight.add(key)
  try {
    const raced = findExistingSong({ ccli: song.ccli, title: song.title, author: song.author })
    if (raced) return { id: raced.id, title: raced.title, created: false, ccli: song.ccli }
    const id = createSong({
      title: song.title,
      author: song.author,
      ccli: song.ccli,
      copyright: song.copyright,
      sections: song.sections,
    })
    return { id, title: song.title, created: true, ccli: song.ccli }
  } finally {
    inFlight.delete(key)
  }
}

function announce(result: SongSelectImportResult): void {
  const opts = {
    type: 'info' as const,
    title: 'WorshipFlow',
    message: result.created
      ? `Added “${result.title}” to your library`
      : `“${result.title}” is already in your library`,
    detail: result.created
      ? 'Close this window when you are done. The song is in Song library.'
      : 'Download again will not make another copy.',
    buttons: ['OK'],
  }
  const win = songSelectWin && !songSelectWin.isDestroyed() ? songSelectWin : null
  void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
}

function finishImport(raw: string): void {
  const imported = importFromText(raw)
  const key = importKey({ title: imported.title, ccli: imported.ccli })
  const quiet = wasJustImported(key)
  importSink?.(imported)
  if (quiet) return
  announce(imported)
}

function hookDownloads(): void {
  if (downloadHooked) return
  downloadHooked = true
  const ses = session.fromPartition(PARTITION)
  ses.on('will-download', (_e, item) => {
    const name = item.getFilename() || 'songselect.txt'
    if (!/\.(usr|txt|cho|chopro|pro|ccli)$/i.test(name) && item.getMimeType() !== 'text/plain') {
      return
    }
    const dir = mkdtempSync(join(tmpdir(), 'wf-ss-'))
    const dest = join(dir, name)
    item.setSavePath(dest)
    item.once('done', (_ev, state) => {
      if (state !== 'completed') return
      try {
        const raw = decodeSongFileBytes(readFileSync(dest))
        finishImport(raw)
      } catch (err) {
        dialog.showErrorBox('SongSelect import failed', err instanceof Error ? err.message : String(err))
      } finally {
        try { unlinkSync(dest) } catch { /* ignore */ }
      }
    })
  })
}

export function openSongSelectWindow(
  parent: BrowserWindow | null,
  onImported: (song: SongSelectImportResult) => void
): void {
  importSink = onImported
  hookDownloads()
  if (songSelectWin && !songSelectWin.isDestroyed()) {
    songSelectWin.focus()
    return
  }
  songSelectWin = new BrowserWindow({
    width: 1180,
    height: 820,
    parent: parent ?? undefined,
    title: 'SongSelect by CCLI',
    autoHideMenuBar: true,
    backgroundColor: '#0b0f17',
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  songSelectWin.webContents.setWindowOpenHandler((d) => {
    if (/ccli\.com/i.test(d.url)) return { action: 'allow' }
    return { action: 'deny' }
  })
  songSelectWin.on('closed', () => { songSelectWin = null })
  void songSelectWin.loadURL(SONGSELECT_URL)
}

export async function importSongSelectFile(parent: BrowserWindow | null): Promise<SongSelectImportResult | null> {
  const opts = {
    title: 'Import SongSelect file',
    filters: [
      { name: 'SongSelect / lyrics', extensions: ['usr', 'txt', 'cho', 'chopro', 'pro'] },
      { name: 'All files', extensions: ['*'] },
    ],
    properties: ['openFile' as const],
  }
  const picked = parent && !parent.isDestroyed()
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  if (picked.canceled || !picked.filePaths[0]) return null
  const raw = decodeSongFileBytes(readFileSync(picked.filePaths[0]))
  const imported = importFromText(raw)
  announce(imported)
  return imported
}
