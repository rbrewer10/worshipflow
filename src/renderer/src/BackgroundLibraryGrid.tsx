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
  folder: string | null
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
  const [folders, setFolders] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null | 'ALL'>('ALL')
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  // undefined = no pill currently being dragged over; null = the Uncategorized
  // pill (which, like a real folder, needs its own distinct "hovering" state
  // separate from "nothing is being hovered").
  const [dragOverFolder, setDragOverFolder] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    void loadUploads()
    void loadFolders()
    // "Open folder" sends the operator to the file manager to bulk-copy images
    // in — its own tooltip says "drop in as many as you want, then come back
    // here" — but nothing re-scanned the folder on return, so a batch of newly
    // added backgrounds stayed invisible until this component happened to
    // remount. Re-reading on window focus makes coming back actually work.
    const onFocus = (): void => { void loadUploads(); void loadFolders() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  async function loadFolders(): Promise<void> {
    try {
      setFolders(await window.wf.bgListFolders())
    } catch {
      setFolders([])
    }
  }

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

  const folderScoped = selectedFolder === 'ALL'
    ? uploads
    : uploads.filter((bg) => bg.folder === selectedFolder)

  const filteredUploads = searchTags.length === 0
    ? folderScoped
    : folderScoped.filter((bg) => bg.tags?.some((t) => searchTags.includes(t)))

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

  async function warnIfInUse(filePath: string, action: 'move' | 'delete'): Promise<boolean> {
    const usage = await window.wf.bgUsage(filePath)
    const names = [...usage.songs, ...usage.announcements, ...usage.items.map((t) => `a ${t} item`)]
    if (names.length === 0) return true
    return confirm(
      `This background is currently used by: ${names.join(', ')}. ${action === 'delete' ? 'Delete' : 'Move'} it anyway?`
    )
  }

  async function handleDelete(filePath: string): Promise<void> {
    if (!(await warnIfInUse(filePath, 'delete'))) return
    await window.wf.bgDelete(filePath)
    await loadUploads()
    if (activePath === filePath) onApply('')
  }

  async function handleMoveToFolder(filePath: string, folderName: string | null): Promise<void> {
    if (!(await warnIfInUse(filePath, 'move'))) return
    try {
      const newPath = await window.wf.bgMove(filePath, folderName)
      if (activePath === filePath) onApply(newPath)
      await loadUploads()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not move that background.')
    }
  }

  async function handleCreateFolder(): Promise<void> {
    const name = newFolderName.trim()
    if (!name) return
    try {
      await window.wf.bgCreateFolder(name)
      setNewFolderName('')
      setCreatingFolder(false)
      await loadFolders()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create that folder.')
    }
  }

  async function handleRenameFolder(oldName: string): Promise<void> {
    const newName = renameValue.trim()
    if (!newName || newName === oldName) {
      setRenamingFolder(null)
      setRenameValue('')
      return
    }
    try {
      await window.wf.bgRenameFolder(oldName, newName)
      if (selectedFolder === oldName) setSelectedFolder(newName)
      setRenamingFolder(null)
      setRenameValue('')
      await loadFolders()
      await loadUploads()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not rename that folder.')
    }
  }

  async function handleDeleteFolder(name: string): Promise<void> {
    if (!confirm(`Delete the "${name}" folder? Its backgrounds move to Uncategorized — nothing is deleted.`)) return
    try {
      await window.wf.bgDeleteFolder(name)
      if (selectedFolder === name) setSelectedFolder('ALL')
      await loadFolders()
      await loadUploads()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete that folder.')
    }
  }

  function onFolderDrop(folderName: string | null): (e: React.DragEvent) => void {
    return (e: React.DragEvent) => {
      e.preventDefault()
      if (draggedPath) void handleMoveToFolder(draggedPath, folderName)
      setDraggedPath(null)
      setDragOverFolder(undefined)
    }
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
      <div className="rounded-lg border border-border bg-panel p-2.5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-content-secondary">Filter by mood</p>
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
                  : 'bg-panel-raised text-content-secondary hover:bg-border-strong',
              ].join(' ')}
            >
              {tag}
            </button>
          ))}
        </div>
        {searchTags.length > 0 && (
          <button
            onClick={() => setSearchTags([])}
            className="mt-2 text-[10px] text-content-secondary hover:text-content-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Folder rail */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setSelectedFolder('ALL')}
          className={[
            'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
            selectedFolder === 'ALL' ? 'bg-blue-600 text-white' : 'bg-panel-raised text-content-secondary hover:bg-border-strong',
          ].join(' ')}
        >
          All
        </button>
        <button
          onClick={() => setSelectedFolder(null)}
          onDragOver={(e) => { e.preventDefault(); setDragOverFolder(null) }}
          onDragLeave={() => setDragOverFolder(undefined)}
          onDrop={onFolderDrop(null)}
          className={[
            'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
            selectedFolder === null ? 'bg-blue-600 text-white' : 'bg-panel-raised text-content-secondary hover:bg-border-strong',
            dragOverFolder === null ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-panel' : '',
          ].join(' ')}
        >
          Uncategorized
        </button>
        {folders.map((f) =>
          renamingFolder === f ? (
            <div key={f} className="flex items-center gap-1">
              <input
                // This input only renders because the operator just clicked the
                // rename pencil on this specific pill — autofocusing it is the
                // deliberate continuation of that action.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleRenameFolder(f)
                  if (e.key === 'Escape') { setRenamingFolder(null); setRenameValue('') }
                }}
                placeholder="Folder name"
                className="w-28 rounded-full border border-border px-2.5 py-1 text-[11px] outline-none focus:border-blue-500"
              />
              <button onClick={() => handleRenameFolder(f)} className="text-[11px] font-semibold text-blue-400">Save</button>
            </div>
          ) : (
            <div key={f} className="group relative">
              <button
                onClick={() => setSelectedFolder(f)}
                onDragOver={(e) => { e.preventDefault(); setDragOverFolder(f) }}
                onDragLeave={() => setDragOverFolder(undefined)}
                onDrop={onFolderDrop(f)}
                className={[
                  'rounded-full px-2.5 py-1 pr-9 text-[11px] font-semibold transition-all',
                  selectedFolder === f ? 'bg-blue-600 text-white' : 'bg-panel-raised text-content-secondary hover:bg-border-strong',
                  dragOverFolder === f ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-panel' : '',
                ].join(' ')}
              >
                {f}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setRenamingFolder(f); setRenameValue(f) }}
                title={`Rename "${f}" folder`}
                className="absolute right-5 top-1/2 hidden -translate-y-1/2 text-[10px] opacity-70 hover:opacity-100 group-hover:block"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f) }}
                title={`Delete "${f}" folder`}
                className="absolute right-1 top-1/2 hidden -translate-y-1/2 text-[10px] opacity-70 hover:opacity-100 group-hover:block"
              >
                <X size={10} />
              </button>
            </div>
          )
        )}
        {creatingFolder ? (
          <div className="flex items-center gap-1">
            <input
              // This input only renders because the operator just clicked "+ New
              // folder" — autofocusing it is the deliberate continuation of that
              // action, not an unexpected focus steal.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') } }}
              placeholder="Folder name"
              className="w-28 rounded-full border border-border px-2.5 py-1 text-[11px] outline-none focus:border-blue-500"
            />
            <button onClick={handleCreateFolder} className="text-[11px] font-semibold text-blue-400">Add</button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingFolder(true)}
            className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-semibold text-content-secondary hover:border-border-strong hover:text-content-primary"
          >
            + New folder
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
              ? 'border-blue-400 bg-blue-500/10 text-blue-400'
              : 'border-border text-content-secondary hover:border-border-strong hover:bg-panel-raised hover:text-content-primary',
          ].join(' ')}
        >
          <Upload size={20} />
          <span className="text-xs font-medium">Drop image or video here</span>
          <span className="text-[10px] text-content-secondary">or click to browse</span>
        </button>
        <button
          onClick={() => window.wf.bgOpenFolder()}
          title="Open the backgrounds folder — drop in as many images as you want, then come back here"
          className="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border px-4 text-content-secondary transition-all hover:border-border-strong hover:bg-panel-raised hover:text-content-primary"
        >
          <FolderOpen size={20} />
          <span className="text-[10px] font-medium">Open folder</span>
        </button>
      </div>

      {/* How many are actually loaded, plus a manual re-scan. The count is here
          so "did it pick up everything I just added?" is answerable at a glance
          rather than by counting thumbnails. */}
      <div className="mb-2 flex items-center justify-between text-[11px] text-content-secondary">
        <span>
          {uploads.length} background{uploads.length === 1 ? '' : 's'}
          {searchTags.length > 0 && ` · ${filteredUploads.length} matching`}
        </span>
        <button
          onClick={() => void loadUploads()}
          title="Re-scan the backgrounds folder"
          className="inline-flex items-center gap-1 font-medium text-blue-400 hover:underline"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {/* Thumbnails grid */}
      {uploads.length === 0 ? (
        <p className="py-8 text-center text-xs text-content-tertiary">No uploads yet</p>
      ) : filteredUploads.length === 0 ? (
        <p className="py-8 text-center text-xs text-content-tertiary">No backgrounds match the selected mood</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filteredUploads.map((u) => {
            const active = activePath === u.path
            return (
              <div
                key={u.path}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={() => setDraggedPath(u.path)}
                onDragEnd={() => { setDraggedPath(null); setDragOverFolder(undefined) }}
                onClick={() => onApply(u.path)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApply(u.path) } }}
                aria-label={`Use background: ${u.path.split(/[/\\]/).pop()}`}
                aria-pressed={active}
                className={[
                  'group relative cursor-pointer overflow-hidden rounded-lg transition-all duration-150',
                  active
                    ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-panel'
                    : 'ring-1 ring-border hover:ring-border-strong hover:scale-[1.02]',
                ].join(' ')}
                style={{ aspectRatio: '16/9' }}
              >
                {u.isVideo ? (
                  <video
                    src={toAssetUrl(u.path)}
                    className="h-full w-full object-cover"
                    muted
                    preload="none"
                  />
                ) : (
                  <img
                    src={toAssetUrl(u.path)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                )}

                {active && (
                  <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow">
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}

                {folders.length > 0 && (
                  <div
                    title="Move to folder"
                    className="absolute left-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white shadow hover:bg-black/80 group-hover:flex"
                  >
                    <FolderOpen size={11} />
                    <select
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { const v = e.target.value; handleMoveToFolder(u.path, v === '' ? null : v); e.target.value = '' }}
                      value=""
                      aria-label="Move to folder"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    >
                      <option value="" disabled>Move to…</option>
                      <option value="">Uncategorized</option>
                      {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
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
        <Modal onClose={() => { setEditingPath(null); setEditingTags('') }} labelledBy="edit-tags-title" className="w-full max-w-sm rounded-xl border border-border bg-panel p-4 shadow-2xl">
            <h3 id="edit-tags-title" className="mb-3 text-sm font-bold text-content-primary">Edit Tags</h3>
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
                      : 'bg-panel-raised text-content-secondary hover:bg-border-strong',
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
              className="w-full rounded-lg border border-border bg-panel-raised px-3 py-2 text-sm text-content-primary outline-none placeholder:text-content-tertiary focus:border-blue-500 resize-none"
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
                className="flex-1 rounded-lg border border-border bg-panel px-3 py-2 text-sm font-semibold text-content-secondary hover:bg-panel-raised"
              >
                Cancel
              </button>
            </div>
        </Modal>
      )}
    </div>
  )
}
