import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { NotionClient } from './client'

const { uploadFile, uploadFileOnly } = await import('./upload')

describe('uploadFileOnly', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-notionbot-upload-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
    mock.restore()
  })

  test('uploads file and returns url without appending block', async () => {
    const filePath = path.join(tempDir, 'photo.png')
    const fileBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    fs.writeFileSync(filePath, fileBuffer)

    const mockCreate = mock(() => Promise.resolve({ id: 'file_upload_123' }))
    const mockSend = mock(() => Promise.resolve({}))
    const mockAppend = mock(() => Promise.resolve({}))

    const client = {
      fileUploads: {
        create: mockCreate,
        send: mockSend,
      },
      blocks: {
        children: {
          append: mockAppend,
        },
      },
    } as unknown as NotionClient

    // when
    const result = await uploadFileOnly(client, filePath)

    // then
    expect(mockCreate).toHaveBeenCalledWith({
      mode: 'single_part',
      filename: 'photo.png',
      content_type: 'image/png',
    })
    expect(mockSend).toHaveBeenCalledWith({
      file_upload_id: 'file_upload_123',
      file: {
        data: fileBuffer,
        filename: 'photo.png',
      },
      part_number: 1,
    })
    expect(mockAppend).not.toHaveBeenCalled()
    expect(result).toEqual({
      fileUploadId: 'file_upload_123',
      url: 'https://www.notion.so/file-uploads/file_upload_123',
      contentType: 'image/png',
    })
  })
})

describe('uploadFile', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-notionbot-upload-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
    mock.restore()
  })

  test('uploads image and appends image block', async () => {
    const filePath = path.join(tempDir, 'photo.png')
    const fileBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    fs.writeFileSync(filePath, fileBuffer)

    const mockCreate = mock(() => Promise.resolve({ id: 'file_upload_123' }))
    const mockSend = mock(() => Promise.resolve({}))
    const mockAppend = mock(() =>
      Promise.resolve({
        results: [
          {
            results: [{ id: 'block-image-1' }],
          },
        ],
      }),
    )

    const client = {
      fileUploads: {
        create: mockCreate,
        send: mockSend,
      },
      blocks: {
        children: {
          append: mockAppend,
        },
      },
    } as unknown as NotionClient

    const result = await uploadFile(client, 'parent-123', filePath)

    expect(mockCreate).toHaveBeenCalledWith({
      mode: 'single_part',
      filename: 'photo.png',
      content_type: 'image/png',
    })
    expect(mockSend).toHaveBeenCalledWith({
      file_upload_id: 'file_upload_123',
      file: {
        data: fileBuffer,
        filename: 'photo.png',
      },
      part_number: 1,
    })
    expect(mockAppend).toHaveBeenCalledWith({
      block_id: 'parent-123',
      children: [
        {
          type: 'image',
          image: {
            type: 'file_upload',
            file_upload: {
              id: 'file_upload_123',
            },
          },
        },
      ],
    })
    expect(result).toEqual({
      id: 'block-image-1',
      type: 'image',
      url: 'https://www.notion.so/file-uploads/file_upload_123',
    })
  })

  test('uploads non-image and appends file block', async () => {
    const filePath = path.join(tempDir, 'report.pdf')
    const fileBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46])
    fs.writeFileSync(filePath, fileBuffer)

    const mockCreate = mock(() => Promise.resolve({ id: 'file_upload_456' }))
    const mockSend = mock(() => Promise.resolve({}))
    const mockAppend = mock(() =>
      Promise.resolve({
        results: [
          {
            results: [{ id: 'block-file-1' }],
          },
        ],
      }),
    )

    const client = {
      fileUploads: {
        create: mockCreate,
        send: mockSend,
      },
      blocks: {
        children: {
          append: mockAppend,
        },
      },
    } as unknown as NotionClient

    const result = await uploadFile(client, 'parent-456', filePath)

    expect(mockCreate).toHaveBeenCalledWith({
      mode: 'single_part',
      filename: 'report.pdf',
      content_type: 'application/pdf',
    })
    expect(mockSend).toHaveBeenCalledWith({
      file_upload_id: 'file_upload_456',
      file: {
        data: fileBuffer,
        filename: 'report.pdf',
      },
      part_number: 1,
    })
    expect(mockAppend).toHaveBeenCalledWith({
      block_id: 'parent-456',
      children: [
        {
          type: 'file',
          file: {
            type: 'file_upload',
            file_upload: {
              id: 'file_upload_456',
            },
          },
        },
      ],
    })
    expect(result).toEqual({
      id: 'block-file-1',
      type: 'file',
      url: 'https://www.notion.so/file-uploads/file_upload_456',
    })
  })
})
