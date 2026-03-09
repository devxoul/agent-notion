import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TokenExtractor } from './token-extractor'

function createCookiesDb(dbPath: string, rows: Array<Record<string, unknown>>): void {
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE cookies (
      name TEXT,
      value TEXT,
      encrypted_value BLOB,
      host_key TEXT,
      last_access_utc INTEGER
    );
  `)

  const insert = db.query(
    'INSERT INTO cookies (name, value, encrypted_value, host_key, last_access_utc) VALUES (?, ?, ?, ?, ?)',
  )

  for (const row of rows) {
    insert.run(
      row.name as string,
      (row.value as string | null) ?? '',
      (row.encrypted_value as Uint8Array | null) ?? new Uint8Array(),
      row.host_key as string,
      row.last_access_utc as number,
    )
  }

  db.close()
}

describe('TokenExtractor', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  test('getNotionDir returns expected path for darwin', () => {
    const extractor = new TokenExtractor('darwin')
    expect(extractor.getNotionDir()).toContain('Library/Application Support/Notion')
  })

  test('getNotionDir returns expected path for linux', () => {
    const extractor = new TokenExtractor('linux')
    expect(extractor.getNotionDir()).toContain('.config/Notion')
  })

  test('getNotionDir returns expected path for win32', () => {
    const original = process.env.APPDATA
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming'

    try {
      const extractor = new TokenExtractor('win32')
      expect(extractor.getNotionDir()).toBe('C:\\Users\\test\\AppData\\Roaming/Notion')
    } finally {
      if (original === undefined) {
        delete process.env.APPDATA
      } else {
        process.env.APPDATA = original
      }
    }
  })

  test('tryDecryptCookie decrypts v10 data with derived key', () => {
    class TestTokenExtractor extends TokenExtractor {
      override getDerivedKey(): Buffer {
        return Buffer.from('1234567890abcdef')
      }
    }

    const extractor = new TestTokenExtractor('darwin', '/tmp/notion-test')
    const key = Buffer.from('1234567890abcdef')
    const iv = Buffer.alloc(16, ' ')
    const plaintext = 'v02%3Atoken-value'
    const cipher = createCipheriv('aes-128-cbc', key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const encrypted = Buffer.concat([Buffer.from('v10'), ciphertext])

    expect(extractor.tryDecryptCookie(encrypted)).toBe(plaintext)
  })

  test('tryDecryptCookie returns plaintext for v03 tokens', () => {
    const plaintext = 'v03%3AeyJhbGciOiJkaXIifQ..iv.ciphertext.tag'
    const encrypted = Buffer.from(plaintext, 'utf8')

    const extractor = new TokenExtractor('darwin', '/tmp/notion-test')
    expect(extractor.tryDecryptCookie(encrypted)).toBe(plaintext)
  })

  test('tryDecryptCookie extracts UUID from v10-encrypted cookie with CBC padding', () => {
    class TestTokenExtractor extends TokenExtractor {
      override getDerivedKey(): Buffer {
        return Buffer.from('1234567890abcdef')
      }
    }

    const extractor = new TestTokenExtractor('darwin', '/tmp/notion-test')
    const key = Buffer.from('1234567890abcdef')
    const iv = Buffer.alloc(16, ' ')
    const uuid = '562f9c80-1b28-46e2-85f8-91227533d192'
    const cipher = createCipheriv('aes-128-cbc', key, iv)
    const ciphertext = Buffer.concat([cipher.update(uuid, 'utf8'), cipher.final()])
    const encrypted = Buffer.concat([Buffer.from('v10'), ciphertext])

    expect(extractor.tryDecryptCookie(encrypted)).toBe(uuid)
  })

  test('extract throws when notion directory is missing', async () => {
    const missingDir = join(tmpdir(), `notion-missing-${Date.now()}`)
    const extractor = new TokenExtractor('darwin', missingDir)

    await expect(extractor.extract()).rejects.toThrow('Notion directory not found')
  })

  test('extract returns token and user_id from cookies sqlite', async () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-test-'))
    tempDirs.push(notionDir)

    const partitionDir = join(notionDir, 'Partitions', 'notion')
    mkdirSync(partitionDir, { recursive: true })
    const dbPath = join(partitionDir, 'Cookies')

    createCookiesDb(dbPath, [
      {
        name: 'token_v2',
        value: 'v02%3Atest-token',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 2,
      },
      {
        name: 'notion_user_id',
        value: 'user-123',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 1,
      },
    ])

    const extractor = new TokenExtractor('darwin', notionDir)
    const extracted = await extractor.extract()

    expect(extracted).toEqual({ token_v2: 'v02%3Atest-token', user_id: 'user-123' })
  })

  test('extract returns null when cookies database has no token', async () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-empty-'))
    tempDirs.push(notionDir)

    const partitionDir = join(notionDir, 'Partitions', 'notion')
    mkdirSync(partitionDir, { recursive: true })
    const dbPath = join(partitionDir, 'Cookies')

    createCookiesDb(dbPath, [
      {
        name: 'other_cookie',
        value: 'value',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 1,
      },
    ])

    const extractor = new TokenExtractor('darwin', notionDir)
    const extracted = await extractor.extract()

    expect(extracted).toBeNull()
  })

  test('extract uses fallback Cookies path when partition db does not exist', async () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-fallback-'))
    tempDirs.push(notionDir)

    const dbPath = join(notionDir, 'Cookies')
    createCookiesDb(dbPath, [
      {
        name: 'token_v2',
        value: 'v02%3Afallback-token',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 1,
      },
    ])

    const extractor = new TokenExtractor('darwin', notionDir)
    const extracted = await extractor.extract()

    expect(extracted).toEqual({ token_v2: 'v02%3Afallback-token' })
  })

  test('getDerivedKey returns linux default key', () => {
    const extractor = new TokenExtractor('linux', '/tmp/notion-test')
    const key = extractor.getDerivedKey()
    const expected = pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1')
    expect(key).toEqual(expected)
  })

  test('extract returns user_ids from notion_users cookie with plain JSON', async () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-multi-'))
    tempDirs.push(notionDir)

    const partitionDir = join(notionDir, 'Partitions', 'notion')
    mkdirSync(partitionDir, { recursive: true })
    const dbPath = join(partitionDir, 'Cookies')

    createCookiesDb(dbPath, [
      {
        name: 'token_v2',
        value: 'v02%3Atest-token',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 3,
      },
      {
        name: 'notion_user_id',
        value: 'user-aaa',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 2,
      },
      {
        name: 'notion_users',
        value: '["user-aaa","user-bbb"]',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 1,
      },
    ])

    const extractor = new TokenExtractor('darwin', notionDir)
    const extracted = await extractor.extract()

    expect(extracted).toEqual({
      token_v2: 'v02%3Atest-token',
      user_id: 'user-aaa',
      user_ids: ['user-aaa', 'user-bbb'],
    })
  })

  test('extract omits user_ids when notion_users cookie is missing', async () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-single-'))
    tempDirs.push(notionDir)

    const partitionDir = join(notionDir, 'Partitions', 'notion')
    mkdirSync(partitionDir, { recursive: true })
    const dbPath = join(partitionDir, 'Cookies')

    createCookiesDb(dbPath, [
      {
        name: 'token_v2',
        value: 'v02%3Atest-token',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 2,
      },
    ])

    const extractor = new TokenExtractor('darwin', notionDir)
    const extracted = await extractor.extract()

    expect(extracted).toEqual({ token_v2: 'v02%3Atest-token' })
    expect(extracted?.user_ids).toBeUndefined()
  })

  test('extract parses user_ids from encrypted notion_users cookie with padding prefix', async () => {
    // given — encrypted v10 cookie where decrypted value has garbage prefix before JSON
    class TestTokenExtractor extends TokenExtractor {
      override getDerivedKey(): Buffer {
        return Buffer.from('1234567890abcdef')
      }
    }

    const notionDir = mkdtempSync(join(tmpdir(), 'notion-enc-multi-'))
    tempDirs.push(notionDir)

    const partitionDir = join(notionDir, 'Partitions', 'notion')
    mkdirSync(partitionDir, { recursive: true })
    const dbPath = join(partitionDir, 'Cookies')

    const key = Buffer.from('1234567890abcdef')
    const iv = Buffer.alloc(16, ' ')

    // Encrypt notion_users value with garbage prefix (simulates real cookie padding)
    const usersPlaintext = 'GARBAGE_PREFIX["user-111","user-222"]'
    const usersCipher = createCipheriv('aes-128-cbc', key, iv)
    const usersCiphertext = Buffer.concat([usersCipher.update(usersPlaintext, 'utf8'), usersCipher.final()])
    const usersEncrypted = Buffer.concat([Buffer.from('v10'), usersCiphertext])

    createCookiesDb(dbPath, [
      {
        name: 'token_v2',
        value: 'v02%3Atest-token',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 3,
      },
      {
        name: 'notion_users',
        value: '',
        encrypted_value: new Uint8Array(usersEncrypted),
        host_key: '.notion.so',
        last_access_utc: 1,
      },
    ])

    const extractor = new TestTokenExtractor('darwin', notionDir)
    const extracted = await extractor.extract()

    expect(extracted?.token_v2).toBe('v02%3Atest-token')
    expect(extracted?.user_ids).toEqual(['user-111', 'user-222'])
  })

  test('extract returns empty user_ids for non-array notion_users cookie', async () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-bad-users-'))
    tempDirs.push(notionDir)

    const partitionDir = join(notionDir, 'Partitions', 'notion')
    mkdirSync(partitionDir, { recursive: true })
    const dbPath = join(partitionDir, 'Cookies')

    createCookiesDb(dbPath, [
      {
        name: 'token_v2',
        value: 'v02%3Atest-token',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 2,
      },
      {
        name: 'notion_users',
        value: 'not-valid-json',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 1,
      },
    ])

    const extractor = new TokenExtractor('darwin', notionDir)
    const extracted = await extractor.extract()

    expect(extracted).toEqual({ token_v2: 'v02%3Atest-token' })
    expect(extracted?.user_ids).toBeUndefined()
  })

  test('decryptDpapi returns null on non-win32 platform', () => {
    const extractor = new TokenExtractor('darwin', '/tmp/notion-test')
    expect(extractor.decryptDpapi(Buffer.from('test'))).toBeNull()
  })

  test('decryptV10CookieWindows decrypts AES-256-GCM with master key from Local State', () => {
    // given — simulate Windows with a known master key and AES-256-GCM encrypted cookie
    const masterKey = randomBytes(32)

    class TestTokenExtractor extends TokenExtractor {
      override getWindowsMasterKey(): Buffer {
        return masterKey
      }
    }

    const extractor = new TestTokenExtractor('win32', '/tmp/notion-test')
    const plaintext = 'v02%3Awindows-token-value'
    const nonce = randomBytes(12)

    const cipher = createCipheriv('aes-256-gcm', masterKey, nonce)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    const encrypted = Buffer.concat([Buffer.from('v10'), nonce, ciphertext, tag])

    expect(extractor.tryDecryptCookie(encrypted)).toBe(plaintext)
  })

  test('decryptV10CookieWindows falls back to direct DPAPI when no Local State', () => {
    // given — simulate Windows without Local State, using direct DPAPI decryption
    class TestTokenExtractor extends TokenExtractor {
      override getWindowsMasterKey(): null {
        return null
      }
      override decryptDpapi(_encrypted: Buffer): Buffer | null {
        return Buffer.from('v02%3Adpapi-direct-token')
      }
    }

    const extractor = new TestTokenExtractor('win32', '/tmp/notion-test')
    const encrypted = Buffer.concat([Buffer.from('v10'), Buffer.from('encrypted-data')])

    expect(extractor.tryDecryptCookie(encrypted)).toBe('v02%3Adpapi-direct-token')
  })

  test('tryDecryptCookie handles Windows pre-v80 cookies without version prefix', () => {
    // given — simulate Windows with raw DPAPI-encrypted cookie (no v10 prefix)
    class TestTokenExtractor extends TokenExtractor {
      override decryptDpapi(_encrypted: Buffer): Buffer | null {
        return Buffer.from('v02%3Apre-v80-token')
      }
    }

    const extractor = new TestTokenExtractor('win32', '/tmp/notion-test')
    const encrypted = Buffer.from([0x01, 0x00, 0x00, 0x00, 0xaa, 0xbb, 0xcc])

    expect(extractor.tryDecryptCookie(encrypted)).toBe('v02%3Apre-v80-token')
  })

  test('getWindowsMasterKey reads and decrypts key from Local State file', () => {
    // given — Local State file with DPAPI-prefixed encrypted key
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-win-'))
    tempDirs.push(notionDir)

    const fakeDecryptedKey = randomBytes(32)
    const dpapiPayload = Buffer.from('fake-dpapi-encrypted-key')
    const encryptedKeyWithPrefix = Buffer.concat([Buffer.from('DPAPI'), dpapiPayload])
    const localState = { os_crypt: { encrypted_key: encryptedKeyWithPrefix.toString('base64') } }
    writeFileSync(join(notionDir, 'Local State'), JSON.stringify(localState))

    class TestTokenExtractor extends TokenExtractor {
      override decryptDpapi(encrypted: Buffer): Buffer | null {
        if (encrypted.equals(dpapiPayload)) {
          return fakeDecryptedKey
        }
        return null
      }
    }

    const extractor = new TestTokenExtractor('win32', notionDir)
    expect(extractor.getWindowsMasterKey()).toEqual(fakeDecryptedKey)
  })

  test('getWindowsMasterKey returns null when Local State is missing', () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-no-ls-'))
    tempDirs.push(notionDir)

    const extractor = new TokenExtractor('win32', notionDir)
    expect(extractor.getWindowsMasterKey()).toBeNull()
  })

  test('getWindowsMasterKey returns null when encrypted_key has no DPAPI prefix', () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-bad-ls-'))
    tempDirs.push(notionDir)

    const localState = { os_crypt: { encrypted_key: Buffer.from('NOTDPAPIdata').toString('base64') } }
    writeFileSync(join(notionDir, 'Local State'), JSON.stringify(localState))

    const extractor = new TokenExtractor('win32', notionDir)
    expect(extractor.getWindowsMasterKey()).toBeNull()
  })

  test('extract decrypts Windows v10 cookies end-to-end with mocked DPAPI', async () => {
    // given — full integration: SQLite DB with v10-encrypted cookie, Local State with master key
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-win-e2e-'))
    tempDirs.push(notionDir)

    const masterKey = randomBytes(32)
    const dpapiPayload = Buffer.from('dpapi-encrypted-master-key')
    const encryptedKeyWithPrefix = Buffer.concat([Buffer.from('DPAPI'), dpapiPayload])
    const localState = { os_crypt: { encrypted_key: encryptedKeyWithPrefix.toString('base64') } }
    writeFileSync(join(notionDir, 'Local State'), JSON.stringify(localState))

    const tokenPlaintext = 'v02%3Awin-extracted-token'
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', masterKey, nonce)
    const ciphertext = Buffer.concat([cipher.update(tokenPlaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    const encryptedToken = Buffer.concat([Buffer.from('v10'), nonce, ciphertext, tag])

    const partitionDir = join(notionDir, 'Partitions', 'notion')
    mkdirSync(partitionDir, { recursive: true })
    createCookiesDb(join(partitionDir, 'Cookies'), [
      {
        name: 'token_v2',
        value: '',
        encrypted_value: new Uint8Array(encryptedToken),
        host_key: '.notion.so',
        last_access_utc: 1,
      },
    ])

    class TestTokenExtractor extends TokenExtractor {
      override decryptDpapi(encrypted: Buffer): Buffer | null {
        if (encrypted.equals(dpapiPayload)) {
          return masterKey
        }
        return null
      }
    }

    const extractor = new TestTokenExtractor('win32', notionDir)
    const extracted = await extractor.extract()

    expect(extracted).toEqual({ token_v2: tokenPlaintext })
  })
})

describe('getErrors', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  test('returns empty array when no errors occurred', () => {
    const extractor = new TokenExtractor('darwin')
    expect(extractor.getErrors()).toEqual([])
  })

  test('collects decryption errors when v10 cookie decryption fails', () => {
    // Given - create an extractor that will fail decryption
    const extractor = new TokenExtractor('linux')

    // When - try to decrypt invalid v10 data (too short for proper decryption)
    const invalidEncrypted = Buffer.from('v10')
    extractor.decryptV10Cookie(invalidEncrypted)

    // Then
    const errors = extractor.getErrors()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('decryptV10Cookie')
  })

  test('collects error when cookie DB copy fails', async () => {
    // Given
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-test-'))
    tempDirs.push(notionDir)
    const cookiePath = join(notionDir, 'Partitions', 'notion')
    mkdirSync(cookiePath, { recursive: true })
    // Create a directory instead of file so copyFileSync fails
    mkdirSync(join(cookiePath, 'Cookies'))

    const extractor = new TokenExtractor('darwin', notionDir)

    // When
    await extractor.extract()

    // Then
    const errors = extractor.getErrors()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('readTokenFromDb')
  })

  test('returns a copy that cannot mutate internal state', () => {
    const extractor = new TokenExtractor('darwin')
    const errors = extractor.getErrors()
    errors.push('fake error')
    expect(extractor.getErrors()).toEqual([])
  })
})
