# Test Automation Strategy & Implementation

## Overview
Complete QA automation coverage for Simple TODO App with **5 Unit Tests**, **10 API Tests**, and **3 E2E Tests**.

---

## 1. UNIT TESTS (5 Tests)
**Framework:** Jest with TypeScript  
**Location:** `tests/unit/todoGeneratorService.test.ts`  
**Target:** TodoGeneratorService business logic

### Test Cases:

| # | Test Name | Type | Coverage |
|---|-----------|------|----------|
| 1 | validateRequest - Happy Path | Happy Path | Valid input validation (count, status, keywords, deadlines) |
| 2 | validateRequest - Invalid Count | Edge Cases & Invalid | Rejects count > 15, count < 1, negative, non-numeric |
| 3 | validateRequest - Invalid Status | Edge Cases & Invalid | Rejects invalid statuses, accepts all valid ones |
| 4 | validateRequest - Array & Number | Edge Cases & Invalid | Validates titleKeywords array, numeric fields, booleans |
| 5 | getGenerationInfo | Happy Path & Edge | Returns stats, templates, features, randomization options |

### Key Features Tested:
- ✅ Input validation for all parameters
- ✅ Boundary testing (min/max values)
- ✅ Type checking (string, number, boolean, array)
- ✅ Generation statistics and metadata
- ✅ Error message accuracy

---

## 2. API TESTS (10 Tests)
**Framework:** Jest + Supertest  
**Location:** `tests/api/todos.test.ts`  
**Target:** All 9 REST endpoints

### Endpoint Coverage:

| # | Endpoint | HTTP | Test Cases | Coverage |
|---|----------|------|-----------|----------|
| 1 | GET /api/todos | GET | Empty list, list after creation | List all with pagination |
| 2 | POST /api/todos | POST | Valid creation, missing title, invalid deadline | Create with validation |
| 3 | GET /api/todos/:id | GET | Valid ID, non-existent ID, invalid format | Retrieve single todo |
| 4 | PUT /api/todos/:id | PUT | Update status, title, description, invalid status, 404 | Update with validation |
| 5 | DELETE /api/todos/:id | DELETE | Valid deletion, 404 error | Delete todo |
| 6 | GET /api/todos/status/:status | GET | Filter by all 3 statuses, invalid status | Status filtering |
| 7 | GET /api/todos?status=X | GET | Query parameter filtering, invalid params | Query filtering |
| 8 | POST /api/todos/generate | POST | Generate 1, generate 5, specific status, exceed limit | Generation with validation |
| 9 | GET /api/todos/generate/info | GET | Return all generator info | Generator metadata |
| 10 | CRUD Flow | Integration | Complete CREATE→READ→UPDATE→DELETE cycle | Full workflow |

### Test Characteristics:
- ✅ Happy path scenarios
- ✅ Invalid input handling (400, 404 responses)
- ✅ Status code validation
- ✅ Response body structure
- ✅ Integration testing (multi-step flows)
- ✅ Isolated test instances (no state pollution)

---

## 3. E2E TESTS (3 Tests)
**Framework:** Playwright with Request Context  
**Location:** `tests/e2e/crud-flow.spec.ts`  
**Target:** Complete user workflows using API

### Test Scenarios:

#### E2E Test 1: Complete CRUD Flow
**Flow:** CREATE → READ → UPDATE → DELETE → VERIFY

Steps:
1. Create a todo with title, description, deadline
2. Read and verify creation
3. Update status to "in-progress" and description
4. Delete the todo
5. Verify deletion (404 response)

**Coverage:**
- ✅ Todo creation with all fields
- ✅ Deadline parsing
- ✅ Status transitions
- ✅ Description updates
- ✅ Deletion verification

#### E2E Test 2: Multi-todo Workflow
**Flow:** GENERATE → LIST → FILTER → UPDATE STATUS → DELETE

Steps:
1. Generate 3 sample todos with pending status
2. List all todos
3. Filter by pending status
4. Transition statuses (pending → in-progress → completed)
5. Filter by new statuses to verify transitions
6. Delete all created todos
7. Verify deletion

**Coverage:**
- ✅ Bulk todo generation
- ✅ Filtering with multiple statuses
- ✅ Status transition workflow
- ✅ Multiple todo management
- ✅ Cleanup and verification

#### E2E Test 3: Generator Functionality
**Flow:** INFO → GENERATE with filters → EDGE CASES → CLEANUP

Steps:
1. Get generator information (max count, templates, features)
2. Generate single todo with keyword filter
3. Generate at max limit (15 todos)
4. Try to exceed limit (expect 400)
5. Generate with deadline constraint
6. Delete all todos
7. Verify all deleted

**Coverage:**
- ✅ Generator metadata
- ✅ Keyword filtering
- ✅ Boundary testing (max limit)
- ✅ Error handling (exceeding limits)
- ✅ Deadline constraints
- ✅ Full cleanup

---

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm run test:all    # Unit + API + E2E
```

### Run Specific Test Suites
```bash
npm run test:unit   # Jest unit tests only
npm run test:api    # Jest API tests only
npm run test:e2e    # Playwright E2E tests only
```

### Watch Mode (Development)
```bash
npm run test:watch  # Jest watch mode for unit/api tests
```

### Generate Test Reports
```bash
npm run test:unit -- --coverage     # Coverage report
npx playwright show-report          # Playwright HTML report
```

---

## Test Execution in VS Code

### Method 1: Jest Extension
1. Install "Jest" extension by firsttris
2. Tests appear in VS Code Testing panel
3. Run individual tests by clicking play icon
4. View results in Test Explorer sidebar

### Method 2: Built-in Testing
1. Open Testing panel (Ctrl+Shift+D)
2. Select "Jest" as test runner
3. Tests auto-discover from jest.config.js
4. Debug individual tests

### Method 3: Terminal
```bash
npm test             # Interactive Jest CLI
npm run test:watch   # Watch mode with UI
```

---

## GitHub Actions Workflow

**File:** `.github/workflows/test-automation.yml`

### Workflow Details:
- **Trigger:** Push to main/develop, Pull requests
- **Jobs:** 4 parallel jobs
  1. **install** - Cache dependencies
  2. **unit-tests** - Jest unit tests
  3. **api-tests** - Jest API tests with Supertest
  4. **e2e-tests** - Playwright tests
  5. **test-summary** - Aggregated results

### Features:
- ✅ Parallel test execution
- ✅ Node.js 18 environment
- ✅ Artifact collection (reports, screenshots)
- ✅ Server auto-startup for E2E tests
- ✅ Playwright browser installation
- ✅ Job status aggregation

### View Results:
1. GitHub Actions tab → Test Automation workflow
2. Check individual job logs
3. Download artifacts (reports, screenshots)
4. View job summary with test results

---

## Test Design Principles

### 1. Isolation
- Each test is independent
- Fresh state before each test
- No shared test data between tests

### 2. Comprehensive Coverage
- Happy path scenarios
- Edge cases (boundary values)
- Invalid inputs (negative testing)
- Error handling (400, 404, 500 responses)

### 3. Clear Naming
- Describe WHAT is being tested
- Describe EXPECTED vs ACTUAL behavior
- Test name reflects requirement

### 4. Maintainability
- Reusable test utilities
- Clear assertion messages
- Organized by feature/endpoint
- Documented test purpose

### 5. Reliability
- Deterministic (consistent results)
- No race conditions
- Proper cleanup (beforeEach/afterAll)
- Timeout handling for async operations

---

## Coverage Summary

| Category | Coverage | Tests |
|----------|----------|-------|
| **Unit** | TodoGeneratorService | 5 |
| **API** | All 9 REST endpoints | 10 |
| **E2E** | Complete workflows | 3 |
| **Total** | | 18 |

---

## Key Files Created

```
project-root/
├── jest.config.js                          # Jest configuration
├── playwright.config.ts                    # Playwright configuration
├── package.json                            # Updated with test scripts & deps
├── .github/workflows/
│   └── test-automation.yml                 # GitHub Actions workflow
├── tests/
│   ├── unit/
│   │   └── todoGeneratorService.test.ts    # 5 unit tests
│   ├── api/
│   │   └── todos.test.ts                   # 10 API tests
│   └── e2e/
│       └── crud-flow.spec.ts               # 3 E2E tests
```

---

## Dependencies Added

```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.11",
    "ts-jest": "^29.1.1",
    "supertest": "^6.3.3",
    "@types/supertest": "^2.0.12",
    "@playwright/test": "^1.40.1"
  }
}
```

---

## Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Run tests: `npm run test:all`
3. ✅ Review reports in artifacts
4. ✅ Integrate into CI/CD pipeline
5. ✅ Maintain and expand test coverage

---

**Created by:** Senior QA Automation Engineer  
**Date:** February 2, 2026  
**Framework Stack:** Jest + Supertest + Playwright
