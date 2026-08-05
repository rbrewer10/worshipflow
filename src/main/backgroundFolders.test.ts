import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  listFoldersIn, createFolderIn, renameFolderIn, moveFileToFolder, deleteFolderIn
} from './backgroundFolders'

describe('backgroundFolders', () => {
  let uploadsDir: string
  let generatedDir: string

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'wf-bg-folders-'))
    uploadsDir = join(root, 'uploads')
    generatedDir = join(root, 'generated')
    mkdirSync(uploadsDir, { recursive: true })
    mkdirSync(generatedDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(join(uploadsDir, '..'), { recursive: true, force: true })
  })

  it('lists no folders when none exist', () => {
    expect(listFoldersIn([uploadsDir, generatedDir])).toEqual([])
  })

  it('creates a folder and lists it', () => {
    createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'Easter')
    expect(listFoldersIn([uploadsDir, generatedDir])).toEqual(['Easter'])
    expect(existsSync(join(uploadsDir, 'Easter'))).toBe(true)
  })

  it('rejects creating a folder with a name that already exists', () => {
    createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'Easter')
    expect(() => createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'Easter')).toThrow()
  })

  it('rejects a duplicate name even if the existing folder is in the other base dir', () => {
    createFolderIn(generatedDir, [uploadsDir, generatedDir], 'Christmas')
    expect(() => createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'Christmas')).toThrow()
  })

  it('moves a file into a folder', () => {
    const filePath = join(uploadsDir, 'photo.jpg')
    writeFileSync(filePath, 'fake image data')
    const newPath = moveFileToFolder([uploadsDir, generatedDir], filePath, 'Easter')
    expect(newPath).toBe(join(uploadsDir, 'Easter', 'photo.jpg'))
    expect(existsSync(newPath)).toBe(true)
    expect(existsSync(filePath)).toBe(false)
  })

  it('moves a file back to Uncategorized when folderName is null', () => {
    const filePath = join(uploadsDir, 'Easter', 'photo.jpg')
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    writeFileSync(filePath, 'fake image data')
    const newPath = moveFileToFolder([uploadsDir, generatedDir], filePath, null)
    expect(newPath).toBe(join(uploadsDir, 'photo.jpg'))
    expect(existsSync(newPath)).toBe(true)
  })

  it('rejects moving a file outside the allowed roots', () => {
    const outside = join(tmpdir(), 'not-a-backgrounds-dir.jpg')
    writeFileSync(outside, 'x')
    expect(() => moveFileToFolder([uploadsDir, generatedDir], outside, 'Easter')).toThrow()
    rmSync(outside, { force: true })
  })

  it('renames a folder and reports every file that moved', () => {
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    writeFileSync(join(uploadsDir, 'Easter', 'a.jpg'), 'x')
    writeFileSync(join(uploadsDir, 'Easter', 'b.jpg'), 'x')
    const moves = renameFolderIn([uploadsDir, generatedDir], 'Easter', 'Spring')
    expect(moves.sort((a, b) => a.oldPath.localeCompare(b.oldPath))).toEqual([
      { oldPath: join(uploadsDir, 'Easter', 'a.jpg'), newPath: join(uploadsDir, 'Spring', 'a.jpg') },
      { oldPath: join(uploadsDir, 'Easter', 'b.jpg'), newPath: join(uploadsDir, 'Spring', 'b.jpg') }
    ])
    expect(existsSync(join(uploadsDir, 'Spring', 'a.jpg'))).toBe(true)
    expect(existsSync(join(uploadsDir, 'Easter'))).toBe(false)
  })

  it('rejects renaming a folder to a name that already exists', () => {
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    mkdirSync(join(uploadsDir, 'Christmas'), { recursive: true })
    expect(() => renameFolderIn([uploadsDir, generatedDir], 'Easter', 'Christmas')).toThrow()
  })

  it('deletes a folder, moving its contents up to Uncategorized', () => {
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    writeFileSync(join(uploadsDir, 'Easter', 'a.jpg'), 'x')
    const moves = deleteFolderIn([uploadsDir, generatedDir], 'Easter')
    expect(moves).toEqual([
      { oldPath: join(uploadsDir, 'Easter', 'a.jpg'), newPath: join(uploadsDir, 'a.jpg') }
    ])
    expect(existsSync(join(uploadsDir, 'a.jpg'))).toBe(true)
    expect(existsSync(join(uploadsDir, 'Easter'))).toBe(false)
  })

  it('deleting an empty folder just removes it, with no moves', () => {
    mkdirSync(join(uploadsDir, 'Empty'), { recursive: true })
    const moves = deleteFolderIn([uploadsDir, generatedDir], 'Empty')
    expect(moves).toEqual([])
    expect(existsSync(join(uploadsDir, 'Empty'))).toBe(false)
  })

  it('rejects folder names containing path traversal or separators', () => {
    expect(() => createFolderIn(uploadsDir, [uploadsDir, generatedDir], '../evil')).toThrow()
    expect(() => createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'a/b')).toThrow()
    expect(() => createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'a\\b')).toThrow()
    expect(existsSync(join(uploadsDir, '..', 'evil'))).toBe(false)
  })

  it('rejects renaming to or from an invalid folder name', () => {
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    expect(() => renameFolderIn([uploadsDir, generatedDir], 'Easter', '../evil')).toThrow()
    expect(() => renameFolderIn([uploadsDir, generatedDir], '../evil', 'Easter')).toThrow()
  })

  it('rejects moving a file into a folder name with path traversal', () => {
    const filePath = join(uploadsDir, 'photo.jpg')
    writeFileSync(filePath, 'x')
    expect(() => moveFileToFolder([uploadsDir, generatedDir], filePath, '../evil')).toThrow()
  })

  it('rejects renaming a folder that does not exist', () => {
    expect(() => renameFolderIn([uploadsDir, generatedDir], 'Nope', 'Spring')).toThrow()
  })

  it('rejects a folder named "ALL" — it collides with the UI\'s show-everything sentinel', () => {
    expect(() => createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'ALL')).toThrow()
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    expect(() => renameFolderIn([uploadsDir, generatedDir], 'Easter', 'ALL')).toThrow()
  })

  it('rejects moving a file into a folder when it would overwrite an existing file', () => {
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    writeFileSync(join(uploadsDir, 'Easter', 'photo.jpg'), 'existing')
    const filePath = join(uploadsDir, 'photo.jpg')
    writeFileSync(filePath, 'incoming')
    expect(() => moveFileToFolder([uploadsDir, generatedDir], filePath, 'Easter')).toThrow()
    // Neither file should have been touched.
    expect(existsSync(filePath)).toBe(true)
    expect(existsSync(join(uploadsDir, 'Easter', 'photo.jpg'))).toBe(true)
  })

  it('rejects renaming a folder when the destination name is already taken', () => {
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    writeFileSync(join(uploadsDir, 'Easter', 'a.jpg'), 'incoming')
    mkdirSync(join(generatedDir, 'Spring'), { recursive: true })
    writeFileSync(join(generatedDir, 'Spring', 'a.jpg'), 'existing')
    expect(() => renameFolderIn([uploadsDir, generatedDir], 'Easter', 'Spring')).toThrow()
    // Nothing should have moved.
    expect(existsSync(join(uploadsDir, 'Easter', 'a.jpg'))).toBe(true)
    expect(existsSync(join(generatedDir, 'Spring', 'a.jpg'))).toBe(true)
  })

  it('rejects deleting a folder when it would overwrite a file already in Uncategorized', () => {
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    writeFileSync(join(uploadsDir, 'Easter', 'a.jpg'), 'incoming')
    writeFileSync(join(uploadsDir, 'a.jpg'), 'existing')
    expect(() => deleteFolderIn([uploadsDir, generatedDir], 'Easter')).toThrow()
  })
})
