import { readFileSync } from 'node:fs'

import { Command } from 'commander'

import {
  type ActionRegistry,
  type BatchOperation,
  type NotionHandler,
  normalizeOperationArgs,
  validateOperations,
} from '@/shared/batch/types'
import {
  type BatchCommandOptions as SharedBatchCommandOptions,
  type BatchDeps as SharedBatchDeps,
  executeBatch as executeSharedBatch,
  toErrorMessage,
} from '@/shared/batch/execute'

import { handleBlockAppend, handleBlockDelete, handleBlockMove, handleBlockUpdate, handleBlockUpload } from './block'
import { handleCommentCreate } from './comment'
import {
  handleDatabaseAddRow,
  handleDatabaseCreate,
  handleDatabaseDeleteProperty,
  handleDatabaseUpdate,
  handleDatabaseUpdateRow,
} from './database'
import * as helpers from './helpers'
import { handlePageArchive, handlePageCreate, handlePageUpdate } from './page'

type BatchCommandOptions = SharedBatchCommandOptions & {
  workspaceId: string
}

type BatchDeps = SharedBatchDeps<string> & {
  actionRegistry: ActionRegistry<NotionHandler>
  getCredentialsOrThrow: () => Promise<{ token_v2: string }>
  resolveAndSetActiveUserId: (token: string, workspaceId: string) => Promise<void>
}

export const NOTION_ACTION_REGISTRY: ActionRegistry<NotionHandler> = {
  'page.create': (tokenV2, args) => handlePageCreate(tokenV2, args as Parameters<typeof handlePageCreate>[1]),
  'page.update': (tokenV2, args) => handlePageUpdate(tokenV2, args as Parameters<typeof handlePageUpdate>[1]),
  'page.archive': (tokenV2, args) => handlePageArchive(tokenV2, args as Parameters<typeof handlePageArchive>[1]),
  'block.append': (tokenV2, args) => handleBlockAppend(tokenV2, args as Parameters<typeof handleBlockAppend>[1]),
  'block.update': (tokenV2, args) => handleBlockUpdate(tokenV2, args as Parameters<typeof handleBlockUpdate>[1]),
  'block.delete': (tokenV2, args) => handleBlockDelete(tokenV2, args as Parameters<typeof handleBlockDelete>[1]),
  'block.upload': (tokenV2, args) => handleBlockUpload(tokenV2, args as Parameters<typeof handleBlockUpload>[1]),
  'block.move': (tokenV2, args) => handleBlockMove(tokenV2, args as Parameters<typeof handleBlockMove>[1]),
  'comment.create': (tokenV2, args) => handleCommentCreate(tokenV2, args as Parameters<typeof handleCommentCreate>[1]),
  'database.create': (tokenV2, args) =>
    handleDatabaseCreate(tokenV2, args as Parameters<typeof handleDatabaseCreate>[1]),
  'database.update': (tokenV2, args) =>
    handleDatabaseUpdate(tokenV2, args as Parameters<typeof handleDatabaseUpdate>[1]),
  'database.delete-property': (tokenV2, args) =>
    handleDatabaseDeleteProperty(tokenV2, args as Parameters<typeof handleDatabaseDeleteProperty>[1]),
  'database.add-row': (tokenV2, args) =>
    handleDatabaseAddRow(tokenV2, args as Parameters<typeof handleDatabaseAddRow>[1]),
  'database.update-row': (tokenV2, args) =>
    handleDatabaseUpdateRow(tokenV2, args as Parameters<typeof handleDatabaseUpdateRow>[1]),
}

const defaultDeps: BatchDeps = {
  actionRegistry: NOTION_ACTION_REGISTRY,
  getCredentialsOrThrow: async () => {
    const fn = helpers.getCredentialsOrThrow ?? helpers.getCredentialsOrExit
    if (!fn) {
      throw new Error('getCredentialsOrThrow is not available')
    }
    return fn()
  },
  resolveAndSetActiveUserId: async (token: string, workspaceId: string) => {
    if (!helpers.resolveAndSetActiveUserId) {
      throw new Error('resolveAndSetActiveUserId is not available')
    }
    await helpers.resolveAndSetActiveUserId(token, workspaceId)
  },
  getClientOrThrow: async () => {
    const fn = helpers.getCredentialsOrThrow ?? helpers.getCredentialsOrExit
    if (!fn) {
      throw new Error('getCredentialsOrThrow is not available')
    }
    const credentials = await fn()
    return credentials.token_v2
  },
  validateOperations,
  normalizeOperationArgs,
  readFileSync: (path: string, encoding: string) => readFileSync(path, encoding as BufferEncoding),
  log: (...args: unknown[]) => console.log(...args),
  exit: (code?: number) => process.exit(code),
}

export async function executeBatch(
  operationsArg: string | undefined,
  options: BatchCommandOptions,
  overrideDeps?: Partial<BatchDeps>,
): Promise<void> {
  const deps = { ...defaultDeps, ...overrideDeps }

  await executeSharedBatch(
    operationsArg,
    options,
    {
      ...deps,
      getClientOrThrow: async () => {
        const creds = await deps.getCredentialsOrThrow()
        await deps.resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
        return creds.token_v2
      },
    },
    (operation: BatchOperation) => ({ ...deps.normalizeOperationArgs(operation), workspaceId: options.workspaceId }),
  )
}

export const batchCommand = new Command('batch')
  .description('Execute multiple write actions sequentially')
  .argument('[operations]', 'Operations as JSON array string')
  .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
  .option('--file <path>', 'Read operations JSON from file')
  .option('--pretty', 'Pretty print JSON output')
  .action(async (operations: string | undefined, options: BatchCommandOptions) => {
    try {
      await executeBatch(operations, options)
    } catch (error) {
      console.error(JSON.stringify({ error: toErrorMessage(error) }))
      process.exit(1)
    }
  })
