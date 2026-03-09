import { describe, expect, mock, test } from 'bun:test'

import { type ActionRegistry, type NotionHandler, normalizeOperationArgs } from '../../../shared/batch/types'

const validActions = [
  'page.create',
  'page.update',
  'page.archive',
  'block.append',
  'block.update',
  'block.delete',
  'comment.create',
  'database.create',
  'database.update',
  'database.delete-property',
  'database.add-row',
  'database.update-row',
  'block.upload',
  'block.move',
]

function createMockHandlers() {
  const createHandlerMock = () =>
    mock(async (_tokenV2: string, _args: Record<string, unknown>): Promise<unknown> => ({}))

  return {
    mockPageCreate: createHandlerMock(),
    mockPageUpdate: createHandlerMock(),
    mockPageArchive: createHandlerMock(),
    mockBlockAppend: createHandlerMock(),
    mockBlockUpdate: createHandlerMock(),
    mockBlockDelete: createHandlerMock(),
    mockCommentCreate: createHandlerMock(),
    mockDatabaseCreate: createHandlerMock(),
    mockDatabaseUpdate: createHandlerMock(),
    mockDatabaseDeleteProperty: createHandlerMock(),
    mockDatabaseAddRow: createHandlerMock(),
    mockDatabaseUpdateRow: createHandlerMock(),
    mockBlockUpload: createHandlerMock(),
    mockBlockMove: createHandlerMock(),
  }
}

function createMockRegistry(handlers: ReturnType<typeof createMockHandlers>): ActionRegistry<NotionHandler> {
  return {
    'page.create': handlers.mockPageCreate,
    'page.update': handlers.mockPageUpdate,
    'page.archive': handlers.mockPageArchive,
    'block.append': handlers.mockBlockAppend,
    'block.update': handlers.mockBlockUpdate,
    'block.delete': handlers.mockBlockDelete,
    'comment.create': handlers.mockCommentCreate,
    'database.create': handlers.mockDatabaseCreate,
    'database.update': handlers.mockDatabaseUpdate,
    'database.delete-property': handlers.mockDatabaseDeleteProperty,
    'database.add-row': handlers.mockDatabaseAddRow,
    'database.update-row': handlers.mockDatabaseUpdateRow,
    'block.upload': handlers.mockBlockUpload,
    'block.move': handlers.mockBlockMove,
  }
}

function createDefaultDeps(handlers: ReturnType<typeof createMockHandlers>) {
  const output: string[] = []
  let exitCode: number | undefined
  const mockValidateOperations = mock(() => {})
  const mockGetCredentialsOrThrow = mock(async () => ({ token_v2: 'test-token' }))
  const mockResolveAndSetActiveUserId = mock(async () => {})

  return {
    deps: {
      actionRegistry: createMockRegistry(handlers),
      getCredentialsOrThrow: mockGetCredentialsOrThrow,
      resolveAndSetActiveUserId: mockResolveAndSetActiveUserId,
      validateOperations: mockValidateOperations,
      normalizeOperationArgs,
      readFileSync: mock(() => '[]'),
      log: (...args: unknown[]) => output.push(args.map(String).join(' ')),
      exit: (code?: number): undefined => {
        exitCode = code
        return undefined
      },
    },
    output,
    getExitCode: () => exitCode,
    mockValidateOperations,
    mockGetCredentialsOrThrow,
    mockResolveAndSetActiveUserId,
  }
}

describe('batch command', () => {
  test('valid single operation outputs success summary', async () => {
    const handlers = createMockHandlers()
    const { deps, output, getExitCode, mockValidateOperations, mockResolveAndSetActiveUserId } =
      createDefaultDeps(handlers)
    handlers.mockPageArchive.mockImplementationOnce(async () => ({ archived: true, id: 'page-1' }))

    const { executeBatch } = await import('./batch')
    await executeBatch('[{"action":"page.archive","page_id":"page-1"}]', { workspaceId: 'space-123' }, deps)

    expect(mockValidateOperations).toHaveBeenCalledWith([{ action: 'page.archive', page_id: 'page-1' }], validActions)
    expect(mockResolveAndSetActiveUserId).toHaveBeenCalledWith('test-token', 'space-123')
    expect(output.length).toBe(1)
    expect(JSON.parse(output[0])).toEqual({
      results: [{ index: 0, action: 'page.archive', success: true, data: { archived: true, id: 'page-1' } }],
      total: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(getExitCode()).toBe(0)
  })

  test('valid multiple operations execute sequentially and all succeed', async () => {
    const handlers = createMockHandlers()
    const { deps, output, getExitCode } = createDefaultDeps(handlers)
    handlers.mockPageCreate.mockImplementationOnce(async () => ({ id: 'p1' }))
    handlers.mockBlockAppend.mockImplementationOnce(async () => ({ created: ['b1'] }))

    const { executeBatch } = await import('./batch')
    await executeBatch(
      '[{"action":"page.create","parent":"root","title":"Hello"},{"action":"block.append","parent_id":"p1","content":"[]"}]',
      {
        workspaceId: 'space-123',
      },
      deps,
    )

    expect(output.length).toBe(1)
    expect(JSON.parse(output[0])).toEqual({
      results: [
        { index: 0, action: 'page.create', success: true, data: { id: 'p1' } },
        { index: 1, action: 'block.append', success: true, data: { created: ['b1'] } },
      ],
      total: 2,
      succeeded: 2,
      failed: 0,
    })
    expect(getExitCode()).toBe(0)
  })

  test('first operation failure triggers fail-fast and exit 1', async () => {
    const handlers = createMockHandlers()
    const { deps, output, getExitCode } = createDefaultDeps(handlers)
    handlers.mockPageCreate.mockImplementationOnce(async () => {
      throw new Error('create failed')
    })

    const { executeBatch } = await import('./batch')
    await executeBatch(
      '[{"action":"page.create","parent":"root","title":"Hello"},{"action":"block.append","parent_id":"p1","content":"[]"}]',
      {
        workspaceId: 'space-123',
      },
      deps,
    )

    expect(handlers.mockBlockAppend).not.toHaveBeenCalled()
    expect(JSON.parse(output[0])).toEqual({
      results: [{ index: 0, action: 'page.create', success: false, error: 'create failed' }],
      total: 2,
      succeeded: 0,
      failed: 1,
    })
    expect(getExitCode()).toBe(1)
  })

  test('invalid action name throws from validateOperations before execution', async () => {
    const handlers = createMockHandlers()
    const { deps, mockValidateOperations, mockGetCredentialsOrThrow } = createDefaultDeps(handlers)
    mockValidateOperations.mockImplementationOnce(() => {
      throw new Error('Invalid action "bad.action" at index 0')
    })

    const { executeBatch } = await import('./batch')

    await expect(
      executeBatch(
        '[{"action":"bad.action"}]',
        {
          workspaceId: 'space-123',
        },
        deps,
      ),
    ).rejects.toThrow('Invalid action "bad.action" at index 0')

    expect(mockGetCredentialsOrThrow).not.toHaveBeenCalled()
  })

  test('empty operations array throws validation error', async () => {
    const handlers = createMockHandlers()
    const { deps } = createDefaultDeps(handlers)
    const { executeBatch } = await import('./batch')

    await expect(
      executeBatch(
        '[]',
        {
          workspaceId: 'space-123',
        },
        deps,
      ),
    ).rejects.toThrow('Operations array cannot be empty')
  })

  test('invalid JSON string throws parse error', async () => {
    const handlers = createMockHandlers()
    const { deps } = createDefaultDeps(handlers)
    const { executeBatch } = await import('./batch')

    await expect(
      executeBatch(
        '{not-json}',
        {
          workspaceId: 'space-123',
        },
        deps,
      ),
    ).rejects.toThrow()
  })

  test('missing operations arg and --file throws helpful error', async () => {
    const handlers = createMockHandlers()
    const { deps } = createDefaultDeps(handlers)
    const { executeBatch } = await import('./batch')

    await expect(
      executeBatch(
        undefined,
        {
          workspaceId: 'space-123',
        },
        deps,
      ),
    ).rejects.toThrow('Either provide operations JSON as argument or use --file <path>')
  })

  test('--file option reads operations JSON from file path', async () => {
    const handlers = createMockHandlers()
    const { deps, output, getExitCode } = createDefaultDeps(handlers)
    const mockReadFileSync = mock(() => '[{"action":"page.archive","page_id":"page-1"}]')
    deps.readFileSync = mockReadFileSync

    const { executeBatch } = await import('./batch')

    await executeBatch(
      '[{"action":"page.create"}]',
      {
        workspaceId: 'space-123',
        file: '/tmp/ops.json',
      },
      deps,
    )

    expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/ops.json', 'utf8')
    expect(output.length).toBe(1)
    expect(getExitCode()).toBe(0)
  })

  test('object-valued properties are stringified before passing to handler', async () => {
    const handlers = createMockHandlers()
    const { deps, getExitCode } = createDefaultDeps(handlers)
    handlers.mockDatabaseAddRow.mockImplementationOnce(async () => ({ id: 'row-1' }))

    const { executeBatch } = await import('./batch')
    await executeBatch(
      '[{"action":"database.add-row","database_id":"db-1","title":"Test","properties":{"Status":"P0"}}]',
      { workspaceId: 'space-123' },
      deps,
    )

    const handlerArgsUnknown = handlers.mockDatabaseAddRow.mock.calls[0]?.[1] as unknown
    expect(handlerArgsUnknown).toBeDefined()
    const handlerArgs = handlerArgsUnknown as Record<string, unknown>
    expect(handlerArgs.properties).toBe('{"Status":"P0"}')
    expect(handlerArgs.database_id).toBe('db-1')
    expect(handlerArgs.title).toBe('Test')
    expect(handlerArgs.workspaceId).toBe('space-123')
    expect(getExitCode()).toBe(0)
  })

  test('block.upload action calls upload handler with correct args', async () => {
    const handlers = createMockHandlers()
    const { deps, output, getExitCode } = createDefaultDeps(handlers)
    handlers.mockBlockUpload.mockImplementationOnce(async () => ({
      id: 'file-1',
      type: 'image',
      url: 'https://example.com/file.png',
    }))

    const { executeBatch } = await import('./batch')
    await executeBatch(
      '[{"action":"block.upload","parent_id":"block-1","file":"/tmp/image.png"}]',
      { workspaceId: 'space-123' },
      deps,
    )

    expect(handlers.mockBlockUpload).toHaveBeenCalledTimes(1)
    const callArgs = handlers.mockBlockUpload.mock.calls[0] as unknown[]
    expect(callArgs[0]).toBe('test-token')
    const handlerArgs = callArgs[1] as Record<string, unknown>
    expect(handlerArgs.parent_id).toBe('block-1')
    expect(handlerArgs.file).toBe('/tmp/image.png')
    expect(handlerArgs.workspaceId).toBe('space-123')
    expect(JSON.parse(output[0])).toEqual({
      results: [
        {
          index: 0,
          action: 'block.upload',
          success: true,
          data: { id: 'file-1', type: 'image', url: 'https://example.com/file.png' },
        },
      ],
      total: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(getExitCode()).toBe(0)
  })

  test('registry includes all 14 notion action names', async () => {
    const { NOTION_ACTION_REGISTRY } = await import('./batch')

    expect(Object.keys(NOTION_ACTION_REGISTRY).sort()).toEqual([...validActions].sort())
  })
})
