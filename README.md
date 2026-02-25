# Vibe Notion

[![npm version](https://img.shields.io/npm/v/vibe-notion)](https://www.npmjs.com/package/vibe-notion) [![SkillPad - vibe-notion](https://img.shields.io/badge/SkillPad-vibe--notion-1a1a1a)](https://skillpad.dev/install/devxoul/vibe-notion/vibe-notion) [![SkillPad - vibe-notionbot](https://img.shields.io/badge/SkillPad-vibe--notionbot-1a1a1a)](https://skillpad.dev/install/devxoul/vibe-notion/vibe-notionbot)

![demo](./docs/public/vibe-notion-demo.gif)

**Give your AI agent the power to read and write Notion pages, databases, and more ✨**

A full-coverage, agent-friendly CLI for the Notion API. Ships two CLIs — `vibe-notion` for the unofficial private API (act as yourself) and `vibe-notionbot` for the official Integration API (act as a bot).

## Table of Contents

- [Why Vibe Notion?](#-why-vibe-notion)
- [Installation](#-installation)
- [Agent Skills](#-agent-skills)
  - [SkillPad](#skillpad)
  - [Skills CLI](#skills-cli)
  - [Claude Code Plugin](#claude-code-plugin)
  - [OpenCode Plugin](#opencode-plugin)
- [Quick Start](#-quick-start)
- [Command Overview](#-command-overview)
- [Use Cases](#-use-cases)
  - [Research & Discovery](#research--discovery)
  - [Project Tracking](#project-tracking)
  - [Creating & Writing](#creating--writing)
  - [Automation & Pipelines](#automation--pipelines)
  - [...and More](#and-more)
- [Philosophy](#-philosophy)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Why Vibe Notion?

Notion's official API only supports Integration (bot) tokens — your agent can't do things **on behalf of you**. Vibe Notion solves this by extracting your `token_v2` from the Notion desktop app, so your agent operates as you, with your full permissions.

Need official API access instead? `vibe-notionbot` is included and fully supports Integration tokens via `NOTION_TOKEN`.

- 👤 **Act as you** — `vibe-notion` extracts `token_v2` from the Notion desktop app to operate with your own permissions
- 🤖 **Bot support too** — `vibe-notionbot` supports official Integration tokens via `NOTION_TOKEN`
- 📦 **Full API coverage** — Pages, databases, blocks, users, search, comments, and workspaces
- 🧾 **Agent friendly** — JSON output by default, perfect for LLM tool use
- 🧠 **Agent memory** — Remembers workspace IDs, page names, and preferences across sessions
- 🪙 **Token efficient** — CLI, not MCP. Load only what you need. ([Why not MCP?](#-philosophy))

## 📦 Installation

```bash
npm install -g vibe-notion
```

Or use your favorite package manager.

This installs both the `vibe-notion` and `vibe-notionbot` CLI tools.

## 🧩 Agent Skills

Vibe Notion includes [Agent Skills](https://agentskills.io/) that teach your AI agent how to use the CLI effectively. Two skills are available:

- **`vibe-notion`** — For the unofficial private API (`token_v2`)
- **`vibe-notionbot`** — For the official Integration API (`NOTION_TOKEN`)

### SkillPad

SkillPad is a GUI app for Agent Skills. See [skillpad.dev](https://skillpad.dev/) for more details.

[![Available on SkillPad](https://badge.skillpad.dev/vibe-notion/dark.svg)](https://skillpad.dev/install/devxoul/vibe-notion/vibe-notion) [![Available on SkillPad](https://badge.skillpad.dev/vibe-notionbot/dark.svg)](https://skillpad.dev/install/devxoul/vibe-notion/vibe-notionbot)


### Skills CLI

Skills CLI is a CLI tool for Agent Skills. See [skills.sh](https://skills.sh/) for more details.

```bash
npx skills add devxoul/vibe-notion
```

### Claude Code Plugin

```
/plugin marketplace add devxoul/vibe-notion
/plugin install vibe-notion
```

### OpenCode Plugin

Add to your `opencode.jsonc`:

```jsonc
{
  "plugins": [
    "vibe-notion"
  ]
}
```

## 🚀 Quick Start

### `vibe-notion` (Private API — act as yourself)

```bash
# 1. List your workspaces
vibe-notion workspace list --pretty

# 2. Search for something
vibe-notion search "Roadmap" --workspace-id <workspace-id> --pretty

# 3. Get page details
vibe-notion page get <page-id> --workspace-id <workspace-id> --pretty
```

### `vibe-notionbot` (Official API — act as a bot)

```bash
# 1. Set your Notion Integration Token
export NOTION_TOKEN=secret_xxx

# 2. Check auth status
vibe-notionbot auth status --pretty

# 3. Search for something
vibe-notionbot search "Roadmap" --filter page --pretty

# 4. Get page details
vibe-notionbot page get <page-id> --pretty
```

## 🛠 Command Overview

### `vibe-notion` (Private API)

| Command | Description |
|---------|-------------|
| `auth` | Extract token, check status, logout |
| `workspace` | List accessible workspaces |
| `page` | Get, list, create, update, archive pages |
| `database` | Get schema, query, create, update, delete properties, add/update rows, list, manage views |
| `block` | Get, list children, append (with nested markdown support), update, delete blocks |
| `user` | Get current user, get user by ID |
| `search` | Workspace search |
| `comment` | List, create, and get comments (including inline block-level comments) |

> All commands that operate within a workspace require `--workspace-id`. Use `vibe-notion workspace list` to find yours.

### `vibe-notionbot` (Official API)

| Command | Description |
|---------|-------------|
| `auth` | Check authentication status |
| `page` | Get, create, update, archive pages, retrieve properties |
| `database` | Get schema, query, create, update, delete properties, list databases |
| `block` | Get, list children, append (with nested markdown support), update, delete blocks |
| `user` | List users, get user info, get bot info |
| `search` | Global workspace search with filters |
| `comment` | List, create, and get comments (including inline block-level comments) |

> Requires `NOTION_TOKEN` environment variable with an Integration token from the [Notion Developer Portal](https://www.notion.so/my-integrations).

## 💡 Use Cases

### Research & Discovery

Pull context from Notion before you start working — no tab-switching, no skimming.

> "Gather all context from the BUG-1234 page — read the description, comments, and any linked pages so I can start fixing it."

> "Search our Engineering Wiki for any existing discussion about rate limiting before I write a new proposal."

> "Look up our Onboarding Guide page and answer: what's the process for requesting AWS access?"

> "Search across all workspaces for any page mentioning 'API deprecation' so I know if this was discussed before."

> "Read the API Design Principles page and the REST Conventions page, then tell me if our current approach violates any of them."

### Project Tracking

Let your agent check, update, and clean up project boards without leaving your editor.

> "Query the Sprint 24 database and tell me which tasks are still in progress or blocked."

> "Update the status of task INFRA-42 in the Sprint database to Done and set the completed date to today."

> "Find all tasks in the Q1 Roadmap database with status Done and archive them."

> "List everything assigned to me across the Backend and Infrastructure databases that's due this week."

> "Move all P0 bugs from the Triage database to the Sprint 25 database and set their status to To Do."

### Creating & Writing

Create pages, file reports, and post updates — all from a prompt.

> "Create a meeting notes page under the Team Meetings database with today's date, attendees, and an empty agenda section."

> "I found a crash in production. Create a bug report page in the Bug Tracker database with this stack trace, set priority to P1, and assign it to me."

> "Post a comment on the Project Alpha page summarizing what the team shipped today."

> "Write an RFC page in the Engineering Proposals database with the title 'Migrate to gRPC' and scaffold the Problem, Proposal, Alternatives, and Open Questions sections."

> "Add a new row to the Interview Scorecard database for the candidate I just talked to, with my notes and a Strong Hire recommendation."

### Automation & Pipelines

Wire Notion into your CI, scripts, or agent workflows as a read/write layer.

> "A new user just signed up. Add a row to the Leads database with their name, email, and source."

> "Append today's deploy results to the Deploy Log page — include the commit hash, status, and timestamp."

> "Read the content of the v2.3 Release page and draft a changelog from it."

> "Every time a GitHub issue is labeled 'needs-design', create a page in the Design Requests database with the issue title, link, and reporter."

> "Query the On-Call Schedule database for this week's rotation and post the name in our Slack channel."

### ...and More

These are just starting points. Your agent has full read/write access to Notion — the real limit is your creativity. If you build something amazing with Vibe Notion, [let me know](https://x.com/devxoul)!
## 🧠 Philosophy

**Why not MCP?** MCP servers expose all tools at once, bloating context and confusing agents. **[Agent Skills](https://agentskills.io/) + agent-friendly CLI** offer a better approach—load what you need, when you need it. Fewer tokens, cleaner context, better output.

Inspired by [agent-browser](https://github.com/vercel-labs/agent-browser) from Vercel Labs and [agent-messenger](https://github.com/devxoul/agent-messenger).

## 🤝 Contributing

```bash
bun install    # Install dependencies
bun link       # Link CLI globally for local testing
bun test       # Run tests
bun run lint   # Lint
bun run build  # Build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## 📄 License

MIT
