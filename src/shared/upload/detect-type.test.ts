import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getMimeType, isImageType, resolveFileInfo } from './detect-type'
import type { FileInfo } from './types'

describe('getMimeType', () => {
  test('returns image/png for .png', () => {
    expect(getMimeType('file.png')).toBe('image/png')
  })

  test('returns image/png for .PNG (uppercase)', () => {
    expect(getMimeType('file.PNG')).toBe('image/png')
  })

  test('returns image/jpeg for .jpg', () => {
    expect(getMimeType('file.jpg')).toBe('image/jpeg')
  })

  test('returns image/jpeg for .jpeg', () => {
    expect(getMimeType('file.jpeg')).toBe('image/jpeg')
  })

  test('returns image/jpeg for .JPG (uppercase)', () => {
    expect(getMimeType('file.JPG')).toBe('image/jpeg')
  })

  test('returns image/gif for .gif', () => {
    expect(getMimeType('file.gif')).toBe('image/gif')
  })

  test('returns image/svg+xml for .svg', () => {
    expect(getMimeType('file.svg')).toBe('image/svg+xml')
  })

  test('returns image/webp for .webp', () => {
    expect(getMimeType('file.webp')).toBe('image/webp')
  })

  test('returns application/pdf for .pdf', () => {
    expect(getMimeType('file.pdf')).toBe('application/pdf')
  })

  test('returns application/zip for .zip', () => {
    expect(getMimeType('file.zip')).toBe('application/zip')
  })

  test('returns text/plain for .txt', () => {
    expect(getMimeType('file.txt')).toBe('text/plain')
  })

  test('returns application/octet-stream for unknown extension', () => {
    expect(getMimeType('file.unknown')).toBe('application/octet-stream')
  })

  test('returns application/octet-stream for file with no extension', () => {
    expect(getMimeType('file')).toBe('application/octet-stream')
  })
})

describe('isImageType', () => {
  test('returns true for image/png', () => {
    expect(isImageType('image/png')).toBe(true)
  })

  test('returns true for image/jpeg', () => {
    expect(isImageType('image/jpeg')).toBe(true)
  })

  test('returns true for image/gif', () => {
    expect(isImageType('image/gif')).toBe(true)
  })

  test('returns true for image/svg+xml', () => {
    expect(isImageType('image/svg+xml')).toBe(true)
  })

  test('returns true for image/webp', () => {
    expect(isImageType('image/webp')).toBe(true)
  })

  test('returns false for application/pdf', () => {
    expect(isImageType('application/pdf')).toBe(false)
  })

  test('returns false for application/zip', () => {
    expect(isImageType('application/zip')).toBe(false)
  })

  test('returns false for text/plain', () => {
    expect(isImageType('text/plain')).toBe(false)
  })

  test('returns false for application/octet-stream', () => {
    expect(isImageType('application/octet-stream')).toBe(false)
  })
})

describe('resolveFileInfo', () => {
  let tempDir: string
  let tempFile: string

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-notion-test-'))
    tempFile = path.join(tempDir, 'test-image.png')
    fs.writeFileSync(tempFile, Buffer.from([0x89, 0x50, 0x4e, 0x47])) // PNG magic bytes
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true })
  })

  test('returns FileInfo with correct properties', () => {
    const info = resolveFileInfo(tempFile)

    expect(info).toHaveProperty('path')
    expect(info).toHaveProperty('name')
    expect(info).toHaveProperty('size')
    expect(info).toHaveProperty('contentType')
    expect(info).toHaveProperty('isImage')
  })

  test('resolves absolute path correctly', () => {
    const info = resolveFileInfo(tempFile)
    expect(info.path).toBe(path.resolve(tempFile))
  })

  test('extracts correct filename', () => {
    const info = resolveFileInfo(tempFile)
    expect(info.name).toBe('test-image.png')
  })

  test('returns correct file size', () => {
    const info = resolveFileInfo(tempFile)
    expect(info.size).toBe(4)
  })

  test('detects correct MIME type', () => {
    const info = resolveFileInfo(tempFile)
    expect(info.contentType).toBe('image/png')
  })

  test('sets isImage to true for image files', () => {
    const info = resolveFileInfo(tempFile)
    expect(info.isImage).toBe(true)
  })

  test('sets isImage to false for non-image files', () => {
    const pdfFile = path.join(tempDir, 'test.pdf')
    fs.writeFileSync(pdfFile, Buffer.from([0x25, 0x50, 0x44, 0x46])) // PDF magic bytes

    const info = resolveFileInfo(pdfFile)
    expect(info.isImage).toBe(false)
  })

  test('matches FileInfo type', () => {
    const info = resolveFileInfo(tempFile)
    const typed: FileInfo = info
    expect(typed.path).toBeDefined()
    expect(typed.name).toBeDefined()
    expect(typed.size).toBeDefined()
    expect(typed.contentType).toBeDefined()
    expect(typed.isImage).toBeDefined()
  })
})
