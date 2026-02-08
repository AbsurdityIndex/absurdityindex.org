# VoteChain Nodes (Cloudflare Workers)

Three independently deployable Cloudflare Worker "nodes" (plus a shared Durable Object)
to represent:

- Federal node
- State node
- Oversight node

Each node exposes the same minimal HTTP API backed by an append-only ledger stored in a
Durable Object.

## API (All Nodes)

- `GET /health`
- `GET /v1/node`
- `GET /v1/node/key`
- `GET /v1/ledger/head`
- `GET /v1/ledger/stats`
- `GET /v1/ledger/entries?from=1&limit=50`
- `GET /v1/ledger/entries/:index`
- `POST /v1/ledger/append` (role-gated)

### Append Body

```json
{
  "type": "ewp_ballot_cast",
  "payload": {
    "example": "data"
  }
}
```

Fields `tx_id` and `recorded_at` are optional; the node will generate them if missing.

## Local Dev

From the repo root:

```bash
npx wrangler dev --config workers/votechain-nodes/federal/wrangler.toml
npx wrangler dev --config workers/votechain-nodes/state/wrangler.toml
npx wrangler dev --config workers/votechain-nodes/oversight/wrangler.toml
```

## Deploy

```bash
npx wrangler deploy --config workers/votechain-nodes/federal/wrangler.toml
npx wrangler deploy --config workers/votechain-nodes/state/wrangler.toml
npx wrangler deploy --config workers/votechain-nodes/oversight/wrangler.toml
```

## Auth (Optional)

If you set `WRITE_TOKEN` (recommended), `POST /v1/ledger/append` requires:

`Authorization: Bearer <WRITE_TOKEN>`

Set via Wrangler secrets:

```bash
npx wrangler secret put WRITE_TOKEN --config workers/votechain-nodes/federal/wrangler.toml
```

