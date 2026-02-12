# Releasing Absurdity Index

This repository contains two deliverables:

- The site (Astro static build deployed to Cloudflare Pages)
- The CLI (`cli/`) used for social automation workflows
- A coordinated deploy manifest for site + VoteChain (`deploy/release-manifest.json`)

Cloudflare Pages projects used by this repo:

- Test: `absurdity-index-test` + `votechain-test`
- Production: `absurdity-index` + `votechain`

Required test-project runtime binding for integrated VoteChain routing:

- `VOTECHAIN_UPSTREAM_HOST=votechain-test.pages.dev` on `absurdity-index-test`

## 1. Prepare The Release

1. Branch from `main`.
2. Confirm all checks pass locally:

```bash
npm run verify
npm run release:check
node scripts/check-release-manifest.mjs --verify-remote
```

3. Update `CHANGELOG.md` under `[Unreleased]`.
4. Update `deploy/release-manifest.json` with the VoteChain commit SHA to ship with this release.
5. If needed, bump versions in:
   - `package.json`
   - `cli/package.json`

## 2. Merge To Main

1. Open a PR and require:
   - Code owner approval
   - Signed commits
   - Required CI checks from `CONTRIBUTING.md`
2. Merge to `main`.

Pushes to `main` trigger the Woodpecker pipeline in `.woodpecker.yml`, which:

1. Installs dependencies
2. Runs security checks
3. Runs strict content validation
4. Validates the coordinated release manifest
5. Builds site artifacts
6. Deploys VoteChain to `votechain-test`
7. Deploys this site to `absurdity-index-test`
8. Deploys VoteChain from the pinned manifest SHA to production
9. Deploys site artifacts to production

## 3. Create A GitHub Release (Optional, Recommended)

1. Create a signed annotated tag from `main` (example: `v0.2.0`):

```bash
git tag -s v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

1. Create a GitHub Release for the tag.
2. Copy release notes from `CHANGELOG.md`.

## 4. Post-Release Checks

1. Verify production site at `https://absurdityindex.org`.
2. Spot-check key routes (`/`, `/bills`, one real bill page).
3. Verify no secrets leaked in built output:

```bash
grep -R "API_KEY" dist/
```

## 5. Test Deploy Smoke Checks

After CI deploys to test projects, verify:

1. `https://absurdity-index-test.pages.dev/`
2. `https://absurdity-index-test.pages.dev/votechain/`
3. `https://votechain-test.pages.dev/votechain/`
4. `https://absurdity-index-test.pages.dev/api/votechain/poc/config`
5. `https://absurdity-index-test.pages.dev/api/today.json`
