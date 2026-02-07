# MCP Server Tools

Model Context Protocol (MCP) server tools that extend Claude Code with project-specific capabilities. Registered in the root `.mcp.json` file.

## Tech Stack

- **Runtime:** Node.js
- **Protocol:** MCP via `@modelcontextprotocol/sdk` (stdio transport)
- **Dependencies:** Uses CLI's `node_modules` for Twitter API and Anthropic SDK (`createRequire` from `cli/node_modules/`)

## Tools

### `x-engage.mjs`

MCP server that provides tweet engagement tools for Claude Code:

- **`engage_tweet`** — Fetch a tweet, generate a contextual reply with Claude, and post it via X API (no link included)
- **`engage_tweet_with_link`** — Same as above but includes a link in the reply
- **`engage_tweet_substantive`** — Generate an in-depth, substantive reply
- **`fetch_tweet`** — Fetch tweet content without replying

**How it works:**
1. Reads `.env` from project root for API credentials
2. Uses `TwitterApi` (bearer token for reading, OAuth 1.0a for writing)
3. Uses Anthropic Claude for reply generation
4. Posts via X API write client

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

## Conventions

- Tools load `.env` manually (no dotenv dependency) — simple line-by-line parse
- All X API calls use the shared credentials from the project `.env`
- Reply generation uses Claude with project-specific system prompts
