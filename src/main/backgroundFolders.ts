// Pure folder CRUD for the background media bin. Every function takes its
// base directory (or directories) as a parameter rather than reaching for
// Electron's app.getPath — that's what makes this testable with a real temp
// directory. backgroundLib.ts wires this to the real uploads/generated
// directories. See the 2026-08-03 design spec.
import { join, basename } from 'path'
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync } from 'fs'

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
  if (listFoldersIn(baseDirs).includes(newName)) {
    throw new Error(`A folder named "${newName}" already exists.`)
  }
  const moves: FileMove[] = []
  for (const dir of baseDirs) {
    const oldDir = join(dir, oldName)
    if (!existsSync(oldDir)) continue
    const newDir = join(dir, newName)
    for (const f of readdirSync(oldDir)) {
      moves.push({ oldPath: join(oldDir, f), newPath: join(newDir, f) })
    }
    renameSync(oldDir, newDir)
  }
  return moves
}

// Moves a single file into a folder (or back to the root, if folderName is
// null) within whichever allowed root it's actually inside.
export function moveFileToFolder(allowedRoots: string[], filePath: string, folderName: string | null): string {
  const root = allowedRoots.find((d) => filePath.startsWith(d))
  if (!root) throw new Error('That file is outside the backgrounds library.')
  const filename = basename(filePath)
  const destDir = folderName ? join(root, folderName) : root
  if (folderName) mkdirSync(destDir, { recursive: true })
  const destPath = join(destDir, filename)
  if (destPath === filePath) return filePath
  renameSync(filePath, destPath)
  return destPath
}

// Deletes a folder, moving its contents back up to the root (Uncategorized)
// first — the files themselves are never deleted. Returns every file that
// moved, same reason as renameFolderIn.
export function deleteFolderIn(baseDirs: string[], name: string): FileMove[] {
  const moves: FileMove[] = []
  for (const dir of baseDirs) {
    const folderDir = join(dir, name)
    if (!existsSync(folderDir)) continue
    for (const f of readdirSync(folderDir)) {
      const oldPath = join(folderDir, f)
      const newPath = join(dir, f)
      renameSync(oldPath, newPath)
      moves.push({ oldPath, newPath })
    }
    rmdirSync(folderDir)
  }
  return moves
}
