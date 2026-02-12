import { $ } from 'bun'

export interface CLIResult {
  exitCode: number
  stdout: string
  stderr: string
}

export async function runCLI(args: string[]): Promise<CLIResult> {
  try {
    const result = await $`bun ./src/platforms/notionbot/cli.ts ${args}`.quiet().env({
      NOTION_TOKEN: process.env.E2E_NOTIONBOT_TOKEN || '',
    })
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }
  } catch (error: any) {
    return {
      exitCode: error.exitCode || 1,
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || '',
    }
  }
}

export async function runNotionCLI(args: string[]): Promise<CLIResult> {
  try {
    const result = await $`bun ./src/platforms/notion/cli.ts ${args}`.quiet()
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }
  } catch (error: any) {
    return {
      exitCode: error.exitCode || 1,
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || '',
    }
  }
}

export function parseJSON<T>(output: string): T | null {
  try {
    return JSON.parse(output) as T
  } catch {
    return null
  }
}

export function generateTestId(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

export async function waitForRateLimit(ms: number = 350): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}
