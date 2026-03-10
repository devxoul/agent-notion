import { readFileSync } from 'node:fs'

import { Command } from 'commander'

import { getClientOrThrow } from '@/platforms/notionbot/client'
import {
  type ActionRegistry,
  type NotionBotHandler,
  normalizeOperationArgs,
  validateOperations,
} from '@/shared/batch/types'
import {
  type BatchCommandOptions,
  type BatchDeps,
  executeBatch as executeSharedBatch,
} from '@/shared/batch/execute'
import { handleError } from '@/shared/utils/error-handler'

import { handleBlockAppend, handleBlockDelete, handleBlockUpdate, handleBlockUpload } from './block'
import { handleCommentCreate } from './comment'
import { handleDatabaseCreate, handleDatabaseDeleteProperty, handleDatabaseUpdate } from './database'
import { handlePageArchive, handlePageCreate, handlePageUpdate } from './page'

type NotionBotBatchDeps = BatchDeps<unknown> & {
  actionRegistry: ActionRegistry<NotionBotHandler>
}

export const NOTIONBOT_ACTION_REGISTRY: ActionRegistry<NotionBotHandler> = {
  'page.create': (client, args) => handlePageCreate(client, args as Parameters<typeof handlePageCreate>[1]),
  'page.update': (client, args) => handlePageUpdate(client, args as Parameters<typeof handlePageUpdate>[1]),
  'page.archive': (client, args) => handlePageArchive(client, args as Parameters<typeof handlePageArchive>[1]),
  'block.append': (client, args) => handleBlockAppend(client, args as Parameters<typeof handleBlockAppend>[1]),
  'block.update': (client, args) => handleBlockUpdate(client, args as Parameters<typeof handleBlockUpdate>[1]),
  'block.delete': (client, args) => handleBlockDelete(client, args as Parameters<typeof handleBlockDelete>[1]),
  'block.upload': (client, args) => handleBlockUpload(client, args as Parameters<typeof handleBlockUpload>[1]),
  'comment.create': (client, args) => handleCommentCreate(client, args as Parameters<typeof handleCommentCreate>[1]),
  'database.create': (client, args) => handleDatabaseCreate(client, args as Parameters<typeof handleDatabaseCreate>[1]),
  'database.update': (client, args) => handleDatabaseUpdate(client, args as Parameters<typeof handleDatabaseUpdate>[1]),
  'database.delete-property': (client, args) =>
    handleDatabaseDeleteProperty(client, args as Parameters<typeof handleDatabaseDeleteProperty>[1]),
}

const defaultDeps: NotionBotBatchDeps = {
  actionRegistry: NOTIONBOT_ACTION_REGISTRY,
  getClientOrThrow,
  validateOperations,
  normalizeOperationArgs,
  readFileSync: (path: string, encoding: string) => readFileSync(path, encoding as BufferEncoding),
  log: (...args: unknown[]) => console.log(...args),
  exit: (code?: number) => process.exit(code),
}

export async function executeBatch(
  operationsArg: string | undefined,
  options: BatchCommandOptions,
  overrideDeps?: Partial<NotionBotBatchDeps>,
): Promise<void> {
  const deps = { ...defaultDeps, ...overrideDeps }

  await executeSharedBatch(operationsArg, options, deps)
}

export const batchCommand = new Command('batch')
  .description('Execute multiple write actions sequentially')
  .argument('[operations]', 'Operations as JSON array string')
  .option('--file <path>', 'Read operations JSON from file')
  .option('--pretty', 'Pretty print JSON output')
  .action(async (operations: string | undefined, options: BatchCommandOptions) => {
    try {
      await executeBatch(operations, options)
    } catch (error) {
      handleError(error as Error)
    }
  })
