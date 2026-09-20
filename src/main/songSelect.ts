import { BrowserWindow, dialog, session } from 'electron'
import { mkdtempSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createSong } from './db'
import { decodeSongFileBytes, importLyrics } from '../shared/lyricImport'

const SONGSELECT_URL = 'https://songselect.ccli.com/'
const PARTITION = 'persist:songselect'

let songSelectWin: BrowserWindow | null = null
let downloadHooked = false
let importSink: ((song: SongSelectImportResult) => void) | null = null

export type SongSelectImportResult = { id: number; title: string }

function importFromText(raw: string): SongSelectImportResult {
  const song = importLyrics(raw)
  if (!song) throw new Error('That file did not look like SongSelect lyrics.')
  const id = createSong({
    title: song.title,
    author: song.author,
    ccli: song.ccli,
    copyright: song.copyright,
    sections: song.sections,
  })
  return { id, title: song.title }
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
        const imported = importFromText(raw)
        importSink?.(imported)
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
  return importFromText(raw)
}
