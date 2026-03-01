import { Client } from '@notionhq/client'
import type { AppendBlockChildrenResponse, BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints'

const BLOCK_CHUNK_SIZE = 100

export class NotionClient {
  private sdk: Client

  constructor(token: string) {
    if (!token) {
      throw new Error('NOTION_TOKEN is required. Create an integration at https://www.notion.so/profile/integrations')
    }
    this.sdk = new Client({ auth: token, notionVersion: '2025-09-03' })
  }

  get pages() {
    return this.sdk.pages
  }

  get databases() {
    return this.sdk.databases
  }

  get blocks() {
    return this.sdk.blocks
  }

  get users() {
    return this.sdk.users
  }

  get search() {
    return this.sdk.search.bind(this.sdk)
  }

  request<T extends object>(args: {
    path: string
    method: 'get' | 'post' | 'patch' | 'delete'
    body?: Record<string, unknown>
    query?: Record<string, string>
  }): Promise<T> {
    return this.sdk.request(args)
  }

  get comments() {
    return this.sdk.comments
  }

  get fileUploads() {
    return this.sdk.fileUploads
  }

  async resolveBeforePosition(
    parentId: string,
    beforeId: string,
  ): Promise<{ after: string } | { position: { type: 'start' } }> {
    let previousBlockId: string | undefined
    let cursor: string | undefined

    while (true) {
      const response = await this.sdk.blocks.children.list({
        block_id: parentId,
        ...(cursor ? { start_cursor: cursor } : {}),
      })

      for (const block of response.results) {
        if (block.id === beforeId) {
          if (previousBlockId) {
            return { after: previousBlockId }
          }
          return { position: { type: 'start' as const } }
        }
        previousBlockId = block.id
      }

      if (!response.has_more || !response.next_cursor) break
      cursor = response.next_cursor
    }

    throw new Error(`Block ${beforeId} not found in children of ${parentId}`)
  }

  async appendBlockChildren(
    blockId: string,
    children: BlockObjectRequest[],
    after?: string,
    before?: string,
  ): Promise<AppendBlockChildrenResponse[]> {
    const results: AppendBlockChildrenResponse[] = []

    let currentAfter = after
    let positionStart = false

    if (before) {
      const resolved = await this.resolveBeforePosition(blockId, before)
      if ('after' in resolved) {
        currentAfter = resolved.after
      } else {
        positionStart = true
      }
    }

    for (let i = 0; i < children.length; i += BLOCK_CHUNK_SIZE) {
      const chunk = children.slice(i, i + BLOCK_CHUNK_SIZE)
      const response = await this.sdk.blocks.children.append({
        block_id: blockId,
        children: chunk,
        ...(i === 0 && positionStart ? { position: { type: 'start' as const } } : {}),
        ...(i === 0 && currentAfter ? { after: currentAfter } : {}),
      })
      results.push(response)

      // Track last block from response for correct multi-chunk positioning
      const responseResults = (response as unknown as { results?: Array<{ id: string }> }).results
      if (responseResults?.length) {
        currentAfter = responseResults[responseResults.length - 1].id
        positionStart = false
      }
    }

    return results
  }
}

export function getClient(): NotionClient {
  const token = process.env.NOTION_TOKEN
  if (!token) {
    throw new Error('NOTION_TOKEN is required. Create an integration at https://www.notion.so/profile/integrations')
  }
  return new NotionClient(token)
}

export function getClientOrThrow(): NotionClient {
  const token = process.env.NOTION_TOKEN
  if (!token) {
    throw new Error('NOTION_TOKEN environment variable is not set')
  }
  return new NotionClient(token)
}
