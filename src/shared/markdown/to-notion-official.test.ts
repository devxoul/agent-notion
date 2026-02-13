import { expect, test } from 'bun:test'
import { markdownToOfficialBlocks } from './to-notion-official'

test('heading 1', () => {
  const blocks = markdownToOfficialBlocks('# Hello')
  expect(blocks.length).toBeGreaterThan(0)
  expect(blocks[0].type).toBe('heading_1')
})

test('heading 2', () => {
  const blocks = markdownToOfficialBlocks('## World')
  expect(blocks.length).toBeGreaterThan(0)
  expect(blocks[0].type).toBe('heading_2')
})

test('plain paragraph', () => {
  const blocks = markdownToOfficialBlocks('This is a paragraph')
  expect(blocks.length).toBeGreaterThan(0)
  expect(blocks[0].type).toBe('paragraph')
})

test('bold text', () => {
  const blocks = markdownToOfficialBlocks('**bold**')
  expect(blocks.length).toBeGreaterThan(0)
  expect(blocks[0].type).toBe('paragraph')
  const paragraph = blocks[0] as any
  expect(paragraph.paragraph?.rich_text).toBeDefined()
  const hasBold = paragraph.paragraph.rich_text.some((rt: any) => rt.annotations?.bold === true)
  expect(hasBold).toBe(true)
})

test('empty string', () => {
  const blocks = markdownToOfficialBlocks('')
  expect(blocks).toEqual([])
})

test('whitespace only', () => {
  const blocks = markdownToOfficialBlocks('   \n\t  ')
  expect(blocks).toEqual([])
})

test('complex multi-element markdown', () => {
  const markdown = `# Title
## Subtitle
This is a paragraph with **bold** and *italic*.

- List item 1
- List item 2`

  const blocks = markdownToOfficialBlocks(markdown)
  expect(blocks.length).toBeGreaterThan(0)
  expect(blocks[0].type).toBe('heading_1')
  expect(blocks[1].type).toBe('heading_2')
})
