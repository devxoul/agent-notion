import fs from 'node:fs'
import path from 'node:path'

import type { FileInfo } from './types'

const MIME_TYPE_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.txt': 'text/plain',
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPE_MAP[ext] ?? 'application/octet-stream'
}

export function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

export function resolveFileInfo(filePath: string): FileInfo {
  const resolvedPath = path.resolve(filePath)
  const stats = fs.statSync(resolvedPath)
  const name = path.basename(resolvedPath)
  const contentType = getMimeType(resolvedPath)

  return {
    path: resolvedPath,
    name,
    size: stats.size,
    contentType,
    isImage: isImageType(contentType),
  }
}
