---
name: agent-notion
description: Interact with Notion using the unofficial private API - extract and manage authentication tokens
allowed-tools: Bash(agent-notion:*)
---

# Agent Notion

A TypeScript CLI tool that enables AI agents and humans to interact with Notion workspaces through the unofficial private API. Provides token extraction from the Notion desktop app and authentication management.

> **Note**: This skill uses Notion's internal/private API (`/api/v3/`), which is separate from the official public API. For official API access, use `agent-notionbot`.

## Quick Start

```bash
# Extract token_v2 from Notion desktop app
agent-notion auth extract

# Check authentication status
agent-notion auth status

# Remove stored token_v2
agent-notion auth logout
```

## Authentication

### Token Extraction (Desktop App)

Extract `token_v2` from the Notion desktop app automatically. No API keys or OAuth needed.

```bash
# Extract token_v2 from Notion desktop app
agent-notion auth extract

# Check auth status (shows extracted token_v2)
agent-notion auth status

# Remove stored token_v2
agent-notion auth logout
```

On macOS, your system may prompt for Keychain access — this is normal and required to decrypt the cookie.

The extracted `token_v2` is stored at `~/.config/agent-notion/credentials.json` with `0600` permissions.

> **Note**: `token_v2` uses Notion's internal API (`/api/v3/`), which is separate from the official public API. This is the unofficial/private API and may break if Notion changes it.

## Commands

### Auth Commands

```bash
# Extract token_v2 from Notion desktop app
agent-notion auth extract

# Check authentication status (shows token_v2 status)
agent-notion auth status

# Remove stored token_v2
agent-notion auth logout
```

## Output Format

### JSON (Default)

All commands output JSON by default for AI consumption:

```json
{
  "authenticated": true,
  "token_v2": "...",
  "extracted_at": "2024-01-15T10:30:00Z"
}
```

### Pretty (Human-Readable)

Use `--pretty` flag for formatted output:

```bash
agent-notion auth status --pretty
```

## Limitations

- `auth extract` supports macOS and Linux. Windows DPAPI decryption is not yet supported.
- `token_v2` uses the unofficial internal API and may break if Notion changes it.
- This is a private/unofficial API and is not supported by Notion.
