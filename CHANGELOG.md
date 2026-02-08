# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
for tagged releases.

## [Unreleased]

### Added

- Open-source governance baseline: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, issue/PR templates, Dependabot, CODEOWNERS, `.editorconfig`,
  and `.nvmrc`.
- Security CI checks for dependency audit and secret scanning.
- CLI test coverage for formatting utilities.
- Release process documentation in `RELEASING.md`.
- Support policy in `SUPPORT.md`.
- Automated release preflight command (`npm run release:check`).
- Dedicated GitHub issue template for questions/support.

### Changed

- CI now treats bill validation warnings as failures (`validate:ci` is strict).
- Security hardening in CLI launch path, embed script rendering, and extension
  DOM rendering.
- Congress.gov fetch script now supports both `--bill x/y/z` and
  `--bill=x/y/z` forms with input validation.
- Browser extension bill lookup now tries both congress-qualified and
  unqualified bill IDs for broader Congress.gov coverage.
- Contributor and release docs now explicitly require signed commits on `main`
  and signed release tags.
