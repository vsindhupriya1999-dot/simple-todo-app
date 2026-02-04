import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * =============================================================================
 * K6 PERFORMANCE SMOKE TEST - Simple TODO App API
 * =============================================================================
 * 
 * PURPOSE:
 * This is a PR-safe performance smoke test designed to validate API stability
 * and responsiveness during lightweight, low-risk scenarios. It is NOT intended
 * for load or stress testing.
 *
 * KEY DIFFERENCES FROM LOAD/STRESS TESTS:
 * - Max 5 virtual users (VUs) vs 50+ for load tests
 * - ~60 second total duration vs 5-30 minutes for load/stress
 * - Only safe, idempotent GET endpoints included
 * - No data modification (no DELETE, PUT operations)
 * - Minimal payloads, no memory/CPU intensive operations
 * - Can safely run on every PR without infrastructure overhead
 *
 * ENDPOINT SELECTION (DISCOVERED FROM src/index.ts):
 * ✓ GET /api/todos           [SAFE: Read-only, returns list]
 * ✓ GET /api/todos/status/:id [SAFE: Read-only, filters by status]
 * ✓ GET /api/about           [SAFE: Read-only, metadata endpoint]
 * ✓ GET /api/help            [SAFE: Read-only, documentation endpoint]
 * ✓ GET /api/todos/generate/info [SAFE: Read-only, generator info]
 *
 * EXCLUDED ENDPOINTS (Non-PR-Safe):
 * ✗ POST /api/todos           [Creates data in-memory]
 * ✗ POST /api/todos/generate  [Creates data in-memory]
 * ✗ PUT /api/todos/:id        [Modifies existing data]
 * ✗ DELETE /api/todos/:id     [Destructive operation]
 * ✗ GET /api/todos/:id        [Requires valid ID, no setup]
 *
 * RUNNING LOCALLY:
 * 1. Start the API server:   npm start
 * 2. Run the smoke test:     k6 run tests/performance/perf-smoke.test.js
 * 3. With custom BASE_URL:   BASE_URL=http://localhost:3000 k6 run tests/performance/perf-smoke.test.js
 *
 * RUNNING IN CI/CD PIPELINE:
 * export BASE_URL=http://localhost:3000  # or your staging URL
 * k6 run tests/performance/perf-smoke.test.js
 *
 * EXPECTED RESULTS (on healthy API):
 * - HTTP request failure rate < 1%
 * - 95th percentile latency < 800ms
 * - All health checks pass
 * =============================================================================
 */

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3013';

// k6 test options
export const options = {
  scenarios: {
    smoke_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 2 },   // Ramp up to 2 VUs over 10s
        { duration: '30s', target: 5 },   // Ramp up to 5 VUs over next 20s (total 30s)
        { duration: '10s', target: 0 },   // Ramp down to 0 VUs over 10s
      ],
    },
  },
  thresholds: {
    // HTTP request failure rate must be below 1%
    http_req_failed: ['rate<0.01'],
    // 95th percentile latency must be below 800ms
    http_req_duration: ['p(95)<800'],
  },
};

/**
 * Setup Phase - Executed once per test run
 * Validates API connectivity before running load tests
 */
export function setup() {
  console.log(`🔗 Connecting to API at: ${BASE_URL}`);

  // Health check: Verify API is reachable with /api/about endpoint
  const healthRes = http.get(`${BASE_URL}/api/about`);
  
  check(healthRes, {
    'setup: API is reachable': (r) => r.status === 200,
    'setup: response is JSON': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json'),
  });

  if (healthRes.status !== 200) {
    throw new Error(`❌ API health check failed. Status: ${healthRes.status}. Is the server running at ${BASE_URL}?`);
  }

  console.log('✅ API is healthy and ready for smoke testing');
  return { baseUrl: BASE_URL };
}

/**
 * Main Test Function - Executes for each VU iteration
 */
export default function (data) {
  const baseUrl = data.baseUrl;

  // Test 1: GET /api/about - API metadata endpoint
  {
    const res = http.get(`${baseUrl}/api/about`, {
      tags: { endpoint: 'about', method: 'GET' },
    });

    check(res, {
      'GET /api/about: status is 200': (r) => r.status === 200,
      'GET /api/about: response is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      'GET /api/about: has success field': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success === true;
        } catch {
          return false;
        }
      },
    });

    sleep(Math.random() * 1 + 0.5); // Sleep 0.5-1.5s
  }

  // Test 2: GET /api/todos - List all todos (safe: read-only)
  {
    const res = http.get(`${baseUrl}/api/todos`, {
      tags: { endpoint: 'todos_list', method: 'GET' },
    });

    check(res, {
      'GET /api/todos: status is 200': (r) => r.status === 200,
      'GET /api/todos: response is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      'GET /api/todos: returns data array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });

    sleep(Math.random() * 1 + 0.5); // Sleep 0.5-1.5s
  }

  // Test 3: GET /api/todos/status/pending - Filter by status (safe: read-only)
  {
    const res = http.get(`${baseUrl}/api/todos/status/pending`, {
      tags: { endpoint: 'todos_by_status', method: 'GET', status: 'pending' },
    });

    check(res, {
      'GET /api/todos/status/pending: status is 200': (r) => r.status === 200,
      'GET /api/todos/status/pending: response is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      'GET /api/todos/status/pending: has total count': (r) => {
        try {
          const body = JSON.parse(r.body);
          return typeof body.total === 'number';
        } catch {
          return false;
        }
      },
    });

    sleep(Math.random() * 1 + 0.5); // Sleep 0.5-1.5s
  }

  // Test 4: GET /api/todos/generate/info - Generator metadata (safe: read-only)
  {
    const res = http.get(`${baseUrl}/api/todos/generate/info`, {
      tags: { endpoint: 'generator_info', method: 'GET' },
    });

    check(res, {
      'GET /api/todos/generate/info: status is 200': (r) => r.status === 200,
      'GET /api/todos/generate/info: response is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      'GET /api/todos/generate/info: has data field': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data !== undefined;
        } catch {
          return false;
        }
      },
    });

    sleep(Math.random() * 1 + 0.5); // Sleep 0.5-1.5s
  }

  // Test 5: GET /api/help - API documentation (safe: read-only)
  {
    const res = http.get(`${baseUrl}/api/help`, {
      tags: { endpoint: 'help', method: 'GET' },
    });

    check(res, {
      'GET /api/help: status is 200': (r) => r.status === 200,
      'GET /api/help: response is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      'GET /api/help: has endpoints information': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data && body.data.endpoints !== undefined;
        } catch {
          return false;
        }
      },
    });

    sleep(Math.random() * 1 + 0.5); // Sleep 0.5-1.5s
  }

  // Test 6: GET /api/todos with query parameter (safe: read-only with filter)
  {
    const res = http.get(`${baseUrl}/api/todos?status=completed`, {
      tags: { endpoint: 'todos_with_filter', method: 'GET', param: 'status' },
    });

    check(res, {
      'GET /api/todos?status=completed: status is 200': (r) => r.status === 200,
      'GET /api/todos?status=completed: response is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      'GET /api/todos?status=completed: applies filter': (r) => {
        try {
          const body = JSON.parse(r.body);
          // If there are items, they should all have status completed
          return body.data.every((item) => item.status === 'completed' || body.data.length === 0);
        } catch {
          return false;
        }
      },
    });

    sleep(Math.random() * 1 + 0.5); // Sleep 0.5-1.5s
  }
}

/**
 * Teardown Phase - Executed once after all VUs complete
 * Used for cleanup and final reporting
 */
export function teardown(data) {
  console.log('✅ Performance smoke test completed successfully');
  console.log(`📊 Test Summary:`);
  console.log(`   - Base URL: ${data.baseUrl}`);
  console.log(`   - Max VUs: 5`);
  console.log(`   - Duration: ~50 seconds`);
  console.log(`   - Safe endpoints only (GET, read-only)`);
  console.log(`   - No data modifications or cleanup required`);
}
