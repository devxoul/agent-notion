import { describe, expect, test } from 'bun:test'
import { formatOutput } from './output'

describe('formatOutput', () => {
  test('returns compact JSON by default', () => {
    expect(formatOutput({ a: 1 })).toBe('{"a":1}')
  })

  test('returns compact JSON when pretty is false', () => {
    expect(formatOutput({ a: 1 }, false)).toBe('{"a":1}')
  })

  test('returns pretty-printed JSON when pretty is true', () => {
    expect(formatOutput({ a: 1 }, true)).toBe('{\n  "a": 1\n}')
  })

  test('handles arrays', () => {
    expect(formatOutput([1, 2])).toBe('[1,2]')
    expect(formatOutput([1, 2], true)).toBe('[\n  1,\n  2\n]')
  })

  test('handles null', () => {
    expect(formatOutput(null)).toBe('null')
  })

  test('handles strings', () => {
    expect(formatOutput('hello')).toBe('"hello"')
  })

  test('handles nested objects', () => {
    const data = { a: { b: { c: 1 } } }
    const pretty = formatOutput(data, true)
    expect(pretty).toContain('"a"')
    expect(pretty).toContain('"b"')
    expect(pretty).toContain('"c": 1')
  })
})
