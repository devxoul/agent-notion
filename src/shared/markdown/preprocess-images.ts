import fs from 'node:fs'
import nodePath from 'node:path'

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g

export async function preprocessMarkdownImages(
  markdown: string,
  uploadFn: (filePath: string) => Promise<string>,
  basePath: string,
): Promise<string> {
  const dedupMap = new Map<string, string>()
  const matches = [...markdown.matchAll(IMAGE_PATTERN)]

  if (matches.length === 0) return markdown

  let result = markdown

  for (const match of matches) {
    const imagePath = match[2]

    // Skip empty paths
    if (!imagePath.trim()) continue

    // Skip remote URLs
    if (imagePath.includes('://')) continue

    const resolvedPath = nodePath.resolve(basePath, imagePath)

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Image file not found: ${resolvedPath}`)
    }

    let uploadedUrl = dedupMap.get(resolvedPath)
    if (!uploadedUrl) {
      uploadedUrl = await uploadFn(resolvedPath)
      dedupMap.set(resolvedPath, uploadedUrl)
    }

    const title = match[3]
    const originalText = match[0]
    const replacement = title ? `![${match[1]}](${uploadedUrl} "${title}")` : `![${match[1]}](${uploadedUrl})`
    result = result.replace(originalText, replacement)
  }

  return result
}
