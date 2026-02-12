import { Command } from 'commander'
import { getClient } from '../client'
import { handleError } from '../shared/utils/error-handler'
import { formatOutput } from '../shared/utils/output'

async function statusAction(options: { pretty?: boolean }): Promise<void> {
  try {
    const client = getClient()
    const me = await client.users.me({})

    const output = {
      id: me.id,
      name: me.name,
      type: me.type,
      workspace_name: me.type === 'bot' ? (me as any).bot?.workspace_name : undefined,
    }

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export const authCommand = new Command('auth')
  .description('Authentication commands')
  .addCommand(
    new Command('status')
      .description('Show authentication status by calling users.me()')
      .option('--pretty', 'Pretty print JSON output')
      .action(statusAction)
  )
