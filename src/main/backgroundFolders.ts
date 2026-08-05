// Pure folder CRUD for the background media bin. Every function takes its
// base directory (or directories) as a parameter rather than reaching for
// Electron's app.getPath — that's what makes this testable with a real temp
// directory. backgroundLib.ts wires this to the real uploads/generated
// directories. See the 2026-08-03 design spec.
import { join, basename, sep } from 'path'
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync } from 'fs'

// Folder names come from user input (the "+ New folder" field, drag-and-drop,
// rename) and this module is the only layer that actually touches the
// filesystem — reject anything that could escape baseDir via join().
function assertValidFolderName(name: string): void {
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('Folder names can\'t contain path separators or "..".')
  }
  // 'ALL' is the sentinel the renderer uses for "no folder filter, show
  // everything" (selectedFolder === 'ALL'). A real folder with that exact
  // name would collide with it and become impossible to view in isolation.
  if (name === 'ALL') {
    throw new Error('Folder names can\'t be "ALL" — that name is reserved.')
  }
}

export function listFoldersIn(baseDirs: string[]): string[] {
  const names = new Set<string>()
  for (const dir of baseDirs) {
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) names.add(entry.name)
    }
  }
  return Array.from(names).sort()
}

export function createFolderIn(baseDir: string, allBaseDirs: string[], name: string): void {
  assertValidFolderName(name)
  if (listFoldersIn(allBaseDirs).includes(name)) {
    throw new Error(`A folder named "${name}" already exists.`)
  }
  mkdirSync(join(baseDir, name), { recursive: true })
}

export interface FileMove {
  oldPath: string
  newPath: string
}

// Renames a folder in every base dir it exists in (a folder is a logical
// name shared across the uploads/generated trees, not tied to one of them).
// Returns every file that moved, so the caller can keep background_tags
// rows (keyed by absolute path) correct.
export function renameFolderIn(baseDirs: string[], oldName: string, newName: string): FileMove[] {
  assertValidFolderName(oldName)
  assertValidFolderName(newName)
  if (!baseDirs.some((dir) => existsSync(join(dir, oldName)))) {
    throw new Error(`No folder named "${oldName}" exists.`)
  }
  if (listFoldersIn(baseDirs).includes(newName)) {
    throw new Error(`A folder named "${newName}" already exists.`)
  }
  const moves: FileMove[] = []
  for (const dir of baseDirs) {
    const oldDir = join(dir, oldName)
    if (!existsSync(oldDir)) continue
    const newDir = join(dir, newName)
    for (const f of readdirSync(oldDir)) {
      const oldPath = join(oldDir, f)
      const newPath = join(newDir, f)
      if (existsSync(newPath)) {
        throw new Error(`A file named "${f}" already exists in that folder.`)
      }
      moves.push({ oldPath, newPath })
    }
    renameSync(oldDir, newDir)
  }
  return moves
}

// Moves a single file into a folder (or back to the root, if folderName is
// null) within whichever allowed root it's actually inside.
export function moveFileToFolder(allowedRoots: string[], filePath: string, folderName: string | null): string {
  if (folderName !== null) assertValidFolderName(folderName)
  const root = allowedRoots.find((d) => filePath === d || filePath.startsWith(d + sep))
  if (!root) throw new Error('That file is outside the backgrounds library.')
  const filename = basename(filePath)
  const destDir = folderName ? join(root, folderName) : root
  if (folderName) mkdirSync(destDir, { recursive: true })
  const destPath = join(destDir, filename)
  if (destPath === filePath) return filePath
  if (existsSync(destPath)) {
    throw new Error(`A file named "${filename}" already exists in that folder.`)
  }
  renameSync(filePath, destPath)
  return destPath
}

// Deletes a folder, moving its contents back up to the root (Uncategorized)
// first — the files themselves are never deleted. Returns every file that
// moved, same reason as renameFolderIn.
export function deleteFolderIn(baseDirs: string[], name: string): FileMove[] {
  assertValidFolderName(name)
  const moves: FileMove[] = []
  for (const dir of baseDirs) {
    const folderDir = join(dir, name)
    if (!existsSync(folderDir)) continue
    for (const f of readdirSync(folderDir)) {
      const oldPath = join(folderDir, f)
      const newPath = join(dir, f)
      if (existsSync(newPath)) {
        throw new Error(`A file named "${f}" already exists in that folder.`)
      }
      renameSync(oldPath, newPath)
      moves.push({ oldPath, newPath })
    }
    rmdirSync(folderDir)
  }
  return moves
}
