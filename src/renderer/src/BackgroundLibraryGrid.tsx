// src/renderer/src/BackgroundLibraryGrid.tsx
// Shared "My Backgrounds" library grid — search by mood, drag-drop/browse
// upload, an Open Folder shortcut, and a thumbnail grid with delete/tag/
// auto-tag. Used by both the Song editor's BackgroundPanel and the item
// editor's ItemBackgroundPanel so there's one library, one upload flow, one
// set of tags, everywhere a background gets picked.

import { useState, useEffect, useRef } from 'react'
import { Check, X, Pencil, Tag, Upload, FolderOpen, RefreshCw } from 'lucide-react'
import Modal from './Modal'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

interface BgEntry {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
}

interface BackgroundWithTags extends BgEntry {
  tags?: string[]
}

export default function BackgroundLibraryGrid({ activePath, onApply }: {
  activePath: string | null
  onApply: (path: string) => void
}): JSX.Element {
  const [uploads, setUploads] = useState<BackgroundWithTags[]>([])
  const [dragging, setDragging] = useState(false)
  const [searchTags, setSearchTags] = useState<string[]>([])
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editingTags, setEditingTags] = useState<string>('')
  const dropRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    void loadUploads()
    // "Open folder" sends the operator to the file manager to bulk-copy images
    // in — its own tooltip says "drop in as many as you want, then come back
    // here" — but nothing re-scanned the folder on return, so a batch of newly
    // added backgrounds stayed invisible until this component happened to
    // remount. Re-reading on window focus makes coming back actually work.
    const onFocus = (): void => { void loadUploads() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  async function loadUploads(): Promise<void> {
    let list: BgEntry[]
    try {
      list = await window.wf.bgList()
    } catch {
      setUploads([])
      return
    }
    // Tags are decoration. Fetching them with a bare Promise.all under one
    // catch meant a single failed lookup rejected the batch and blanked the
    // ENTIRE library — increasingly likely as the folder grows, since this is
    // one IPC round-trip per file (200+ of them here). Failing per-item keeps
    // the background visible with no tags instead of losing everything.
    const withTags = await Promise.all(
      list.map(async (bg) => {
        try {
          return { ...bg, tags: await window.wf.bgGetTags(bg.path) }
        } catch {
          return { ...bg, tags: [] as string[] }
        }
      })
    )
    setUploads(withTags)
  }

  async function handleSaveTags(filePath: string, tags: string[]): Promise<void> {
    try {
      await window.wf.bgSetTags(filePath, tags)
      await loadUploads()
      setEditingPath(null)
      setEditingTags('')
    } catch (err) {
      console.error('Failed to save tags:', err)
    }
  }

  async function handleAutoTag(filePath: string): Promise<void> {
    try {
      const tags = await window.wf.bgAutoTag(filePath)
      await loadUploads()
      console.log(`[BackgroundLibraryGrid] Auto-tagged with: ${tags.join(', ')}`)
    } catch (err) {
      console.error('Failed to auto-tag:', err)
    }
  }

  const filteredUploads = searchTags.length === 0
    ? uploads
    : uploads.filter((bg) => bg.tags?.some((t) => searchTags.includes(t)))

  async function handleUploadFile(file: File): Promise<void> {
    const path = (file as File & { path?: string }).path
    if (!path) return
    try {
      const dest = await window.wf.bgUpload(path)
      onApply(dest)
      await loadUploads()
    } catch (e) {
      console.error('Upload failed', e)
    }
  }

  async function handleBrowse(): Promise<void> {
    const result = await window.wf.bgOpenDialog()
    if (!result.canceled && result.filePaths[0]) {
      const dest = await window.wf.bgUpload(result.filePaths[0])
      onApply(dest)
      await loadUploads()
    }
  }

  async function handleDelete(filePath: string): Promise<void> {
    await window.wf.bgDelete(filePath)
    await loadUploads()
    if (activePath === filePath) onApply('')
  }

  function onDragOver(e: React.DragEvent): void {
    e.preventDefault()
    setDragging(true)
  }
  function onDragLeave(): void { setDragging(false) }
  function onDrop(e: React.DragEvent): void {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUploadFile(file)
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Search by tags */}
      <div className="rounded-lg border border-slate-200 bg-white p-2.5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Filter by mood</p>
        <div className="flex flex-wrap gap-1.5">
          {['worship', 'prayer', 'energetic', 'peaceful', 'joyful', 'dark', 'bright', 'nature', 'modern', 'seasonal'].map((tag) => (
            <button
              key={tag}
              onClick={() =>
                setSearchTags((cur) =>
                  cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]
                )
              }
              className={[
                'rounded-full px-2 py-1 text-[10px] font-semibold transition-all',
                searchTags.includes(tag)
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {tag}
            </button>
          ))}
        </div>
        {searchTags.length > 0 && (
          <button
            onClick={() => setSearchTags([])}
            className="mt-2 text-[10px] text-slate-500 hover:text-slate-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Drag-drop zone + Open folder */}
      <div className="flex gap-2">
        <button
          type="button"
          ref={dropRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={handleBrowse}
          aria-label="Upload a background — drag and drop a file here, or click to browse"
          className={[
            'flex flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-7 text-center transition-all',
            dragging
              ? 'border-blue-400 bg-blue-500/10 text-blue-700'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700',
          ].join(' ')}
        >
          <Upload size={20} />
          <span className="text-xs font-medium">Drop image or video here</span>
          <span className="text-[10px] text-slate-500">or click to browse</span>
        </button>
        <button
          onClick={() => window.wf.bgOpenFolder()}
          title="Open the backgrounds folder — drop in as many images as you want, then come back here"
          className="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 px-4 text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
        >
          <FolderOpen size={20} />
          <span className="text-[10px] font-medium">Open folder</span>
        </button>
      </div>

      {/* How many are actually loaded, plus a manual re-scan. The count is here
          so "did it pick up everything I just added?" is answerable at a glance
          rather than by counting thumbnails. */}
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          {uploads.length} background{uploads.length === 1 ? '' : 's'}
          {searchTags.length > 0 && ` · ${filteredUploads.length} matching`}
        </span>
        <button
          onClick={() => void loadUploads()}
          title="Re-scan the backgrounds folder"
          className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {/* Thumbnails grid */}
      {uploads.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">No uploads yet</p>
      ) : filteredUploads.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">No backgrounds match the selected mood</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filteredUploads.map((u) => {
            const active = activePath === u.path
            return (
              <div
                key={u.path}
                role="button"
                tabIndex={0}
                onClick={() => onApply(u.path)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApply(u.path) } }}
                aria-label={`Use background: ${u.path.split(/[/\\]/).pop()}`}
                aria-pressed={active}
                className={[
                  'group relative cursor-pointer overflow-hidden rounded-lg transition-all duration-150',
                  active
                    ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#f4f6f9]'
                    : 'ring-1 ring-slate-200 hover:ring-slate-300 hover:scale-[1.02]',
                ].join(' ')}
                style={{ aspectRatio: '16/9' }}
              >
                {u.isVideo ? (
                  <video src={toAssetUrl(u.path)} className="h-full w-full object-cover" muted />
                ) : (
                  <div
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${toAssetUrl(u.path)})` }}
                  />
                )}

                {active && (
                  <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow">
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}

                <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAutoTag(u.path) }}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white shadow hover:bg-black/80"
                    title="Auto-tag by filename"
                  >
                    <Tag size={11} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingPath(u.path); setEditingTags((u.tags || []).join(', ')) }}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white shadow hover:bg-black/80"
                    title="Edit tags"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(u.path) }}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-red-600/90 text-white shadow hover:bg-red-500"
                    title="Remove"
                  >
                    <X size={11} />
                  </button>
                </div>

                {u.tags && u.tags.length > 0 && (
                  <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-1">
                    {u.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-700/80 px-1.5 py-0.5 text-[8px] font-semibold text-slate-200"
                      >
                        {tag}
                      </span>
                    ))}
                    {u.tags.length > 2 && (
                      <span className="rounded-full bg-slate-700/80 px-1.5 py-0.5 text-[8px] font-semibold text-slate-200">
                        +{u.tags.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tag editing modal */}
      {editingPath && (
        <Modal onClose={() => { setEditingPath(null); setEditingTags('') }} labelledBy="edit-tags-title" className="w-full max-w-sm rounded-xl border border-slate-200 bg-[#f4f6f9] p-4 shadow-2xl">
            <h3 id="edit-tags-title" className="mb-3 text-sm font-bold text-slate-900">Edit Tags</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              {['worship', 'prayer', 'energetic', 'peaceful', 'joyful', 'dark', 'bright', 'nature', 'modern', 'seasonal', 'other'].map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    const tags = editingTags.split(',').map((t) => t.trim()).filter(Boolean)
                    if (tags.includes(tag)) {
                      setEditingTags(tags.filter((t) => t !== tag).join(', '))
                    } else {
                      setEditingTags([...tags, tag].join(', '))
                    }
                  }}
                  className={[
                    'rounded-lg px-2 py-1 text-xs font-semibold transition-all',
                    editingTags.split(',').map((t) => t.trim()).includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {tag}
                </button>
              ))}
            </div>
            <textarea
              value={editingTags}
              onChange={(e) => setEditingTags(e.target.value)}
              placeholder="Tags separated by commas"
              className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 resize-none"
              rows={3}
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  const tags = editingTags.split(',').map((t) => t.trim()).filter(Boolean)
                  if (editingPath) handleSaveTags(editingPath, tags)
                }}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingPath(null)
                  setEditingTags('')
                }}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
        </Modal>
      )}
    </div>
  )
}
