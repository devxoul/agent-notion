import { type ActionRegistry, type BatchOperation, type BatchOutput, type BatchResult } from '@/shared/batch/types'
import { formatOutput } from '@/shared/utils/output'

export type BatchCommandOptions = {
  file?: string
  pretty?: boolean
}

type BatchHandler<C> = (client: C, args: Record<string, unknown>) => Promise<unknown>

export type BatchDeps<C> = {
  actionRegistry: ActionRegistry<BatchHandler<C>>
  getClientOrThrow: () => Promise<C> | C
  validateOperations: (ops: unknown[], actions: string[]) => void
  normalizeOperationArgs: (op: BatchOperation) => Record<string, unknown>
  readFileSync: (path: string, encoding: string) => string
  log: (...args: unknown[]) => void
  exit: (code?: number) => never | undefined
}

export function parseOperations<C>(
  operationsArg: string | undefined,
  file: string | undefined,
  deps: Pick<BatchDeps<C>, 'readFileSync'>,
): BatchOperation[] {
  if (!file && !operationsArg) {
    throw new Error('Either provide operations JSON as argument or use --file <path>')
  }

  const raw = file ? deps.readFileSync(file, 'utf8') : operationsArg!
  const parsed = JSON.parse(raw) as unknown

  if (!Array.isArray(parsed)) {
    throw new Error('Operations must be an array')
  }

  if (parsed.length === 0) {
    throw new Error('Operations array cannot be empty')
  }

  return parsed as BatchOperation[]
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function executeBatch<C, O extends BatchCommandOptions>(
  operationsArg: string | undefined,
  options: O,
  deps: BatchDeps<C>,
  getOperationArgs?: (operation: BatchOperation) => Record<string, unknown>,
): Promise<void> {
  const operations = parseOperations(operationsArg, options.file, deps)
  deps.validateOperations(operations, Object.keys(deps.actionRegistry))

  const client = await deps.getClientOrThrow()
  const results: BatchResult[] = []
  let failed = false

  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index]
    const action = operation.action
    const handler = deps.actionRegistry[action]

    if (!handler) {
      results.push({
        index,
        action,
        success: false,
        error: `No handler found for action: ${action}`,
      })
      failed = true
      break
    }

    try {
      const args = getOperationArgs ? getOperationArgs(operation) : deps.normalizeOperationArgs(operation)
      const data = await handler(client, args)
      results.push({ index, action, success: true, data })
    } catch (error) {
      results.push({
        index,
        action,
        success: false,
        error: toErrorMessage(error),
      })
      failed = true
      break
    }
  }

  const output: BatchOutput = {
    results,
    total: operations.length,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
  }

  deps.log(formatOutput(output, options.pretty))
  deps.exit(failed ? 1 : 0)
}
