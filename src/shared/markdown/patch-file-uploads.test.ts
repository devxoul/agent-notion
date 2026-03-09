import { describe, expect, test } from 'bun:test'

import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints'

import { patchFileUploadBlocks } from './patch-file-uploads'

describe('patchFileUploadBlocks', () => {
  test('replaces external image block with file_upload reference', () => {
    // given
    const blocks: BlockObjectRequest[] = [
      {
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://www.notion.so/file-uploads/upload-123' },
        },
      } as any,
    ]
    const uploadMap = new Map([['https://www.notion.so/file-uploads/upload-123', 'upload-123']])

    // when
    const result = patchFileUploadBlocks(blocks, uploadMap)

    // then
    expect(result).toHaveLength(1)
    expect((result[0] as any).type).toBe('image')
    expect((result[0] as any).image.type).toBe('file_upload')
    expect((result[0] as any).image.file_upload.id).toBe('upload-123')
  })

  test('leaves non-matching external images untouched', () => {
    // given
    const blocks: BlockObjectRequest[] = [
      {
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://example.com/photo.png' },
        },
      } as any,
    ]
    const uploadMap = new Map([['https://www.notion.so/file-uploads/upload-123', 'upload-123']])

    // when
    const result = patchFileUploadBlocks(blocks, uploadMap)

    // then
    expect((result[0] as any).image.type).toBe('external')
    expect((result[0] as any).image.external.url).toBe('https://example.com/photo.png')
  })

  test('returns blocks unchanged when uploadMap is empty', () => {
    // given
    const blocks: BlockObjectRequest[] = [
      {
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: 'hello' } }] },
      } as any,
    ]

    // when
    const result = patchFileUploadBlocks(blocks, new Map())

    // then
    expect(result).toBe(blocks)
  })

  test('handles mix of image and non-image blocks', () => {
    // given
    const blocks: BlockObjectRequest[] = [
      {
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: 'text' } }] },
      } as any,
      {
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://www.notion.so/file-uploads/upload-abc' },
        },
      } as any,
      {
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: 'title' } }] },
      } as any,
    ]
    const uploadMap = new Map([['https://www.notion.so/file-uploads/upload-abc', 'upload-abc']])

    // when
    const result = patchFileUploadBlocks(blocks, uploadMap)

    // then
    expect(result).toHaveLength(3)
    expect((result[0] as any).type).toBe('paragraph')
    expect((result[1] as any).image.type).toBe('file_upload')
    expect((result[1] as any).image.file_upload.id).toBe('upload-abc')
    expect((result[2] as any).type).toBe('heading_1')
  })

  test('patches multiple uploaded images', () => {
    // given
    const blocks: BlockObjectRequest[] = [
      {
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://www.notion.so/file-uploads/upload-1' },
        },
      } as any,
      {
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://www.notion.so/file-uploads/upload-2' },
        },
      } as any,
    ]
    const uploadMap = new Map([
      ['https://www.notion.so/file-uploads/upload-1', 'upload-1'],
      ['https://www.notion.so/file-uploads/upload-2', 'upload-2'],
    ])

    // when
    const result = patchFileUploadBlocks(blocks, uploadMap)

    // then
    expect((result[0] as any).image.file_upload.id).toBe('upload-1')
    expect((result[1] as any).image.file_upload.id).toBe('upload-2')
  })
})
