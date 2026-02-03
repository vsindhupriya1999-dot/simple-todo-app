# Quick Start: Running Tests in VS Code

## 1. Prerequisites
```bash
npm install
```

## 2. Using VS Code Testing Panel

### Open Testing Panel
- **Windows/Linux:** `Ctrl + Shift + D`
- **Mac:** `Cmd + Shift + D`
- Or click the beaker/test icon in sidebar

### Run Tests
1. Tests auto-discover from `jest.config.js` and `playwright.config.ts`
2. Click ▶️ (play) icon next to test name to run
3. Click ▶️ (play) icon next to describe block to run all tests in suite
4. View results: ✅ PASSED or ❌ FAILED

## 3. Terminal Commands

### Run All Tests
```bash
npm run test:all
```

### Run Unit Tests Only
```bash
npm run test:unit
# or
npm test -- tests/unit/
```

### Run API Tests Only
```bash
npm run test:api
# or
npm test -- tests/api/
```

### Run E2E Tests Only
```bash
npm run test:e2e
```

### Watch Mode (Auto-rerun on file change)
```bash
npm run test:watch
```

### Generate Coverage Report
```bash
npm test -- --coverage
```

## 4. Test File Structure

### Unit Tests
- **File:** `tests/unit/todoGeneratorService.test.ts`
- **Tests:** 5 comprehensive tests for TodoGeneratorService
- **Topics:** Validation, error handling, metadata

### API Tests
- **File:** `tests/api/todos.test.ts`
- **Tests:** 10 tests covering all REST endpoints
- **Topics:** CRUD operations, status filtering, generation

### E2E Tests
- **File:** `tests/e2e/crud-flow.spec.ts`
- **Tests:** 3 workflow tests using Playwright
- **Topics:** Complete workflows, filtering, edge cases

## 5. Test Execution Details

### Before Running Tests
The test app creates a fresh Express server instance with:
- ✅ Empty in-memory todo storage
- ✅ All endpoints configured
- ✅ Request validation enabled
- ✅ Error handling active

### Test Isolation
- Each test suite gets a fresh app instance
- No data persists between tests
- Tests can run in parallel safely

## 6. View Test Results

### In VS Code
- Green checkmark (✅) = Test passed
- Red X (❌) = Test failed
- Yellow exclamation (⚠️) = Test skipped

### In Terminal
```
PASS tests/unit/todoGeneratorService.test.ts
PASS tests/api/todos.test.ts
PASS tests/e2e/crud-flow.spec.ts

Test Suites: 3 passed, 3 total
Tests:       18 passed, 18 total
Time:        12.456s
```

## 7. Debug Tests

### Run Single Test
```bash
npm test -- --testNamePattern="should validate a request"
```

### Run Single File
```bash
npm test tests/unit/todoGeneratorService.test.ts
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
# Then open: chrome://inspect
```

## 8. Expected Output Summary

```
✅ 5 Unit Tests (TodoGeneratorService validation)
✅ 10 API Tests (REST endpoints CRUD + filtering)
✅ 3 E2E Tests (Complete workflows via API)

Total: 18 tests, all passing
Execution time: ~10-15 seconds
```

## 9. Common Issues & Fixes

### Issue: Port 3013 already in use
```bash
# Kill existing process
lsof -ti:3013 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :3013   # Windows
```

### Issue: Tests timeout
```bash
# Increase timeout in jest.config.js
testTimeout: 30000  // 30 seconds
```

### Issue: Playwright browser not found
```bash
npx playwright install
```

## 10. GitHub Actions

Tests also run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- View results in Actions tab → Test Automation workflow

---

**Happy Testing! 🚀**
