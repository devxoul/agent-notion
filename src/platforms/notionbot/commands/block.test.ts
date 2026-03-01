import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockBlockRetrieve = mock(() =>
  Promise.resolve({
    id: 'block-123',
    type: 'paragraph',
    has_children: false,
    paragraph: { rich_text: [] },
  } as any),
)
const mockBlockUpdate = mock(() =>
  Promise.resolve({
    id: 'block-123',
    type: 'paragraph',
    has_children: false,
    paragraph: { rich_text: [] },
  } as any),
)
const mockBlockDelete = mock(() =>
  Promise.resolve({
    id: 'block-123',
    type: 'paragraph',
    has_children: false,
    paragraph: { rich_text: [] },
    archived: true,
  } as any),
)
const mockChildrenList = mock(() =>
  Promise.resolve({ results: [{ id: 'child-1' }], has_more: false, next_cursor: null } as any),
)
const mockAppendBlockChildren = mock(() => Promise.resolve([{ results: [] }] as any))
const mockUploadFile = mock(() =>
  Promise.resolve({
    id: 'uploaded-block-1',
    type: 'image' as const,
    url: 'https://www.notion.so/file-uploads/upload-123',
  }),
)
const mockUploadFileOnly = mock(() =>
  Promise.resolve({
    fileUploadId: 'upload-123',
    url: 'https://www.notion.so/file-uploads/upload-123',
    contentType: 'image/png',
  }),
)
const mockPreprocessMarkdownImages = mock(
  (markdown: string, _uploadFn: (filePath: string) => Promise<string>, _basePath: string) => Promise.resolve(markdown),
)

mock.module('../client', () => ({
  getClient: () => ({
    blocks: {
      retrieve: mockBlockRetrieve,
      update: mockBlockUpdate,
      delete: mockBlockDelete,
      children: {
        list: mockChildrenList,
      },
    },
    appendBlockChildren: mockAppendBlockChildren,
  }),
}))

mock.module('@/shared/markdown/read-input', () => ({
  readMarkdownInput: (options: any) => {
    if (options.markdown) return options.markdown
    if (options.markdownFile) return '# File content'
    throw new Error('No markdown provided')
  },
}))

mock.module('@/platforms/notionbot/upload', () => ({
  uploadFile: mockUploadFile,
  uploadFileOnly: mockUploadFileOnly,
}))

mock.module('@/shared/markdown/preprocess-images', () => ({
  preprocessMarkdownImages: mockPreprocessMarkdownImages,
}))

const { blockCommand } = await import('./block')

describe('block commands', () => {
  let consoleOutput: string[]
  let consoleErrors: string[]
  let originalLog: typeof console.log
  let originalError: typeof console.error
  let originalExit: typeof process.exit

  beforeEach(() => {
    consoleOutput = []
    consoleErrors = []
    originalLog = console.log
    originalError = console.error
    originalExit = process.exit

    console.log = (...args: any[]) => consoleOutput.push(args.join(' '))
    console.error = (...args: any[]) => consoleErrors.push(args.join(' '))
    process.exit = mock(() => {
      throw new Error('process.exit called')
    }) as any

    mockBlockRetrieve.mockReset()
    mockBlockUpdate.mockReset()
    mockBlockDelete.mockReset()
    mockChildrenList.mockReset()
    mockAppendBlockChildren.mockReset()
    mockUploadFile.mockReset()
    mockUploadFile.mockImplementation(() =>
      Promise.resolve({
        id: 'uploaded-block-1',
        type: 'image' as const,
        url: 'https://www.notion.so/file-uploads/upload-123',
      }),
    )
    mockUploadFileOnly.mockReset()
    mockUploadFileOnly.mockImplementation(() =>
      Promise.resolve({
        fileUploadId: 'upload-123',
        url: 'https://www.notion.so/file-uploads/upload-123',
        contentType: 'image/png',
      }),
    )
    mockPreprocessMarkdownImages.mockReset()
    mockPreprocessMarkdownImages.mockImplementation(
      (markdown: string, _uploadFn: (filePath: string) => Promise<string>, _basePath: string) =>
        Promise.resolve(markdown),
    )
  })

  afterEach(() => {
    console.log = originalLog
    console.error = originalError
    process.exit = originalExit
  })

  test('get retrieves a block by id', async () => {
    // Given
    mockBlockRetrieve.mockResolvedValue({
      id: 'block-abc',
      type: 'heading_1',
      has_children: false,
      heading_1: { rich_text: [{ plain_text: 'Hello' }], color: 'default' },
    })

    // When
    await blockCommand.parseAsync(['get', 'block-abc'], { from: 'user' })

    // Then
    expect(mockBlockRetrieve).toHaveBeenCalledWith({ block_id: 'block-abc' })
    const output = JSON.parse(consoleOutput[0])
    expect(output.id).toBe('block-abc')
    expect(output.type).toBe('heading_1')
    expect(output.content).toBe('Hello')
    expect(output.has_children).toBe(false)
  })

  test('children lists child blocks with pagination options', async () => {
    // Given
    mockChildrenList.mockResolvedValue({
      results: [
        { id: 'child-1', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: 'Text 1' }] } },
        { id: 'child-2', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: 'Text 2' }] } },
      ],
      has_more: true,
      next_cursor: 'cursor-xyz',
    } as any)

    // When
    await blockCommand.parseAsync(['children', 'parent-123', '--page-size', '10', '--start-cursor', 'abc'], {
      from: 'user',
    })

    // Then
    expect(mockChildrenList).toHaveBeenCalledWith({
      block_id: 'parent-123',
      page_size: 10,
      start_cursor: 'abc',
    })
    const output = JSON.parse(consoleOutput[0])
    expect(output.results).toHaveLength(2)
    expect(output.results[0].content).toBe('Text 1')
    expect(output.has_more).toBe(true)
    expect(output.next_cursor).toBe('cursor-xyz')
  })

  test('append sends block children to parent', async () => {
    // Given
    const children = [{ type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'hi' } }] } }]
    const resultBlock = { id: 'new-block-1', type: 'paragraph', has_children: false }
    mockAppendBlockChildren.mockResolvedValue([{ results: [resultBlock] }] as any)

    // When
    await blockCommand.parseAsync(['append', 'parent-456', '--content', JSON.stringify(children)], {
      from: 'user',
    })

    // Then
    expect(mockAppendBlockChildren).toHaveBeenCalledWith('parent-456', children, undefined, undefined)
    const output = JSON.parse(consoleOutput[0])
    expect(output.results[0].id).toBe('new-block-1')
    expect(output.results[0].type).toBe('paragraph')
  })

  test('append with --after passes after to appendBlockChildren', async () => {
    // Given
    const children = [{ type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'hi' } }] } }]
    mockAppendBlockChildren.mockResolvedValue([{ results: [] }] as any)

    // When
    await blockCommand.parseAsync(
      ['append', 'parent-456', '--after', 'sibling-1', '--content', JSON.stringify(children)],
      {
        from: 'user',
      },
    )

    // Then
    expect(mockAppendBlockChildren).toHaveBeenCalledWith('parent-456', children, 'sibling-1', undefined)
  })

  test('append with --before passes before to appendBlockChildren', async () => {
    // Given
    const children = [{ type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'hi' } }] } }]
    mockAppendBlockChildren.mockResolvedValue([{ results: [] }] as any)

    // When
    await blockCommand.parseAsync(
      ['append', 'parent-456', '--before', 'sibling-1', '--content', JSON.stringify(children)],
      {
        from: 'user',
      },
    )

    // Then
    expect(mockAppendBlockChildren).toHaveBeenCalledWith('parent-456', children, undefined, 'sibling-1')
  })

  test('append chunks >100 blocks via client.appendBlockChildren', async () => {
    // Given — 150 blocks
    const children = Array.from({ length: 150 }, (_, i) => ({
      type: 'paragraph',
      paragraph: { rich_text: [{ text: { content: `block-${i}` } }] },
    }))
    mockAppendBlockChildren.mockResolvedValue([{ results: [] }, { results: [] }] as any)

    // When
    await blockCommand.parseAsync(['append', 'parent-789', '--content', JSON.stringify(children)], {
      from: 'user',
    })

    // Then — client.appendBlockChildren handles chunking internally, called once with all 150
    expect(mockAppendBlockChildren).toHaveBeenCalledWith('parent-789', children, undefined, undefined)
  })

  test('update modifies a block', async () => {
    // Given
    const content = { paragraph: { rich_text: [{ text: { content: 'updated' } }] } }
    mockBlockUpdate.mockResolvedValue({
      id: 'block-upd',
      type: 'paragraph',
      has_children: false,
      paragraph: { rich_text: [{ plain_text: 'updated' }] },
    } as any)

    // When
    await blockCommand.parseAsync(['update', 'block-upd', '--content', JSON.stringify(content)], {
      from: 'user',
    })

    // Then
    expect(mockBlockUpdate).toHaveBeenCalledWith({ block_id: 'block-upd', ...content })
    const output = JSON.parse(consoleOutput[0])
    expect(output.id).toBe('block-upd')
    expect(output.content).toBe('updated')
  })

  test('delete trashes a block', async () => {
    // Given
    mockBlockDelete.mockResolvedValue({
      id: 'block-del',
      type: 'paragraph',
      has_children: false,
      paragraph: { rich_text: [] },
      archived: true,
    } as any)

    // When
    await blockCommand.parseAsync(['delete', 'block-del'], { from: 'user' })

    // Then
    expect(mockBlockDelete).toHaveBeenCalledWith({ block_id: 'block-del' })
    const output = JSON.parse(consoleOutput[0])
    expect(output.deleted).toBe(true)
    expect(output.id).toBe('block-del')
  })

  test('handles errors from Notion API', async () => {
    // Given
    mockBlockRetrieve.mockRejectedValue(new Error('Not found'))

    // When
    try {
      await blockCommand.parseAsync(['get', 'bad-id'], { from: 'user' })
    } catch {
      // handleError calls process.exit which our mock throws
    }

    // Then
    const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
    expect(allOutput).toContain('Not found')
  })

  test('append with --markdown converts markdown to blocks', async () => {
    // Given
    const resultBlock = { id: 'new-block-1', type: 'heading_1', has_children: false }
    mockAppendBlockChildren.mockResolvedValue([{ results: [resultBlock] }] as any)

    // When
    await blockCommand.parseAsync(['append', 'parent-456', '--markdown', '# Hello'], {
      from: 'user',
    })

    // Then
    expect(mockAppendBlockChildren).toHaveBeenCalled()
    const output = JSON.parse(consoleOutput[0])
    expect(output.results[0].id).toBe('new-block-1')
  })

  test('append with --after and --markdown', async () => {
    // Given
    mockAppendBlockChildren.mockResolvedValue([{ results: [] }] as any)

    // When
    await blockCommand.parseAsync(['append', 'parent-456', '--after', 'sibling-1', '--markdown', '# Hello'], {
      from: 'user',
    })

    // Then
    expect(mockAppendBlockChildren).toHaveBeenCalledWith('parent-456', expect.any(Array), 'sibling-1', undefined)
  })

  test('append with --before and --markdown', async () => {
    // Given
    mockAppendBlockChildren.mockResolvedValue([{ results: [] }] as any)

    // When
    await blockCommand.parseAsync(['append', 'parent-456', '--before', 'sibling-1', '--markdown', '# Hello'], {
      from: 'user',
    })

    // Then
    expect(mockAppendBlockChildren).toHaveBeenCalledWith('parent-456', expect.any(Array), undefined, 'sibling-1')
  })

  test('append with --markdown preprocesses markdown without images unchanged', async () => {
    // Given
    mockAppendBlockChildren.mockResolvedValue([
      { results: [{ id: 'new-block-1', type: 'heading_1', has_children: false }] },
    ] as any)

    // When
    await blockCommand.parseAsync(['append', 'parent-456', '--markdown', '# Hello'], {
      from: 'user',
    })

    // Then
    expect(mockPreprocessMarkdownImages).toHaveBeenCalledWith('# Hello', expect.any(Function), process.cwd())
    expect(mockUploadFile).not.toHaveBeenCalled()
  })

  test('append with --markdown uses upload wrapper during preprocessing', async () => {
    // Given
    mockPreprocessMarkdownImages.mockImplementation(
      async (markdown: string, uploadFn: (filePath: string) => Promise<string>, _basePath: string) => {
        const uploadedUrl = await uploadFn('/tmp/local-image.png')
        return markdown.replace('/tmp/local-image.png', uploadedUrl)
      },
    )
    mockAppendBlockChildren.mockResolvedValue([
      { results: [{ id: 'new-block-1', type: 'image', has_children: false }] },
    ] as any)

    // When
    await blockCommand.parseAsync(['append', 'parent-456', '--markdown', '![local](/tmp/local-image.png)'], {
      from: 'user',
    })

    // Then
    expect(mockPreprocessMarkdownImages).toHaveBeenCalledWith(
      '![local](/tmp/local-image.png)',
      expect.any(Function),
      process.cwd(),
    )
    expect(mockUploadFileOnly).toHaveBeenCalledWith(expect.anything(), '/tmp/local-image.png')
  })

  test('append with --markdown-file reads and converts markdown file', async () => {
    // Given
    const resultBlock = { id: 'new-block-2', type: 'paragraph', has_children: false }
    mockAppendBlockChildren.mockResolvedValue([{ results: [resultBlock] }] as any)

    // When
    await blockCommand.parseAsync(['append', 'parent-789', '--markdown-file', '/tmp/test.md'], {
      from: 'user',
    })

    // Then
    expect(mockAppendBlockChildren).toHaveBeenCalled()
    const output = JSON.parse(consoleOutput[0])
    expect(output.results[0].id).toBe('new-block-2')
  })

  test('append with both --markdown and --content errors', async () => {
    // When
    try {
      await blockCommand.parseAsync(['append', 'parent-456', '--markdown', '# Hello', '--content', '[]'], {
        from: 'user',
      })
    } catch {
      // handleError calls process.exit which our mock throws
    }

    // Then
    const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
    expect(allOutput).toContain('Provide either --markdown or --markdown-file, not both')
  })

  test('append with both --after and --before errors', async () => {
    // When
    try {
      await blockCommand.parseAsync(
        ['append', 'parent-456', '--after', 'sibling-1', '--before', 'sibling-2', '--content', '[]'],
        {
          from: 'user',
        },
      )
    } catch {
      // handleError calls process.exit which our mock throws
    }

    // Then
    const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
    expect(allOutput).toContain('mutually exclusive')
  })

  test('append with neither --markdown nor --content errors', async () => {
    // When
    try {
      await blockCommand.parseAsync(['append', 'parent-456'], { from: 'user' })
    } catch {
      // handleError calls process.exit which our mock throws
    }

    // Then
    const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
    expect(allOutput).toContain('Provide either --content or --markdown/--markdown-file')
  })

  test('update modifies a block', async () => {
    // Given
    const content = { paragraph: { rich_text: [{ text: { content: 'updated' } }] } }
    mockBlockUpdate.mockResolvedValue({
      id: 'block-upd',
      type: 'paragraph',
      has_children: false,
      paragraph: { rich_text: [{ plain_text: 'updated' }] },
    } as any)

    // When
    await blockCommand.parseAsync(['update', 'block-upd', '--content', JSON.stringify(content)], {
      from: 'user',
    })

    // Then
    expect(mockBlockUpdate).toHaveBeenCalledWith({ block_id: 'block-upd', ...content })
    const output = JSON.parse(consoleOutput[0])
    expect(output.id).toBe('block-upd')
    expect(output.content).toBe('updated')
  })

  test('delete trashes a block', async () => {
    // Given
    mockBlockDelete.mockResolvedValue({
      id: 'block-del',
      type: 'paragraph',
      has_children: false,
      paragraph: { rich_text: [] },
      archived: true,
    } as any)

    // When
    await blockCommand.parseAsync(['delete', 'block-del'], { from: 'user' })

    // Then
    expect(mockBlockDelete).toHaveBeenCalledWith({ block_id: 'block-del' })
    const output = JSON.parse(consoleOutput[0])
    expect(output.deleted).toBe(true)
    expect(output.id).toBe('block-del')
  })

  test('handles errors from Notion API', async () => {
    // Given
    mockBlockRetrieve.mockRejectedValue(new Error('Not found'))

    // When
    try {
      await blockCommand.parseAsync(['get', 'bad-id'], { from: 'user' })
    } catch {
      // handleError calls process.exit which our mock throws
    }

    // Then
    const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
    expect(allOutput).toContain('Not found')
  })

  test('upload calls uploadFile and outputs result', async () => {
    // Given
    mockUploadFile.mockResolvedValue({
      id: 'uploaded-block-1',
      type: 'image',
      url: 'https://www.notion.so/file-uploads/upload-123',
    })

    // When
    await blockCommand.parseAsync(['upload', 'parent-123', '--file', './test.png'], { from: 'user' })

    // Then
    expect(mockUploadFile).toHaveBeenCalledWith(expect.anything(), 'parent-123', './test.png', undefined, undefined)
    const output = JSON.parse(consoleOutput[0])
    expect(output.id).toBe('uploaded-block-1')
    expect(output.type).toBe('image')
    expect(output.url).toContain('file-uploads')
  })

  test('upload with --after passes after to uploadFile', async () => {
    // Given
    mockUploadFile.mockResolvedValue({
      id: 'uploaded-block-1',
      type: 'image',
      url: 'https://www.notion.so/file-uploads/upload-123',
    })

    // When
    await blockCommand.parseAsync(['upload', 'parent-123', '--file', './test.png', '--after', 'sibling-1'], {
      from: 'user',
    })

    // Then
    expect(mockUploadFile).toHaveBeenCalledWith(expect.anything(), 'parent-123', './test.png', 'sibling-1', undefined)
  })

  test('upload with --before passes before to uploadFile', async () => {
    // Given
    mockUploadFile.mockResolvedValue({
      id: 'uploaded-block-1',
      type: 'image',
      url: 'https://www.notion.so/file-uploads/upload-123',
    })

    // When
    await blockCommand.parseAsync(['upload', 'parent-123', '--file', './test.png', '--before', 'sibling-1'], {
      from: 'user',
    })

    // Then
    expect(mockUploadFile).toHaveBeenCalledWith(expect.anything(), 'parent-123', './test.png', undefined, 'sibling-1')
  })

  test('upload handles errors', async () => {
    // Given
    mockUploadFile.mockRejectedValue(new Error('Upload failed'))

    // When
    try {
      await blockCommand.parseAsync(['upload', 'parent-123', '--file', './bad.png'], { from: 'user' })
    } catch {
      // handleError calls process.exit which our mock throws
    }

    // Then
    const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
    expect(allOutput).toContain('Upload failed')
  })
})
