# Quick run: PR checks locally

Run the minimal PR checks locally before opening a pull request.

```bash
npm ci
npx tsc --noEmit
npm run test:unit
npm run test:api-smoke
```

E2E tests require a running server:

```bash
npm start
npx playwright install --with-deps
npm run test:e2e
```
