# Security & Scanning Guide

This repository includes integrated security scanning in CI. High-level notes:

- Gitleaks: runs in PR (diff) mode and nightly full scan. Config: `.gitleaks.toml`.
- Semgrep: runs in PR and nightly. Rules configured in `.semgrep.yml`.
- SCA: `npm audit` runs in PR (fail on high/critical) and nightly (full report). Optional Snyk integration may be added.
- OWASP ZAP: only runs in nightly against a local loopback server with limited active scanning (max 5 minutes).

How to interpret findings:
- Gitleaks: any secret in PR diff will block the PR. If a false positive is confirmed, add an allowlist entry and open a PR.
- Semgrep: rules with severity `ERROR` will block PRs. Warnings are shown and aggregated.
- npm audit: high/critical vulnerabilities block PRs. Nightly shows full audit report (artifact `audit-report.json`).

Adding exceptions:
- To allowlist an item for gitleaks, add a path or pattern to `.gitleaks.toml` and justify the change in PR description.
- For Semgrep, suppressions should be rare—prefer rule tuning or code fixes.

Secrets & tokens:
- PR jobs do not require tokens. Optional tokens (SNYK_TOKEN, GITLEAKS_TOKEN) may be added to GitHub Secrets for nightly or extended scans.
- Never print secrets to logs. CI steps redact secrets.
