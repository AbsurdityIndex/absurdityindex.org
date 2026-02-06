# Contributing To Absurdity Index

Thanks for contributing.

## Development Setup

1. Install dependencies:
```bash
npm install
npm ci --prefix cli
```
2. Start the site:
```bash
npm run dev
```
3. Optional CLI development:
```bash
npm run cli:dev -- status --json
```

## Before Opening A PR

Run the same checks CI runs:
```bash
npm run verify
npm run validate:ci
npm run security:ci
npm run build
npm run build --prefix cli
npm test --prefix cli
```

Release process and changelog expectations are documented in `RELEASING.md` and
`CHANGELOG.md`.

## Content Contributions (Bills)

1. Start from templates in `src/data/bills/_templates/`.
2. Follow filename conventions in `AGENTS.md`.
3. Run `npm run validate` and address errors.

Note: CI treats bill validation warnings as failures.

## Code Guidelines

- Keep changes scoped and reviewable.
- Do not commit secrets (`.env`, API tokens, browser session data).
- Prefer explicit, deterministic behavior over hidden side effects.
- Add or update tests when changing CLI behavior.

## Pull Request Expectations

- Explain user-visible behavior changes.
- Include test coverage or explain why tests were not added.
- Call out any follow-up work clearly.

## Commit Signing

- Use signed commits for all changes merged to `main`.
- Any GitHub-verified signature format is acceptable (`GPG`, `SSH`, or `S/MIME`).
- Maintainers should enforce "Require signed commits" in branch protection or rulesets.

## Maintainer Policy

- `CODEOWNERS` is defined in `.github/CODEOWNERS`.
- Protect `main` and require PR approval from code owners.
- Require signed commits on `main` (GitHub verified signatures).
- Require these status checks before merge:
  - `security-audit`
  - `secret-scan`
  - `validate-content`
  - `build-site`
  - `test-cli`

## Licensing

By contributing, you agree that your contributions are licensed under the MIT License in `LICENSE`.
