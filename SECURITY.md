# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately via
[GitHub private vulnerability reporting](https://github.com/hyperyai/hypery-sdk/security/advisories/new).
Do not open a public issue for security reports.

We aim to acknowledge reports within 72 hours.

## Supported versions

Only the latest published version of `@hypery/sdk` receives security fixes.

## Scope notes

- This package is a **client-side** OAuth 2.0 + PKCE library. It never handles
  client secrets; any integration that requires a client secret must keep it
  server-side and out of `NEXT_PUBLIC_*` / browser-bundled variables.
- This repository intentionally contains no credentials, no `.env` files, and
  no repository secrets (releases publish via npm OIDC trusted publishing).
