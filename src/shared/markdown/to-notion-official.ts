import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints'
import { markdownToBlocks } from '@tryfabric/martian'

export function markdownToOfficialBlocks(markdown: string): BlockObjectRequest[] {
  if (!markdown?.trim()) {
    return []
  }
  return markdownToBlocks(markdown) as BlockObjectRequest[]
}
