import { Command } from 'commander'
import type { SearchParameters } from '@notionhq/client/build/src/api-endpoints'

import { getClient } from '@/platforms/notionbot/client'
import { handleError } from '@/shared/utils/error-handler'
import { formatOutput } from '@/shared/utils/output'

async function searchAction(
  query: string,
  options: {
    filter?: string
    sort?: string
    pageSize?: number
    startCursor?: string
    pretty?: boolean
  },
): Promise<void> {
  try {
    const client = getClient()

    const params: SearchParameters = {
      query,
    }

    if (options.filter) {
      const filterValue = options.filter === 'database' ? 'data_source' : options.filter
      if (filterValue !== 'page' && filterValue !== 'data_source') {
        throw new Error(`Invalid filter value: ${options.filter}. Must be 'page' or 'database'.`)
      }
      params.filter = {
        property: 'object',
        value: filterValue,
      }
    }

    if (options.sort) {
      params.sort = {
        direction: options.sort === 'asc' ? 'ascending' : 'descending',
        timestamp: 'last_edited_time',
      }
    }

    if (options.pageSize) {
      params.page_size = options.pageSize
    }

    if (options.startCursor) {
      params.start_cursor = options.startCursor
    }

    const response = await client.search(params)

    const output = response.results.map((result) => {
      const r = result as Record<string, unknown>
      const titleArr = r.title as Array<{ plain_text: string }> | undefined

      return {
        id: r.id,
        object: r.object,
        title: titleArr ? titleArr.map((t) => t.plain_text).join('') : r.title,
        url: r.url,
        last_edited_time: r.last_edited_time,
      }
    })

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export const searchCommand = new Command('search')
  .description('Search across workspace')
  .argument('<query>', 'Search query')
  .option('--filter <type>', 'Filter by object type (page|database)')
  .option('--sort <direction>', 'Sort by last_edited_time (asc|desc)')
  .option('--page-size <n>', 'Number of results per page', (val) => parseInt(val, 10))
  .option('--start-cursor <cursor>', 'Pagination cursor')
  .option('--pretty', 'Pretty print JSON output')
  .action(searchAction)
