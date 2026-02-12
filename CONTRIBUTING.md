# Contributing to Agent Notion

Thank you for your interest in contributing to Agent Notion!

## Development Setup

This project uses [Bun](https://bun.sh/) for development.

### 1. Install Dependencies

```bash
bun install
```

### 2. Link CLI Globally

To test the CLI locally, link it:

```bash
bun link
```

Now you can run `agent-notion` directly from your terminal.

### 3. Run Tests

We use `bun test` for TDD:

```bash
bun test src/
```

### 4. Linting and Formatting

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for lint errors and formatting
bun run lint

# Automatically fix lint errors and format code
bun run format
```

### 5. Type Checking

```bash
bun run typecheck
```

### 6. Build

```bash
bun run build
```

The compiled files will be in the `dist/` directory. The `postbuild` script will automatically replace the Bun shebang with a Node.js shebang for npm compatibility.

## Project Structure

- `src/` — Source code
  - `cli.ts` — Main CLI entry point
  - `client.ts` — Notion API client wrapper
  - `commands/` — Command implementations
  - `shared/utils/` — Shared utility functions
- `skills/` — Agent skill definitions
- `scripts/` — Build and development scripts
- `.claude-plugin/` — Claude marketplace manifest files

## Guidelines

- Follow TDD: write tests before implementing features.
- Keep the CLI agent-friendly (JSON output by default).
- Ensure Node.js compatibility (no `bun:*` imports in `src/`).
- Use named exports only.
- No docstrings on internal functions.
