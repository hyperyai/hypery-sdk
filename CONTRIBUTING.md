# Contributing to @hypery/sdk

## Development

```bash
npm install
npm test          # bun test (install bun: https://bun.sh)
npm run build     # tsc → dist/
```

To develop against a consuming app, see "Local development" in the README (yalc).

## Commit messages — conventional commits (enforced)

Every push to `main` must contain at least one release-triggering commit
([conventional commits](https://www.conventionalcommits.org/)): `feat:`, `fix:`,
`perf:`, or a `BREAKING CHANGE:` footer. CI fails otherwise — versioning and
release notes are generated from commit messages by semantic-release.

## Releases

CI creates a GitHub **prerelease** for every push to `main`, carrying the built
npm tarball. A maintainer promotes a prerelease to "latest release" to publish
it to npm (via OIDC trusted publishing — this repo holds no tokens or secrets).

## Security policy

- This repository must never contain credentials: no `.env` files (CI fails if
  one appears), no API keys, no OAuth client secrets — including in docs and
  examples. Use `your_client_id`-style placeholders.
- GitHub push protection is enabled; do not bypass it.
- Report vulnerabilities per [SECURITY.md](./SECURITY.md).
