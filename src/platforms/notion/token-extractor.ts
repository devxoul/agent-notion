import { execSync } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

const TOKEN_REGEX = /v\d+(%3A|:)[A-Za-z0-9_.%-]+/
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

// CBC decryption may produce padding garbage before the actual value.
// Try known patterns first (token, UUID), fall back to raw string.
function extractValueFromDecrypted(decrypted: string): string {
  const tokenMatch = decrypted.match(TOKEN_REGEX)
  if (tokenMatch) return tokenMatch[0]

  const uuidMatch = decrypted.match(UUID_REGEX)
  if (uuidMatch) return uuidMatch[0]

  return decrypted
}

type CookieRow = {
  name: string
  value?: string
  encrypted_value?: Uint8Array | Buffer
} | null

type BetterSqlite3Database = {
  prepare(sql: string): {
    get(...params: unknown[]): unknown
  }
  close(): void
}

type BetterSqlite3Constructor = {
  new (path: string, options?: Record<string, unknown>): BetterSqlite3Database
}

export interface ExtractedToken {
  token_v2: string
  user_id?: string
  user_ids?: string[]
}

export class TokenExtractor {
  private platform: NodeJS.Platform
  private notionDir: string
  private cachedMasterKey: Buffer | null | undefined = undefined
  private extractionErrors: string[] = []

  constructor(platform?: NodeJS.Platform, notionDir?: string) {
    this.platform = platform ?? process.platform
    this.notionDir = notionDir ?? this.getNotionDir()
  }

  getErrors(): string[] {
    return [...this.extractionErrors]
  }

  getNotionDir(): string {
    switch (this.platform) {
      case 'darwin':
        return join(homedir(), 'Library', 'Application Support', 'Notion')
      case 'linux':
        return join(homedir(), '.config', 'Notion')
      case 'win32': {
        const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
        return join(appData, 'Notion')
      }
      default:
        throw new Error(`Unsupported platform: ${this.platform}`)
    }
  }

  async extract(): Promise<ExtractedToken | null> {
    if (!existsSync(this.notionDir)) {
      throw new Error(`Notion directory not found: ${this.notionDir}`)
    }

    return this.extractCookieFromSQLite()
  }

  tryDecryptCookie(encrypted: Buffer): string | null {
    const plaintext = encrypted.toString('utf8')
    if (/^v\d+(%3A|:)/.test(plaintext)) {
      return plaintext
    }

    if (encrypted.length > 3 && encrypted.subarray(0, 3).toString() === 'v10') {
      if (this.platform === 'win32') {
        return this.decryptV10CookieWindows(encrypted)
      }
      return this.decryptV10Cookie(encrypted)
    }

    // Windows pre-v80: DPAPI applied directly (no version prefix)
    if (this.platform === 'win32' && encrypted.length > 0) {
      const decrypted = this.decryptDpapi(encrypted)
      if (decrypted) {
        return decrypted.toString('utf8')
      }
    }

    return null
  }

  decryptV10Cookie(encrypted: Buffer): string | null {
    try {
      const key = this.getDerivedKey()
      if (!key) {
        this.extractionErrors.push('decryptV10Cookie: failed to derive decryption key')
        return null
      }

      const ciphertext = encrypted.subarray(3)
      const iv = Buffer.alloc(16, ' ')
      const decipher = createDecipheriv('aes-128-cbc', key, iv)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    } catch (error) {
      this.extractionErrors.push(`decryptV10Cookie: ${(error as Error).message}`)
      return null
    }
  }

  decryptV10CookieWindows(encrypted: Buffer): string | null {
    try {
      const masterKey = this.getWindowsMasterKey()
      if (!masterKey) {
        const decrypted = this.decryptDpapi(encrypted.subarray(3))
        if (!decrypted) return null
        return decrypted.toString('utf8')
      }

      const nonce = encrypted.subarray(3, 3 + 12)
      const ciphertextWithTag = encrypted.subarray(3 + 12)
      const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16)
      const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16)

      const decipher = createDecipheriv('aes-256-gcm', masterKey, nonce)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    } catch (error) {
      this.extractionErrors.push(`decryptV10CookieWindows: ${(error as Error).message}`)
      return null
    }
  }

  getWindowsMasterKey(): Buffer | null {
    if (this.cachedMasterKey !== undefined) {
      return this.cachedMasterKey
    }

    try {
      const localStatePath = join(this.notionDir, 'Local State')
      if (!existsSync(localStatePath)) {
        this.cachedMasterKey = null
        return null
      }

      const localState = JSON.parse(readFileSync(localStatePath, 'utf8')) as {
        os_crypt?: { encrypted_key?: string }
      }
      const encryptedKeyB64 = localState?.os_crypt?.encrypted_key
      if (!encryptedKeyB64) {
        this.cachedMasterKey = null
        return null
      }

      const encryptedKey = Buffer.from(encryptedKeyB64, 'base64')
      if (encryptedKey.subarray(0, 5).toString() !== 'DPAPI') {
        this.cachedMasterKey = null
        return null
      }

      this.cachedMasterKey = this.decryptDpapi(encryptedKey.subarray(5))
      return this.cachedMasterKey
    } catch (error) {
      this.extractionErrors.push(`getWindowsMasterKey: ${(error as Error).message}`)
      this.cachedMasterKey = null
      return null
    }
  }

  decryptDpapi(encrypted: Buffer): Buffer | null {
    if (this.platform !== 'win32') {
      return null
    }

    try {
      const b64Input = encrypted.toString('base64')
      const script = [
        'Add-Type -AssemblyName System.Security',
        `$d=[System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String("${b64Input}"),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
        '[Convert]::ToBase64String($d)',
      ].join(';')

      const encodedCommand = Buffer.from(script, 'utf16le').toString('base64')
      const result = execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encodedCommand}`, {
        encoding: 'utf8',
        timeout: 10000,
      }).trim()

      return Buffer.from(result, 'base64')
    } catch (error) {
      this.extractionErrors.push(`decryptDpapi: ${(error as Error).message}`)
      return null
    }
  }

  getDerivedKey(): Buffer | null {
    if (this.platform === 'linux') {
      return pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1')
    }

    if (this.platform === 'win32') {
      return null
    }

    if (this.platform !== 'darwin') {
      return null
    }

    try {
      let password: string
      try {
        password = execSync('security find-generic-password -s "Notion Safe Storage" -w 2>/dev/null', {
          encoding: 'utf8',
        }).trim()
      } catch {
        password = execSync('security find-generic-password -ga "Notion" -s "Notion Safe Storage" -w 2>/dev/null', {
          encoding: 'utf8',
        }).trim()
      }

      return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
    } catch (error) {
      this.extractionErrors.push(`getDerivedKey: ${(error as Error).message}`)
      return null
    }
  }

  private async extractCookieFromSQLite(): Promise<ExtractedToken | null> {
    const cookiePaths = [
      join(this.notionDir, 'Partitions', 'notion', 'Cookies'),
      join(this.notionDir, 'Cookies'),
      join(this.notionDir, 'Network', 'Cookies'),
    ]

    for (const dbPath of cookiePaths) {
      if (!existsSync(dbPath)) {
        continue
      }

      const extracted = this.readTokenFromDb(dbPath)
      if (extracted) {
        return extracted
      }
    }

    return null
  }

  private readTokenFromDb(dbPath: string): ExtractedToken | null {
    const tempDbPath = join(tmpdir(), `notion-cookies-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)

    try {
      copyFileSync(dbPath, tempDbPath)
    } catch (error) {
      this.extractionErrors.push(`readTokenFromDb: failed to copy cookie DB ${dbPath}: ${(error as Error).message}`)
      return null
    }

    try {
      const tokenSql = `SELECT name, value, encrypted_value FROM cookies WHERE name = 'token_v2' AND host_key LIKE '%notion%' ORDER BY last_access_utc DESC LIMIT 1`
      const userSql = `SELECT name, value, encrypted_value FROM cookies WHERE name = 'notion_user_id' AND host_key LIKE '%notion%' ORDER BY last_access_utc DESC LIMIT 1`
      const usersSql = `SELECT name, value, encrypted_value FROM cookies WHERE name = 'notion_users' AND host_key LIKE '%notion%' ORDER BY last_access_utc DESC LIMIT 1`

      let tokenRow: CookieRow
      let userRow: CookieRow
      let usersRow: CookieRow

      if (typeof globalThis.Bun !== 'undefined') {
        const { Database } = require('bun:sqlite')
        const db = new Database(tempDbPath, { readonly: true })
        tokenRow = db.query(tokenSql).get() as CookieRow
        userRow = db.query(userSql).get() as CookieRow
        usersRow = db.query(usersSql).get() as CookieRow
        db.close()
      } else {
        let Database: BetterSqlite3Constructor
        try {
          Database = require('better-sqlite3')
        } catch {
          throw new Error('better-sqlite3 is required for Node.js. Install it with: npm install better-sqlite3')
        }
        const db = new Database(tempDbPath, { readonly: true })
        tokenRow = db.prepare(tokenSql).get() as CookieRow
        userRow = db.prepare(userSql).get() as CookieRow
        usersRow = db.prepare(usersSql).get() as CookieRow
        db.close()
      }

      const rawToken = this.resolveCookieValue(tokenRow)
      if (!rawToken) {
        return null
      }
      const token = extractValueFromDecrypted(rawToken)

      const rawUserId = this.resolveCookieValue(userRow)
      const userId = rawUserId ? extractValueFromDecrypted(rawUserId) : null
      const userIds = this.parseUserIds(usersRow)

      return {
        token_v2: token,
        ...(userId ? { user_id: userId } : {}),
        ...(userIds.length > 0 ? { user_ids: userIds } : {}),
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('better-sqlite3')) {
        throw error
      }
      this.extractionErrors.push(`readTokenFromDb: ${(error as Error).message}`)
      return null
    } finally {
      try {
        rmSync(tempDbPath, { force: true })
      } catch {
        // Best-effort cleanup — temp file may already be removed
      }
    }
  }

  private parseUserIds(row: CookieRow): string[] {
    const raw = this.resolveCookieValue(row)
    if (!raw) return []

    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed
      }
    } catch {
      // Not valid JSON — try extracting JSON array from decrypted value (may have padding prefix)
      const match = raw.match(/\[.*\]/)
      if (match) {
        try {
          const parsed = JSON.parse(match[0]) as unknown
          if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
            return parsed
          }
        } catch {
          // Substring also not valid JSON — fall through to return []
        }
      }
    }

    return []
  }

  private resolveCookieValue(row: CookieRow): string | null {
    if (!row) {
      return null
    }

    if (typeof row.value === 'string' && row.value.length > 0) {
      return row.value
    }

    if (row.encrypted_value && row.encrypted_value.length > 0) {
      return this.tryDecryptCookie(Buffer.from(row.encrypted_value))
    }

    return null
  }
}
