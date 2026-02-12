import { Command } from 'commander'
import { formatOutput } from '../../../shared/utils/output'
import { internalRequest } from '../client'
import { type CommandOptions, getCredentialsOrExit, resolveAndSetActiveUserId } from './helpers'

type SearchOptions = CommandOptions & {
  workspaceId?: string
  limit?: string
  navigableOnly?: boolean
}

type SearchResult = {
  id: string
  highlight?: {
    title?: string
  }
  score: number
  spaceId: string
}

type SearchResponse = {
  results: SearchResult[]
  total: number
}

type GetSpacesResponse = Record<string, { space: Record<string, unknown> }>

async function getDefaultSpaceId(tokenV2: string): Promise<string> {
  const spacesData = (await internalRequest(tokenV2, 'getSpaces', {})) as GetSpacesResponse
  const firstUser = Object.values(spacesData)[0]
  const firstSpaceId = firstUser ? Object.keys(firstUser.space)[0] : undefined

  if (!firstSpaceId) {
    throw new Error('No space found in getSpaces response')
  }

  return firstSpaceId
}

async function searchAction(query: string, options: SearchOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const spaceId = options.workspaceId ?? (await getDefaultSpaceId(creds.token_v2))
    const body = {
      type: 'BlocksInSpace',
      query: query,
      ...(spaceId ? { spaceId } : {}),
      limit: options.limit ? Number(options.limit) : 20,
      filters: {
        isDeletedOnly: false,
        excludeTemplates: false,
        navigableBlockContentOnly: options.navigableOnly !== false,
        requireEditPermissions: false,
        ancestors: [],
        createdBy: [],
        editedBy: [],
        lastEditedTime: {},
        createdTime: {},
      },
      sort: { field: 'relevance' },
      source: 'quick_find',
    }

    const data = (await internalRequest(creds.token_v2, 'search', body)) as SearchResponse
    const output = {
      results: data.results.map((r) => ({
        id: r.id,
        title: r.highlight?.title || '',
        score: r.score,
        spaceId: r.spaceId,
      })),
      total: data.total,
    }

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

export const searchCommand = new Command('search')
  .description('Search across workspace')
  .argument('<query>', 'Search query')
  .option('--workspace-id <id>', 'Workspace ID to search in')
  .option('--limit <n>', 'Number of results')
  .option('--pretty', 'Pretty print JSON output')
  .action(searchAction)
