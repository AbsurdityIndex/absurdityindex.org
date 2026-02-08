# Releasing Absurdity Index

This repository contains two deliverables:

- The site (Astro static build deployed to Cloudflare Pages)
- The CLI (`cli/`) used for social automation workflows

## 1. Prepare The Release

1. Branch from `main`.
2. Confirm all checks pass locally:

```bash
npm run verify
npm run release:check
```

1. Update `CHANGELOG.md` under `[Unreleased]`.
2. If needed, bump versions in:
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
4. Builds site and CLI
5. Deploys site artifacts to Cloudflare Pages

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
