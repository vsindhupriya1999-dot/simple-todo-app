# Testing Matrix (PR vs Nightly)

| Test Type | PR (pull_request) | Nightly (scheduled) |
|---|---:|---:|
| Unit tests (`tests/unit/**`) | ✅ | ✅ |
| API smoke (`tests/api/smoke.test.ts`) | ✅ (fast, in-memory) | ✅ |
| Full API (`tests/api/todos.test.ts`) | ❌ | ✅ |
| E2E (Playwright) (`tests/e2e/**`) | ❌ | ✅ |
| Performance / Load (`tests/performance/**`) | ❌ | ✅ (optional) |
| Gitleaks (diff/PR) | ✅ (diff) | ✅ (full) |
| Semgrep | ✅ (rules) | ✅ (rules) |
| npm audit | ✅ (fail on high/critical) | ✅ (full report) |
| OWASP ZAP | ❌ | ✅ (baseline + limited active scan) |

Rationale:
- PR runs must be fast and deterministic. Nightly runs provide heavier security and integration coverage.
