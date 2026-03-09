import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { validateNotionEnvironment } from './config'
import { runNotionCLI, parseJSON, generateTestId, waitForRateLimit } from './helpers'

let containerId = ''
let containerTitle = ''
let runStartedAt = 0
let testPageIds: string[] = []
let testBlockIds: string[] = []
let testDatabaseIds: string[] = []
let workspaceId = ''

describe('Notion E2E Tests', () => {
  beforeAll(async () => {
    workspaceId = await validateNotionEnvironment()
    await waitForRateLimit()

    runStartedAt = Date.now()
    containerTitle = `e2e-notion-run-${runStartedAt}`

    const result = await runNotionCLI(['page', 'create', '--workspace-id', workspaceId, '--title', containerTitle])
    expect(result.exitCode).toBe(0)

    const data = parseJSON<{ id: string; title: string; type: string }>(result.stdout)
    expect(data?.id).toBeTruthy()
    expect(data?.type).toBe('page')

    containerId = data!.id
    testPageIds.push(containerId)
    await waitForRateLimit()
  }, 30000)

  afterAll(async () => {
    for (const blockId of testBlockIds) {
      try {
        await runNotionCLI(['block', 'delete', '--workspace-id', workspaceId, blockId])
        await waitForRateLimit(500)
      } catch {}
    }

    for (const pageId of testPageIds) {
      if (pageId === containerId) continue
      try {
        await runNotionCLI(['page', 'archive', '--workspace-id', workspaceId, pageId])
        await waitForRateLimit(500)
      } catch {}
    }

    for (const databaseBlockId of testDatabaseIds) {
      try {
        await runNotionCLI(['page', 'archive', '--workspace-id', workspaceId, databaseBlockId])
        await waitForRateLimit(500)
      } catch {}
    }

    if (containerId) {
      try {
        await runNotionCLI(['page', 'archive', '--workspace-id', workspaceId, containerId])
        await waitForRateLimit(500)
      } catch {}
    }
  }, 120000)

  // ── auth ──────────────────────────────────────────────────────────────

  describe('auth', () => {
    test('auth status returns stored token_v2 credentials', async () => {
      const result = await runNotionCLI(['auth', 'status'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ stored_token_v2: { token_v2: string; user_id?: string } | null }>(result.stdout)
      expect(data).not.toBeNull()
      expect(data?.stored_token_v2).not.toBeNull()
      expect(data?.stored_token_v2?.token_v2).toBeTruthy()

      await waitForRateLimit()
    }, 15000)
  })

  // ── page ──────────────────────────────────────────────────────────────

  describe('page', () => {
    let createdPageId = ''

    test('page create creates a page under container', async () => {
      const testId = generateTestId()
      const result = await runNotionCLI([
        'page',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-page-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; title: string; type: string }>(result.stdout)
      expect(data?.id).toBeTruthy()
      expect(data?.type).toBe('page')

      createdPageId = data!.id
      testPageIds.push(createdPageId)
      await waitForRateLimit()
    }, 15000)

    test('page get retrieves the created page', async () => {
      expect(createdPageId).toBeTruthy()

      const result = await runNotionCLI(['page', 'get', '--workspace-id', workspaceId, createdPageId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; title: string; blocks: unknown[] }>(result.stdout)
      expect(data?.id).toBe(createdPageId)
      expect(data?.title).toBeTruthy()

      await waitForRateLimit()
    }, 15000)

    test('page list returns pages and total count', async () => {
      const result = await runNotionCLI(['page', 'list', '--workspace-id', workspaceId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{
        pages: Array<{ id: string; title?: string; type: string }>
        total: number
      }>(result.stdout)
      expect(Array.isArray(data?.pages)).toBe(true)
      expect(typeof data?.total).toBe('number')

      await waitForRateLimit()
    }, 15000)

    test('page update updates the page title', async () => {
      expect(createdPageId).toBeTruthy()

      const testId = generateTestId()
      const result = await runNotionCLI([
        'page',
        'update',
        '--workspace-id',
        workspaceId,
        createdPageId,
        '--title',
        `e2e-updated-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; title: string; type: string }>(result.stdout)
      expect(data?.id).toBe(createdPageId)

      await waitForRateLimit()
    }, 15000)

    test('page archive archives a newly created page', async () => {
      const testId = generateTestId()
      const createResult = await runNotionCLI([
        'page',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-archive-${testId}`,
      ])
      expect(createResult.exitCode).toBe(0)

      const created = parseJSON<{ id: string; title: string; type: string }>(createResult.stdout)
      expect(created?.id).toBeTruthy()

      const pageToArchive = created!.id
      testPageIds.push(pageToArchive)
      await waitForRateLimit()

      const result = await runNotionCLI(['page', 'archive', '--workspace-id', workspaceId, pageToArchive])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ archived: boolean; id: string }>(result.stdout)
      expect(data?.archived).toBe(true)
      expect(data?.id).toBe(pageToArchive)

      await waitForRateLimit()
    }, 15000)

    test('page create with --markdown creates page with content blocks', async () => {
      const testId = generateTestId()
      const result = await runNotionCLI([
        'page',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-markdown-${testId}`,
        '--markdown',
        '# Heading\n\nParagraph text',
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; type: string }>(result.stdout)
      expect(data?.id).toBeTruthy()
      expect(data?.type).toBe('page')

      const markdownPageId = data!.id
      testPageIds.push(markdownPageId)
      await waitForRateLimit()

      // Verify blocks were created from markdown
      const childrenResult = await runNotionCLI(['block', 'children', '--workspace-id', workspaceId, markdownPageId])
      expect(childrenResult.exitCode).toBe(0)

      const children = parseJSON<{ results: unknown[]; has_more: boolean }>(childrenResult.stdout)
      expect(Array.isArray(children?.results)).toBe(true)
      expect(children?.results?.length ?? 0).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 30000)
  })

  // ── root page ────────────────────────────────────────────────────────

  describe('root page', () => {
    let rootPageId = ''

    test('page create without --parent creates a root page', async () => {
      const testId = generateTestId()
      const result = await runNotionCLI([
        'page',
        'create',
        '--workspace-id',
        workspaceId,
        '--title',
        `e2e-root-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; type: string }>(result.stdout)
      expect(data?.id).toBeTruthy()
      expect(data?.type).toBe('page')

      rootPageId = data!.id
      testPageIds.push(rootPageId)
      await waitForRateLimit()
    }, 15000)

    test('page get retrieves the root page', async () => {
      expect(rootPageId).toBeTruthy()

      const result = await runNotionCLI(['page', 'get', '--workspace-id', workspaceId, rootPageId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string }>(result.stdout)
      expect(data?.id).toBe(rootPageId)

      await waitForRateLimit()
    }, 15000)

    test('page create with --markdown creates root page with content blocks', async () => {
      const testId = generateTestId()
      const result = await runNotionCLI([
        'page',
        'create',
        '--workspace-id',
        workspaceId,
        '--title',
        `e2e-root-markdown-${testId}`,
        '--markdown',
        '# Root Heading\n\nRoot paragraph text',
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; type: string }>(result.stdout)
      expect(data?.id).toBeTruthy()
      expect(data?.type).toBe('page')

      const markdownRootPageId = data!.id
      testPageIds.push(markdownRootPageId)
      await waitForRateLimit()

      // Verify blocks were created from markdown
      const childrenResult = await runNotionCLI([
        'block',
        'children',
        '--workspace-id',
        workspaceId,
        markdownRootPageId,
      ])
      expect(childrenResult.exitCode).toBe(0)

      const children = parseJSON<{ results: unknown[]; has_more: boolean }>(childrenResult.stdout)
      expect(Array.isArray(children?.results)).toBe(true)
      expect(children?.results?.length ?? 0).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 30000)

    test('page archive archives the root page', async () => {
      expect(rootPageId).toBeTruthy()
      await waitForRateLimit(2000)

      const result = await runNotionCLI(['page', 'archive', '--workspace-id', workspaceId, rootPageId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ archived: boolean; id: string }>(result.stdout)
      expect(data?.archived).toBe(true)
      expect(data?.id).toBe(rootPageId)

      await waitForRateLimit()
    }, 15000)
  })

  // ── database ──────────────────────────────────────────────────────────

  describe('database', () => {
    let createdDbId = ''
    let addedViewId = ''

    beforeAll(async () => {
      await waitForRateLimit(2000)
      const testId = generateTestId()
      const result = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-db-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name: string; schema: Record<string, { type: string }> }>(result.stdout)
      expect(data?.id).toBeTruthy()

      createdDbId = data!.id

      await waitForRateLimit()
    }, 15000)

    test('database list returns database summaries', async () => {
      const result = await runNotionCLI(['database', 'list', '--workspace-id', workspaceId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<Array<{ id: string; name?: string; schema_properties?: unknown[] }>>(result.stdout)
      expect(Array.isArray(data)).toBe(true)

      await waitForRateLimit()
    }, 15000)

    test('database get retrieves the created database', async () => {
      expect(createdDbId).toBeTruthy()

      const result = await runNotionCLI(['database', 'get', '--workspace-id', workspaceId, createdDbId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name: string; schema: Record<string, { type: string }> }>(result.stdout)
      expect(data?.id).toBe(createdDbId)

      await waitForRateLimit()
    }, 15000)

    test('database query returns result and recordMap', async () => {
      expect(createdDbId).toBeTruthy()

      const result = await runNotionCLI(['database', 'query', '--workspace-id', workspaceId, createdDbId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ results: unknown[]; has_more: boolean }>(result.stdout)
      expect(Array.isArray(data?.results)).toBe(true)

      await waitForRateLimit()
    }, 15000)

    test('database add-row with select property registers option in schema', async () => {
      const testId = generateTestId()
      const databaseTitle = `e2e-select-db-${testId}`
      const rowTitle = `e2e-select-row-${testId}`
      const selectValue = `Select-${testId}`

      const createResult = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        databaseTitle,
        '--properties',
        '{"status":{"name":"Status","type":"select"}}',
      ])
      expect(createResult.exitCode).toBe(0)

      const created = parseJSON<{ id: string }>(createResult.stdout)
      expect(created?.id).toBeTruthy()
      const selectDbId = created!.id
      testDatabaseIds.push(selectDbId)
      await waitForRateLimit()

      const addRowResult = await runNotionCLI([
        'database',
        'add-row',
        '--workspace-id',
        workspaceId,
        selectDbId,
        '--title',
        rowTitle,
        '--properties',
        `{"Status":"${selectValue}"}`,
      ])
      expect(addRowResult.exitCode).toBe(0)
      await waitForRateLimit()

      const queryResult = await runNotionCLI(['database', 'query', '--workspace-id', workspaceId, selectDbId])
      expect(queryResult.exitCode).toBe(0)

      const data = parseJSON<{
        results: Array<{
          properties: Record<string, { type: string; value: unknown }>
        }>
      }>(queryResult.stdout)
      expect(Array.isArray(data?.results)).toBe(true)

      const matchedRow = data?.results.find((row) => {
        const nameValue = row.properties.Name?.value
        const statusValue = row.properties.Status?.value
        return nameValue === rowTitle && statusValue === selectValue
      })
      expect(matchedRow).toBeDefined()

      await waitForRateLimit()
    }, 15000)

    test('database update updates the created database title', async () => {
      expect(createdDbId).toBeTruthy()

      const testId = generateTestId()
      const result = await runNotionCLI([
        'database',
        'update',
        '--workspace-id',
        workspaceId,
        createdDbId,
        '--title',
        `e2e-db-updated-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name: string; schema: Record<string, { type: string }> }>(result.stdout)
      expect(data?.id).toBe(createdDbId)

      await waitForRateLimit()
    }, 15000)

    test('database update resolves property names to existing schema keys', async () => {
      expect(createdDbId).toBeTruthy()

      // Step 1: Add a text property using a schema key
      const addResult = await runNotionCLI([
        'database',
        'update',
        '--workspace-id',
        workspaceId,
        createdDbId,
        '--properties',
        '{"e2e_name_key":{"name":"NameKeyProp","type":"text"}}',
      ])
      expect(addResult.exitCode).toBe(0)

      const added = parseJSON<{ id: string; schema: Record<string, { type: string }> }>(addResult.stdout)
      expect(added?.schema?.['NameKeyProp']?.type).toBe('text')

      await waitForRateLimit()

      // Step 2: Update the same property using its DISPLAY NAME as key (not the schema key)
      const updateResult = await runNotionCLI([
        'database',
        'update',
        '--workspace-id',
        workspaceId,
        createdDbId,
        '--properties',
        '{"NameKeyProp":{"name":"NameKeyProp","type":"number"}}',
      ])
      expect(updateResult.exitCode).toBe(0)

      const updated = parseJSON<{ id: string; schema: Record<string, { type: string }> }>(updateResult.stdout)
      // Property should be updated in place, not duplicated
      expect(updated?.schema?.['NameKeyProp']?.type).toBe('number')

      // Verify there's exactly one property with this name (no duplicate)
      const propCount = Object.values(updated?.schema ?? {}).filter((p) => p.type === 'number').length
      expect(propCount).toBe(1)

      await waitForRateLimit()
    }, 30000)

    test('database delete-property removes a text property from schema', async () => {
      expect(createdDbId).toBeTruthy()

      const addResult = await runNotionCLI([
        'database',
        'update',
        '--workspace-id',
        workspaceId,
        createdDbId,
        '--properties',
        '{"e2e_prop":{"name":"E2E Prop","type":"text"}}',
      ])
      expect(addResult.exitCode).toBe(0)

      const added = parseJSON<{ id: string; schema: Record<string, { type: string }> }>(addResult.stdout)
      expect(added?.schema?.['E2E Prop']?.type).toBe('text')

      await waitForRateLimit()

      const result = await runNotionCLI([
        'database',
        'delete-property',
        '--workspace-id',
        workspaceId,
        createdDbId,
        '--property',
        'E2E Prop',
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; schema: Record<string, { type: string }>; $hints?: string[] }>(result.stdout)
      expect(data?.id).toBe(createdDbId)
      expect(data?.schema?.['E2E Prop']).toBeUndefined()

      const softDeleteHints = (data?.$hints ?? []).filter((h) => h.includes('soft-deleted'))
      expect(softDeleteHints).toEqual([])

      await waitForRateLimit()
    }, 30000)

    test('database delete-property truly removes property so same name can be recreated', async () => {
      // given — create a DB with a text property
      const testId = generateTestId()
      const createResult = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-reuse-name-${testId}`,
        '--properties',
        `{"rp":{"name":"Reuse Prop ${testId}","type":"text"}}`,
      ])
      expect(createResult.exitCode).toBe(0)

      const created = parseJSON<{ id: string; schema: Record<string, { type: string }> }>(createResult.stdout)
      expect(created?.id).toBeTruthy()
      const dbId = created!.id
      testDatabaseIds.push(dbId)
      const propName = `Reuse Prop ${testId}`
      expect(created?.schema?.[propName]?.type).toBe('text')

      await waitForRateLimit()

      // when — delete the property
      const deleteResult = await runNotionCLI([
        'database',
        'delete-property',
        '--workspace-id',
        workspaceId,
        dbId,
        '--property',
        propName,
      ])
      expect(deleteResult.exitCode).toBe(0)

      await waitForRateLimit()

      // when — recreate with the exact same name
      const readdResult = await runNotionCLI([
        'database',
        'update',
        '--workspace-id',
        workspaceId,
        dbId,
        '--properties',
        JSON.stringify({ rp2: { name: propName, type: 'text' } }),
      ])
      expect(readdResult.exitCode).toBe(0)

      await waitForRateLimit()

      // then — the property name should be exactly the same, not suffixed
      const getResult = await runNotionCLI(['database', 'get', '--workspace-id', workspaceId, dbId])
      expect(getResult.exitCode).toBe(0)

      const final = parseJSON<{ id: string; schema: Record<string, { type: string }>; $hints?: string[] }>(
        getResult.stdout,
      )
      expect(final?.schema?.[propName]?.type).toBe('text')

      const suffixedKeys = Object.keys(final?.schema ?? {}).filter((k) => k.startsWith(propName) && k !== propName)
      expect(suffixedKeys).toEqual([])

      const softDeleteHints = (final?.$hints ?? []).filter((h) => h.includes('soft-deleted'))
      expect(softDeleteHints).toEqual([])

      await waitForRateLimit()
    }, 60000)

    test('database delete-property removes a rollup property from schema', async () => {
      // given — create source DB with a text property
      const testId = generateTestId()
      const srcResult = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-rollup-src-${testId}`,
        '--properties',
        '{"prd_id":{"name":"PRD ID","type":"text"}}',
      ])
      expect(srcResult.exitCode).toBe(0)

      const srcDb = parseJSON<{ id: string }>(srcResult.stdout)
      expect(srcDb?.id).toBeTruthy()
      const srcDbId = srcDb!.id
      testDatabaseIds.push(srcDbId)

      await waitForRateLimit()

      // given — create target DB with relation + rollup
      const tgtResult = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-rollup-tgt-${testId}`,
        '--properties',
        JSON.stringify({
          rel: { name: 'Source Rel', type: 'relation', collection_id: srcDbId },
          rollup_prd: {
            name: 'PRD Rollup',
            type: 'rollup',
            target_property: 'prd_id',
            relation_property: 'rel',
            target_property_type: 'text',
          },
        }),
      ])
      expect(tgtResult.exitCode).toBe(0)

      const tgtDb = parseJSON<{ id: string; schema: Record<string, { type: string }> }>(tgtResult.stdout)
      expect(tgtDb?.id).toBeTruthy()
      expect(tgtDb?.schema?.['PRD Rollup']?.type).toBe('rollup')
      const tgtDbId = tgtDb!.id
      testDatabaseIds.push(tgtDbId)

      await waitForRateLimit()

      // when — delete the rollup property
      const result = await runNotionCLI([
        'database',
        'delete-property',
        '--workspace-id',
        workspaceId,
        tgtDbId,
        '--property',
        'PRD Rollup',
      ])

      // then
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; schema: Record<string, { type: string }>; $hints?: string[] }>(result.stdout)
      expect(data?.id).toBe(tgtDbId)
      expect(data?.schema?.['PRD Rollup']).toBeUndefined()
      expect(data?.schema?.['Source Rel']?.type).toBe('relation')
      expect(data?.schema?.['Name']?.type).toBe('title')

      const softDeleteHints = (data?.$hints ?? []).filter((h) => h.includes('soft-deleted'))
      expect(softDeleteHints).toEqual([])

      await waitForRateLimit()
    }, 60000)

    test('database create resolves rollup property names to internal keys', async () => {
      // given — source DB with a text property
      const testId = generateTestId()
      const srcResult = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-rollup-name-src-${testId}`,
        '--properties',
        '{"src_id":{"name":"Source ID","type":"text"}}',
      ])
      expect(srcResult.exitCode).toBe(0)

      const srcDb = parseJSON<{ id: string }>(srcResult.stdout)
      expect(srcDb?.id).toBeTruthy()
      const srcDbId = srcDb!.id
      testDatabaseIds.push(srcDbId)

      await waitForRateLimit()

      // when — create target DB with rollup using property NAMES (not internal keys)
      const tgtResult = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-rollup-name-tgt-${testId}`,
        '--properties',
        JSON.stringify({
          rel: { name: 'Source Rel', type: 'relation', collection_id: srcDbId },
          my_rollup: {
            name: 'My Rollup',
            type: 'rollup',
            relation_property: 'Source Rel',
            target_property: 'Source ID',
          },
        }),
      ])
      expect(tgtResult.exitCode).toBe(0)

      const tgtDb = parseJSON<{ id: string; schema: Record<string, { type: string }> }>(tgtResult.stdout)
      expect(tgtDb?.id).toBeTruthy()
      expect(tgtDb?.schema?.['My Rollup']?.type).toBe('rollup')
      expect(tgtDb?.schema?.['Source Rel']?.type).toBe('relation')
      const tgtDbId = tgtDb!.id
      testDatabaseIds.push(tgtDbId)

      await waitForRateLimit()

      // then — database get should have no broken-rollup hints
      const getResult = await runNotionCLI(['database', 'get', '--workspace-id', workspaceId, tgtDbId])
      expect(getResult.exitCode).toBe(0)

      const getDb = parseJSON<{ id: string; schema: Record<string, { type: string }>; $hints?: string[] }>(
        getResult.stdout,
      )
      expect(getDb?.schema?.['My Rollup']?.type).toBe('rollup')

      const rollupHints = (getDb?.$hints ?? []).filter((h) => h.includes('My Rollup'))
      expect(rollupHints).toEqual([])

      await waitForRateLimit()
    }, 60000)

    test('database update resolves rollup property names to internal keys', async () => {
      await waitForRateLimit(2000)
      // given — source DB with a text property
      const testId = generateTestId()
      const srcResult = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-rollup-upd-src-${testId}`,
        '--properties',
        '{"src_id":{"name":"Source ID","type":"text"}}',
      ])
      expect(srcResult.exitCode).toBe(0)

      const srcDb = parseJSON<{ id: string }>(srcResult.stdout)
      expect(srcDb?.id).toBeTruthy()
      const srcDbId = srcDb!.id
      testDatabaseIds.push(srcDbId)

      await waitForRateLimit()

      // given — target DB with only a relation
      const tgtResult = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-rollup-upd-tgt-${testId}`,
        '--properties',
        JSON.stringify({
          rel: { name: 'Source Rel', type: 'relation', collection_id: srcDbId },
        }),
      ])
      expect(tgtResult.exitCode).toBe(0)

      const tgtDb = parseJSON<{ id: string }>(tgtResult.stdout)
      expect(tgtDb?.id).toBeTruthy()
      const tgtDbId = tgtDb!.id
      testDatabaseIds.push(tgtDbId)

      await waitForRateLimit()

      // when — update to add rollup using property NAMES
      const updateResult = await runNotionCLI([
        'database',
        'update',
        '--workspace-id',
        workspaceId,
        tgtDbId,
        '--properties',
        JSON.stringify({
          my_rollup: {
            name: 'My Rollup',
            type: 'rollup',
            relation_property: 'Source Rel',
            target_property: 'Source ID',
          },
        }),
      ])
      expect(updateResult.exitCode).toBe(0)

      const updatedDb = parseJSON<{ id: string; schema: Record<string, { type: string }> }>(updateResult.stdout)
      expect(updatedDb?.schema?.['My Rollup']?.type).toBe('rollup')

      await waitForRateLimit()

      // then — database get should have no broken-rollup hints
      const getResult = await runNotionCLI(['database', 'get', '--workspace-id', workspaceId, tgtDbId])
      expect(getResult.exitCode).toBe(0)

      const getDb = parseJSON<{ id: string; schema: Record<string, { type: string }>; $hints?: string[] }>(
        getResult.stdout,
      )
      expect(getDb?.schema?.['My Rollup']?.type).toBe('rollup')

      const rollupHints = (getDb?.$hints ?? []).filter((h) => h.includes('My Rollup'))
      expect(rollupHints).toEqual([])

      await waitForRateLimit()
    }, 60000)

    test('database update-row updates properties on existing rows', async () => {
      await waitForRateLimit(2000)
      const testId = generateTestId()

      // Step 1: Create DB with select property only (no relation yet)
      const createResult = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-update-row-${testId}`,
        '--properties',
        '{"status_prop":{"name":"Status","type":"select"}}',
      ])
      expect(createResult.exitCode).toBe(0)

      const created = parseJSON<{ id: string }>(createResult.stdout)
      expect(created?.id).toBeTruthy()
      const dbId = created!.id
      testDatabaseIds.push(dbId)
      await waitForRateLimit(500)

      // Step 2: Add self-referencing relation via database update
      const addRelResult = await runNotionCLI([
        'database',
        'update',
        '--workspace-id',
        workspaceId,
        dbId,
        '--properties',
        JSON.stringify({
          rel: { name: 'Depends On', type: 'relation', collection_id: dbId },
        }),
      ])
      expect(addRelResult.exitCode).toBe(0)
      await waitForRateLimit(500)

      // Step 3: Add Row A
      const addRowAResult = await runNotionCLI([
        'database',
        'add-row',
        '--workspace-id',
        workspaceId,
        dbId,
        '--title',
        'Row A',
      ])
      expect(addRowAResult.exitCode).toBe(0)

      const rowA = parseJSON<{ id: string }>(addRowAResult.stdout)
      expect(rowA?.id).toBeTruthy()
      const rowAId = rowA!.id
      await waitForRateLimit(500)

      // Step 4: Add Row B
      const addRowBResult = await runNotionCLI([
        'database',
        'add-row',
        '--workspace-id',
        workspaceId,
        dbId,
        '--title',
        'Row B',
      ])
      expect(addRowBResult.exitCode).toBe(0)

      const rowB = parseJSON<{ id: string }>(addRowBResult.stdout)
      expect(rowB?.id).toBeTruthy()
      const rowBId = rowB!.id
      await waitForRateLimit(500)

      // Step 5: Update Row B — set relation to point to Row A
      const updateRelResult = await runNotionCLI([
        'database',
        'update-row',
        '--workspace-id',
        workspaceId,
        rowBId,
        '--properties',
        JSON.stringify({ 'Depends On': [rowAId] }),
      ])
      expect(updateRelResult.exitCode).toBe(0)
      await waitForRateLimit(500)

      // Step 6: Update Row A — set select to "Active"
      const updateSelectResult = await runNotionCLI([
        'database',
        'update-row',
        '--workspace-id',
        workspaceId,
        rowAId,
        '--properties',
        JSON.stringify({ Status: 'Active' }),
      ])
      expect(updateSelectResult.exitCode).toBe(0)
      await waitForRateLimit(500)

      // Step 7: Query the DB and verify both updates
      const queryResult = await runNotionCLI(['database', 'query', '--workspace-id', workspaceId, dbId])
      expect(queryResult.exitCode).toBe(0)

      const data = parseJSON<{
        results: Array<{
          id: string
          properties: Record<string, { type: string; value: unknown }>
        }>
      }>(queryResult.stdout)
      expect(Array.isArray(data?.results)).toBe(true)

      // Verify Row B's relation points to Row A
      const resultRowB = data?.results.find((r) => r.properties.Name?.value === 'Row B')
      expect(resultRowB).toBeDefined()
      const relationProp = resultRowB!.properties['Depends On']
      expect(relationProp?.type).toBe('relation')
      const relValue = relationProp?.value as Array<string | { id: string }>
      expect(Array.isArray(relValue)).toBe(true)
      const hasRowAId = relValue.some((v) => {
        const id = typeof v === 'string' ? v : v.id
        return id.replace(/-/g, '') === rowAId.replace(/-/g, '')
      })
      expect(hasRowAId).toBe(true)

      // Verify Row A's select is "Active"
      const resultRowA = data?.results.find((r) => r.properties.Name?.value === 'Row A')
      expect(resultRowA).toBeDefined()
      expect(resultRowA!.properties.Status?.value).toBe('Active')

      await waitForRateLimit()
    }, 60000)

    test('database view-update --reorder reorders columns in a view', async () => {
      await waitForRateLimit(2000)
      const testId = generateTestId()

      // Step 1: Create a sub-page for isolation
      const subPageResult = await runNotionCLI([
        'page',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-view-reorder-${testId}`,
      ])
      expect(subPageResult.exitCode).toBe(0)

      const subPage = parseJSON<{ id: string }>(subPageResult.stdout)
      expect(subPage?.id).toBeTruthy()
      const subPageId = subPage!.id
      testPageIds.push(subPageId)
      await waitForRateLimit()

      // Step 2: Create a database with 3 properties under the sub-page
      const createResult = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        subPageId,
        '--title',
        `e2e-reorder-db-${testId}`,
        '--properties',
        JSON.stringify({
          status_prop: { name: 'Status', type: 'select' },
          priority_prop: { name: 'Priority', type: 'select' },
        }),
      ])
      expect(createResult.exitCode).toBe(0)

      const created = parseJSON<{ id: string }>(createResult.stdout)
      expect(created?.id).toBeTruthy()
      const dbCollectionId = created!.id
      await waitForRateLimit()

      // Step 3: Find the view ID via block children → block get
      const childrenResult = await runNotionCLI(['block', 'children', '--workspace-id', workspaceId, subPageId])
      expect(childrenResult.exitCode).toBe(0)

      const children = parseJSON<{
        results: Array<{ id: string; type: string }>
      }>(childrenResult.stdout)
      expect(children?.results?.length).toBeGreaterThan(0)

      const dbBlock = children!.results.find((b) => b.type === 'collection_view_page' || b.type === 'collection_view')
      expect(dbBlock).toBeDefined()
      await waitForRateLimit()

      const blockGetResult = await runNotionCLI(['block', 'get', '--workspace-id', workspaceId, dbBlock!.id])
      expect(blockGetResult.exitCode).toBe(0)

      const blockData = parseJSON<{
        id: string
        collection_id?: string
        view_ids?: string[]
      }>(blockGetResult.stdout)
      expect(blockData?.collection_id).toBe(dbCollectionId)
      expect(blockData?.view_ids?.length).toBeGreaterThan(0)

      const viewId = blockData!.view_ids![0]
      await waitForRateLimit()

      // Step 4: view-get to confirm initial state has properties
      const viewGetResult = await runNotionCLI(['database', 'view-get', '--workspace-id', workspaceId, viewId])
      expect(viewGetResult.exitCode).toBe(0)

      const viewData = parseJSON<{
        id: string
        type: string
        properties: Array<{ name: string; type: string; visible: boolean }>
      }>(viewGetResult.stdout)
      expect(viewData?.id).toBe(viewId)
      expect(viewData?.properties?.length).toBeGreaterThanOrEqual(3)
      await waitForRateLimit()

      // Step 5: view-update --reorder to put Priority first, then Status, then Name
      const reorderResult = await runNotionCLI([
        'database',
        'view-update',
        '--workspace-id',
        workspaceId,
        viewId,
        '--reorder',
        'Priority,Status,Name',
      ])
      expect(reorderResult.exitCode).toBe(0)
      await waitForRateLimit()

      // Step 6: view-get again to verify new column order
      const verifyResult = await runNotionCLI(['database', 'view-get', '--workspace-id', workspaceId, viewId])
      expect(verifyResult.exitCode).toBe(0)

      const verifyData = parseJSON<{
        id: string
        properties: Array<{ name: string; type: string; visible: boolean }>
      }>(verifyResult.stdout)
      expect(verifyData?.properties?.length).toBeGreaterThanOrEqual(3)

      const propNames = verifyData!.properties.map((p) => p.name)
      expect(propNames[0]).toBe('Priority')
      expect(propNames[1]).toBe('Status')
      expect(propNames[2]).toBe('Name')

      await waitForRateLimit()
    }, 60000)

    test('database view-list lists views for a database', async () => {
      // Track the database used in tests
      testDatabaseIds.push(createdDbId)
      const result = await runNotionCLI(['database', 'view-list', '--workspace-id', workspaceId, createdDbId])
      expect(result.exitCode).toBe(0)
      const views = parseJSON<Array<{ id: string; type: string; name: string }>>(result.stdout) ?? []
      expect(Array.isArray(views)).toBe(true)
      expect(views.length).toBeGreaterThanOrEqual(1)
      expect(views.some((v) => v.type === 'table')).toBe(true)
      await waitForRateLimit()
    }, 60000)
    test('database view-add adds a new board view', async () => {
      const result = await runNotionCLI([
        'database',
        'view-add',
        '--workspace-id',
        workspaceId,
        createdDbId,
        '--type',
        'board',
        '--name',
        'Board View',
      ])
      expect(result.exitCode).toBe(0)
      const data = parseJSON<{ id: string; type: string; name: string }>(result.stdout)
      expect(data?.type).toBe('board')
      expect(data?.name).toBe('Board View')
      addedViewId = data!.id
      await waitForRateLimit()
    }, 60000)
    test('database view-list shows newly added view', async () => {
      const result = await runNotionCLI(['database', 'view-list', '--workspace-id', workspaceId, createdDbId])
      expect(result.exitCode).toBe(0)
      const views = parseJSON<Array<{ id: string; type: string; name: string }>>(result.stdout) ?? []
      expect(Array.isArray(views)).toBe(true)
      expect(views.length).toBeGreaterThanOrEqual(2)
      const hasBoard = views.some((v) => v.type === 'board')
      expect(hasBoard).toBe(true)
      await waitForRateLimit()
    }, 60000)
    test('database view-delete removes a view', async () => {
      const result = await runNotionCLI(['database', 'view-delete', '--workspace-id', workspaceId, addedViewId])
      expect(result.exitCode).toBe(0)
      const data = parseJSON<{ id: string; deleted: boolean }>(result.stdout)
      expect(data?.deleted).toBe(true)
      expect(data?.id).toBe(addedViewId)
      await waitForRateLimit()
    }, 60000)
    test('database view-delete refuses to delete last view', async () => {
      // List to determine last remaining view
      const listResult = await runNotionCLI(['database', 'view-list', '--workspace-id', workspaceId, createdDbId])
      expect(listResult.exitCode).toBe(0)
      const views = parseJSON<Array<{ id: string; type: string; name: string }>>(listResult.stdout) ?? []
      expect(views.length).toBe(1)
      const lastViewId = views[0].id
      const delResult = await runNotionCLI(['database', 'view-delete', '--workspace-id', workspaceId, lastViewId])
      expect(delResult.exitCode).toBe(1)
      const err = parseJSON<{ error: string }>(delResult.stderr)
      expect(err?.error).toContain('Cannot delete the last view')
      await waitForRateLimit()
    }, 60000)
  })

  // ── block ─────────────────────────────────────────────────────────────

  describe('block', () => {
    let appendedBlockId = ''

    beforeAll(async () => {
      await waitForRateLimit(2000)
    })

    test('block append creates a text block under container', async () => {
      const testId = generateTestId()
      const result = await runNotionCLI([
        'block',
        'append',
        '--workspace-id',
        workspaceId,
        containerId,
        '--content',
        `[{"type":"text","properties":{"title":[["e2e-block-${testId}"]]}}]`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ created: string[] }>(result.stdout)
      expect(Array.isArray(data?.created)).toBe(true)
      expect(data?.created?.length ?? 0).toBeGreaterThan(0)

      appendedBlockId = data!.created[0]
      testBlockIds.push(appendedBlockId)
      await waitForRateLimit()
    }, 15000)

    test('block get retrieves the appended text block', async () => {
      expect(appendedBlockId).toBeTruthy()

      const result = await runNotionCLI(['block', 'get', '--workspace-id', workspaceId, appendedBlockId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; type: string; version: number }>(result.stdout)
      expect(data?.id).toBe(appendedBlockId)
      expect(data?.type).toBe('text')

      await waitForRateLimit()
    }, 15000)

    test('block children lists children under container', async () => {
      const result = await runNotionCLI(['block', 'children', '--workspace-id', workspaceId, containerId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ results: unknown[]; has_more: boolean }>(result.stdout)
      expect(Array.isArray(data?.results)).toBe(true)
      expect(data?.results?.length ?? 0).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 15000)

    test('block update updates block content fields', async () => {
      expect(appendedBlockId).toBeTruthy()

      const result = await runNotionCLI([
        'block',
        'update',
        '--workspace-id',
        workspaceId,
        appendedBlockId,
        '--content',
        '{"properties":{"title":[["e2e-block-updated"]]}}',
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; type: string; properties?: Record<string, unknown> }>(result.stdout)
      expect(data?.id).toBe(appendedBlockId)

      await waitForRateLimit()
    }, 15000)

    test('block delete deletes a newly appended block', async () => {
      const testId = generateTestId()
      const appendResult = await runNotionCLI([
        'block',
        'append',
        '--workspace-id',
        workspaceId,
        containerId,
        '--content',
        `[{"type":"text","properties":{"title":[["e2e-delete-${testId}"]]}}]`,
      ])
      expect(appendResult.exitCode).toBe(0)

      const appended = parseJSON<{ created: string[] }>(appendResult.stdout)
      expect(Array.isArray(appended?.created)).toBe(true)
      expect(appended?.created?.length ?? 0).toBeGreaterThan(0)

      const blockToDelete = appended!.created[0]
      await waitForRateLimit()

      const result = await runNotionCLI(['block', 'delete', '--workspace-id', workspaceId, blockToDelete])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ deleted: boolean; id: string }>(result.stdout)
      expect(data?.deleted).toBe(true)
      expect(data?.id).toBe(blockToDelete)

      await waitForRateLimit()
    }, 15000)

    test('block append with nested markdown creates parent and child blocks', async () => {
      // given
      const markdown = '- Parent item\n  - Child item'

      // when - append nested markdown
      const result = await runNotionCLI([
        'block',
        'append',
        '--workspace-id',
        workspaceId,
        containerId,
        '--markdown',
        markdown,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ created: string[] }>(result.stdout)
      expect(data?.created?.length).toBe(1) // only top-level IDs returned

      const parentBlockId = data!.created[0]
      testBlockIds.push(parentBlockId)
      await waitForRateLimit()

      // then - verify parent block exists
      const parentResult = await runNotionCLI(['block', 'get', '--workspace-id', workspaceId, parentBlockId])
      expect(parentResult.exitCode).toBe(0)

      const parentBlock = parseJSON<{ id: string; type: string; content?: string[] }>(parentResult.stdout)
      expect(parentBlock?.type).toBe('bulleted_list')
      expect(parentBlock?.content?.length).toBeGreaterThan(0) // has child content

      await waitForRateLimit()

      // then - verify child block exists under parent
      const childrenResult = await runNotionCLI(['block', 'children', '--workspace-id', workspaceId, parentBlockId])
      expect(childrenResult.exitCode).toBe(0)

      const children = parseJSON<{ results: Array<{ id: string; type: string }> }>(childrenResult.stdout)
      expect(children?.results?.length).toBeGreaterThan(0)
      expect(children?.results[0]?.type).toBe('bulleted_list')

      // cleanup: push child ids
      for (const child of children?.results ?? []) {
        testBlockIds.push(child.id)
      }

      await waitForRateLimit()
    }, 30000)
  })

  // ── search ────────────────────────────────────────────────────────────

  describe('search', () => {
    test('search returns matching results', async () => {
      await waitForRateLimit(5000)

      const result = await runNotionCLI(['search', '--workspace-id', workspaceId, 'e2e-notion-run'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ results: unknown[]; total: number }>(result.stdout)
      expect(Array.isArray(data?.results)).toBe(true)

      await waitForRateLimit()
    }, 15000)
  })

  // ── comment ──────────────────────────────────────────────────────────

  describe('comment', () => {
    let commentPageId = ''
    let createdCommentId = ''

    beforeAll(async () => {
      await waitForRateLimit(2000)
      const testId = generateTestId()
      const result = await runNotionCLI([
        'page',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-comment-page-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string }>(result.stdout)
      expect(data?.id).toBeTruthy()
      commentPageId = data!.id
      testPageIds.push(commentPageId)
      await waitForRateLimit()
    }, 30000)

    test('comment create adds a comment to a page', async () => {
      expect(commentPageId).toBeTruthy()

      const testId = generateTestId()
      const result = await runNotionCLI([
        'comment',
        'create',
        `e2e-comment-${testId}`,
        '--page',
        commentPageId,
        '--workspace-id',
        workspaceId,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; discussion_id: string; text: string }>(result.stdout)
      expect(data?.id).toBeTruthy()
      expect(data?.discussion_id).toBeTruthy()
      expect(data?.text).toContain('e2e-comment')

      createdCommentId = data!.id
      await waitForRateLimit()
    }, 15000)

    test('comment list returns comments on the page', async () => {
      expect(commentPageId).toBeTruthy()

      const result = await runNotionCLI(['comment', 'list', '--page', commentPageId, '--workspace-id', workspaceId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ results: Array<{ id: string; text: string }>; total: number }>(result.stdout)
      expect(Array.isArray(data?.results)).toBe(true)
      expect(data?.results?.length ?? 0).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 15000)

    test('comment get retrieves a specific comment', async () => {
      expect(createdCommentId).toBeTruthy()

      const result = await runNotionCLI(['comment', 'get', createdCommentId, '--workspace-id', workspaceId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; text: string; discussion_id: string }>(result.stdout)
      expect(data?.id).toBe(createdCommentId)
      expect(data?.text).toBeTruthy()

      await waitForRateLimit()
    }, 15000)
  })

  // ── user ──────────────────────────────────────────────────────────────

  describe('user', () => {
    let currentUserId = ''

    type UserInfo = { id: string; name?: string; email?: string; spaces: unknown[] }

    beforeAll(async () => {
      await waitForRateLimit(2000)
      const result = await runNotionCLI(['user', 'me'])
      expect(result.exitCode).toBe(0)

      // user me returns a single object when one account, array when multiple
      const raw = parseJSON<UserInfo | UserInfo[]>(result.stdout)
      const data = Array.isArray(raw) ? raw[0] : raw
      expect(data?.id).toBeTruthy()
      currentUserId = data!.id

      await waitForRateLimit()
    }, 15000)

    test('user me returns current user with spaces', async () => {
      const result = await runNotionCLI(['user', 'me'])
      expect(result.exitCode).toBe(0)

      const raw = parseJSON<UserInfo | UserInfo[]>(result.stdout)
      const data = Array.isArray(raw) ? raw[0] : raw
      expect(data?.id).toBeTruthy()
      expect(Array.isArray(data?.spaces)).toBe(true)

      await waitForRateLimit()
    }, 15000)

    test('user get returns the fetched current user', async () => {
      expect(currentUserId).toBeTruthy()

      const result = await runNotionCLI(['user', 'get', '--workspace-id', workspaceId, currentUserId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name?: string }>(result.stdout)
      expect(data?.id).toBe(currentUserId)

      await waitForRateLimit()
    }, 15000)
  })

  // ── batch ────────────────────────────────────────────────────────────

  describe('batch', () => {
    const batchPageIds: string[] = []

    afterAll(async () => {
      for (const pageId of batchPageIds) {
        try {
          await runNotionCLI(['page', 'archive', '--workspace-id', workspaceId, pageId])
          await waitForRateLimit()
        } catch {}
      }
    }, 30000)

    test('batch with single page.create', async () => {
      await waitForRateLimit(2000)
      const testId = generateTestId()
      const operations = [
        {
          action: 'page.create',
          parent_id: containerId,
          title: `e2e-batch-single-${testId}`,
        },
      ]

      const result = await runNotionCLI(['batch', '--workspace-id', workspaceId, JSON.stringify(operations)])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{
        results: Array<{ index: number; action: string; success: boolean; data?: { id: string } }>
        total: number
        succeeded: number
        failed: number
      }>(result.stdout)
      expect(data?.total).toBe(1)
      expect(data?.succeeded).toBe(1)
      expect(data?.failed).toBe(0)
      expect(data?.results).toHaveLength(1)
      expect(data?.results[0].index).toBe(0)
      expect(data?.results[0].action).toBe('page.create')
      expect(data?.results[0].success).toBe(true)
      expect(data?.results[0].data?.id).toBeTruthy()

      batchPageIds.push(data!.results[0].data!.id)
      await waitForRateLimit()
    }, 30000)

    test('batch with multiple operations', async () => {
      await waitForRateLimit(2000)
      const testId = generateTestId()
      const operations = [
        {
          action: 'page.create',
          parent_id: containerId,
          title: `e2e-batch-multi-${testId}`,
        },
      ]

      // first create the page
      const createResult = await runNotionCLI(['batch', '--workspace-id', workspaceId, JSON.stringify(operations)])
      expect(createResult.exitCode).toBe(0)

      const createData = parseJSON<{
        results: Array<{ index: number; action: string; success: boolean; data?: { id: string } }>
      }>(createResult.stdout)
      const createdPageId = createData!.results[0].data!.id
      batchPageIds.push(createdPageId)
      await waitForRateLimit()

      // then batch: create another page + archive the first
      const multiOps = [
        {
          action: 'page.create',
          parent_id: containerId,
          title: `e2e-batch-multi2-${testId}`,
        },
        {
          action: 'page.archive',
          page_id: createdPageId,
        },
      ]

      const result = await runNotionCLI(['batch', '--workspace-id', workspaceId, JSON.stringify(multiOps)])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{
        results: Array<{ index: number; action: string; success: boolean; data?: { id: string } }>
        total: number
        succeeded: number
        failed: number
      }>(result.stdout)
      expect(data?.total).toBe(2)
      expect(data?.succeeded).toBe(2)
      expect(data?.failed).toBe(0)
      expect(data?.results).toHaveLength(2)
      expect(data?.results[0].action).toBe('page.create')
      expect(data?.results[0].success).toBe(true)
      expect(data?.results[1].action).toBe('page.archive')
      expect(data?.results[1].success).toBe(true)

      if (data?.results[0].data?.id) {
        batchPageIds.push(data.results[0].data.id)
      }

      await waitForRateLimit()
    }, 30000)

    test('fail-fast on invalid operation', async () => {
      await waitForRateLimit(2000)
      const operations = [
        {
          action: 'page.archive',
          page_id: '00000000-0000-0000-0000-000000000000',
        },
      ]

      const result = await runNotionCLI(['batch', '--workspace-id', workspaceId, JSON.stringify(operations)])
      expect(result.exitCode).toBe(1)

      const data = parseJSON<{
        results: Array<{ index: number; action: string; success: boolean; error?: string }>
        total: number
        succeeded: number
        failed: number
      }>(result.stdout)
      expect(data?.results).toHaveLength(1)
      expect(data?.failed).toBe(1)
      expect(data?.succeeded).toBe(0)
      expect(data?.results[0].success).toBe(false)
      expect(data?.results[0].error).toBeTruthy()

      await waitForRateLimit()
    }, 30000)

    test('validation error on invalid action name', async () => {
      const operations = [
        {
          action: 'invalid.action',
          some_arg: 'value',
        },
      ]

      const result = await runNotionCLI(['batch', '--workspace-id', workspaceId, JSON.stringify(operations)])
      expect(result.exitCode).toBe(1)

      const data = parseJSON<{ error: string }>(result.stderr || result.stdout)
      expect(data?.error).toBeTruthy()

      await waitForRateLimit()
    }, 15000)

    test('--file input reads operations from file', async () => {
      await waitForRateLimit(2000)
      const testId = generateTestId()
      const operations = [
        {
          action: 'page.create',
          parent_id: containerId,
          title: `e2e-batch-file-${testId}`,
        },
      ]

      const tmpFile = join(tmpdir(), `e2e-batch-${testId}.json`)
      writeFileSync(tmpFile, JSON.stringify(operations))

      try {
        const result = await runNotionCLI([
          'batch',
          '--workspace-id',
          workspaceId,
          '--file',
          tmpFile,
          '_', // placeholder for required <operations> argument
        ])
        expect(result.exitCode).toBe(0)

        const data = parseJSON<{
          results: Array<{ index: number; action: string; success: boolean; data?: { id: string } }>
          total: number
          succeeded: number
          failed: number
        }>(result.stdout)
        expect(data?.total).toBe(1)
        expect(data?.succeeded).toBe(1)
        expect(data?.failed).toBe(0)
        expect(data?.results[0].success).toBe(true)

        if (data?.results[0].data?.id) {
          batchPageIds.push(data.results[0].data.id)
        }
      } finally {
        try {
          unlinkSync(tmpFile)
        } catch {}
      }

      await waitForRateLimit()
    }, 30000)
  })

  describe('upload', () => {
    const MINIMAL_PNG = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49,
      0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ])

    let tmpPngPath = ''
    let tmpTxtPath = ''
    let tmpMdPngPath = ''
    let tmpMdFilePath = ''

    beforeAll(async () => {
      await waitForRateLimit(2000)

      const testId = generateTestId()
      tmpPngPath = join(tmpdir(), `e2e-upload-${testId}.png`)
      tmpTxtPath = join(tmpdir(), `e2e-upload-${testId}.txt`)
      tmpMdPngPath = join(tmpdir(), `e2e-test-img-${testId}.png`)
      tmpMdFilePath = join(tmpdir(), `e2e-upload-${testId}.md`)

      writeFileSync(tmpPngPath, MINIMAL_PNG)
      writeFileSync(tmpTxtPath, 'e2e upload test content')
      writeFileSync(tmpMdPngPath, MINIMAL_PNG)
      writeFileSync(tmpMdFilePath, `![test](./e2e-test-img-${testId}.png)`)
    })

    afterAll(() => {
      try {
        unlinkSync(tmpPngPath)
      } catch {}
      try {
        unlinkSync(tmpTxtPath)
      } catch {}
      try {
        unlinkSync(tmpMdPngPath)
      } catch {}
      try {
        unlinkSync(tmpMdFilePath)
      } catch {}
    })

    test('block upload with image file returns image type', async () => {
      await waitForRateLimit(2000)

      const result = await runNotionCLI([
        'block',
        'upload',
        '--workspace-id',
        workspaceId,
        containerId,
        '--file',
        tmpPngPath,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; type: string; url: string }>(result.stdout)
      expect(data?.id).toBeTruthy()
      expect(data?.type).toBe('image')
      expect(data?.url).toBeTruthy()

      testBlockIds.push(data!.id)
      await waitForRateLimit()
    }, 30000)

    test('block upload with non-image file returns file type', async () => {
      await waitForRateLimit(2000)

      const result = await runNotionCLI([
        'block',
        'upload',
        '--workspace-id',
        workspaceId,
        containerId,
        '--file',
        tmpTxtPath,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; type: string; url: string }>(result.stdout)
      expect(data?.id).toBeTruthy()
      expect(data?.type).toBe('file')
      expect(data?.url).toBeTruthy()

      testBlockIds.push(data!.id)
      await waitForRateLimit()
    }, 30000)

    test('block append --markdown with local image reference creates blocks', async () => {
      await waitForRateLimit(2000)

      const markdown = `![e2e-test](${tmpPngPath})`
      const result = await runNotionCLI([
        'block',
        'append',
        '--workspace-id',
        workspaceId,
        containerId,
        '--markdown',
        markdown,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ created: string[] }>(result.stdout)
      expect(Array.isArray(data?.created)).toBe(true)
      expect(data?.created?.length ?? 0).toBeGreaterThan(0)

      for (const id of data!.created) {
        testBlockIds.push(id)
      }
      await waitForRateLimit()
    }, 60000)

    test('block append --markdown-file with local image reference creates blocks', async () => {
      await waitForRateLimit(2000)

      const result = await runNotionCLI([
        'block',
        'append',
        '--workspace-id',
        workspaceId,
        containerId,
        '--markdown-file',
        tmpMdFilePath,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ created: string[] }>(result.stdout)
      expect(Array.isArray(data?.created)).toBe(true)
      expect(data?.created?.length ?? 0).toBeGreaterThan(0)

      for (const id of data!.created) {
        testBlockIds.push(id)
      }
      await waitForRateLimit()
    }, 60000)
  })
})
