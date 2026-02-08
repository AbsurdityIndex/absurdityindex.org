# AGENTS.md — MCP Server Tools

This file provides guidance to AI coding assistants working in the `tools/` directory.

## Overview

Model Context Protocol (MCP) server tools that extend AI coding assistants (Claude Code, etc.) with project-specific capabilities. Registered in the root `.mcp.json` file for auto-discovery.

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **Protocol:** MCP via `@modelcontextprotocol/sdk` (stdio transport)
- **Shared dependencies:** Uses `createRequire` to load packages from `cli/node_modules/` (twitter-api-v2, @anthropic-ai/sdk)

## Tools

### `x-engage.mjs`

An MCP server exposing tweet engagement tools:

| Tool | Description |
|------|-------------|
| `engage_tweet` | Fetch a tweet, generate a contextual reply with Claude, post via X API (no link) |
| `engage_tweet_with_link` | Same as above but includes a link in the reply |
| `engage_tweet_substantive` | Generate an in-depth, substantive reply |
| `fetch_tweet` | Fetch tweet content without replying (read-only) |

**How it works:**

1. Reads `.env` from the project root (manual line-by-line parse, no dotenv)
2. Initializes Twitter read client (bearer token) and write client (OAuth 1.0a)
3. Initializes Anthropic client for reply generation
4. Exposes tools via MCP stdio transport

## Configuration

Registered in root `.mcp.json`:

```json
{
  "mcpServers": {
    "x-engage": {
      "command": "node",
      "args": ["tools/x-engage.mjs"],
      "cwd": "/path/to/project/root"
    }
  }
}
```

## Key Patterns

- **No dotenv dependency** — `.env` is parsed manually (split lines, skip comments, extract key=value)
- **Shared node_modules** — uses `createRequire(path.join(PROJECT_ROOT, 'cli/node_modules/'))` to avoid duplicating dependencies
- Reply generation uses Claude with project-specific system prompts embedded in the tool
- All X API credentials come from the shared project `.env` file

## Adding New Tools

To add a new MCP tool:

1. Create a new `.mjs` file in this directory
2. Import and configure `McpServer` + `StdioServerTransport` from `@modelcontextprotocol/sdk`
3. Define tools with `server.tool(name, schema, handler)`
4. Register in root `.mcp.json` with `command`, `args`, and `cwd`
