# CI and Testing README

This document explains the `CI - Security and Tests` workflow and how to run checks locally.

What runs on PRs (fast, blocking):
- Gitleaks (diff)
- Semgrep (configured rules)
- `npm ci` + `npm audit --audit-level=high` (fail on high/critical)
- TypeScript type check (`npx tsc --noEmit`)
- Unit tests (`npm run test:unit`)
- API smoke tests (`npm run test:api-smoke`) — these use an in-memory Express app and do not start the server.

What runs nightly (non-destructive but more extensive):
- Full Gitleaks scan
- Full Semgrep scan
- `npm audit` full report
- Full API Jest suite (`npm run test:api`)
- Playwright E2E (`npm run test:e2e`)
- OWASP ZAP baseline + limited active scan (max 5 minutes)

Running checks locally (PR developer flow):
```bash
npm ci
npx tsc --noEmit
npm run test:unit
npm run test:api-smoke
```

Running E2E locally (developer):
```bash
npm start
# in another terminal
npm run test:e2e
```

Artifacts and reports from nightly runs are uploaded as workflow artifacts and retained according to repository settings.
