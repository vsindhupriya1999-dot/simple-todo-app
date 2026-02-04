import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * =============================================================================
 * K6 BASELINE PERFORMANCE TEST - Simple TODO App API
 * =============================================================================
 * 
 * PURPOSE:
 * This test establishes a **stable baseline** for API performance metrics used
 * for **trend comparison across builds**. Each run captures key performance
 * indicators (throughput, latency, error rates) under consistent load.
 *
 * BASELINE USAGE IN CI/CD:
 * 1. Run baseline on stable, well-performing builds (e.g., main branch)
 * 2. Store results in performance database or artifact repo
 * 3. Compare future PR runs against baseline:
 *    - Latency regression > 10%? Flag as performance risk
 *    - Throughput drop > 15%? Investigate bottleneck
 *    - Error rate increase? Check for stability issues
 *
 * LOAD STABILITY REQUIREMENT (CRITICAL):
 * - VU count MUST remain 5–10 (fixed across all runs)
 * - Duration MUST stay 120–180 seconds (no time changes)
 * - Request pacing (sleep intervals) MUST be consistent
 * WHY: Changing load parameters invalidates trend comparisons. Any parameter
 *       change requires resetting the baseline and restarting collection.
 *
 * ENDPOINT SELECTION (DISCOVERED FROM src/index.ts):
 * Representative of typical user workflow:
 * 1. Check API info              [GET /api/about]
 * 2. List all todos              [GET /api/todos]
 * 3. Filter todos by status      [GET /api/todos/status/pending]
 * 4. Get generator capabilities  [GET /api/todos/generate/info]
 * 5. Check API documentation     [GET /api/help]
 * 6. Query with filters           [GET /api/todos?status=in-progress]
 *
 * RUNNING LOCALLY:
 * 1. Start the API server:  npm start
 * 2. Run baseline test:     k6 run tests/performance/baseline.test.js
 * 3. With custom URL:       BASE_URL=http://staging.example.com k6 run tests/performance/baseline.test.js
 * 4. Export results:        k6 run --out csv=baseline-results.csv tests/performance/baseline.test.js
 *
 * RUNNING IN CI/CD (STAGING/PRE-PROD):
 * export BASE_URL=https://staging.example.com
 * k6 run \
 *   --out json=baseline-${BUILD_ID}.json \
 *   tests/performance/baseline.test.js
 *
 * EXPECTED BASELINE RESULTS (on healthy API):
 * - Throughput: ~30–50 requests/sec (5–10 VUs)
 * - p95 latency: 300–600ms
 * - p99 latency: 600–900ms
 * - Error rate: < 1%
 * - All health checks pass
 *
 * COMPARING BASELINES:
 * Before:  {"p95": 450, "throughput": 42, "errors": 0.2}
 * After:   {"p95": 520, "throughput": 38, "errors": 0.5}
 * Verdict: ⚠️ 16% latency increase, 10% throughput drop → Investigate
 * =============================================================================
 */

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// k6 test options
export const options = {
  scenarios: {
    baseline_load: {
      executor: 'constant-vus',
      vus: 5,                    // Keep constant at 5–10 VUs (do not change)
      duration: '2m',            // Keep constant 2–3 min (do not change)
    },
  },
  thresholds: {
    // HTTP request failure rate must be below 1%
    http_req_failed: ['rate<0.01'],
    // 95th percentile latency must be below 600ms (stricter than smoke test)
    http_req_duration: ['p(95)<600'],
    // 99th percentile for additional insight
    'http_req_duration{staticAsset:yes}': ['p(99)<1000'],
  },
};

/**
 * Setup Phase - Executed once before baseline test
 * Validates environment and collects metadata
 */
export function setup() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 K6 BASELINE TEST INITIALIZATION`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📍 Target API: ${BASE_URL}`);
  console.log(`👥 Constant VUs: 5–10`);
  console.log(`⏱️  Duration: 2–3 minutes`);
  console.log(`${'-'.repeat(70)}`);

  // Health check
  const healthRes = http.get(`${BASE_URL}/api/about`);

  check(healthRes, {
    'setup: API is reachable': (r) => r.status === 200,
    'setup: response is JSON': (r) => r.headers['Content-Type'].includes('application/json'),
  });

  if (healthRes.status !== 200) {
    throw new Error(
      `❌ Baseline setup failed. API returned ${healthRes.status}. ` +
      `Ensure server is running at ${BASE_URL}`
    );
  }

  console.log('✅ API health check passed');
  console.log(`${'='.repeat(70)}\n`);

  return { baseUrl: BASE_URL, timestamp: new Date().toISOString() };
}

/**
 * Main Test Function - Simulates typical user workflow
 * Executes repeatedly for full duration with constant load
 */
export default function (data) {
  const baseUrl = data.baseUrl;

  // ========================================================================
  // WORKFLOW PHASE 1: Check API status and capabilities
  // ========================================================================

  // Request 1: Get API information
  {
    const res = http.get(`${baseUrl}/api/about`, {
      tags: {
        endpoint: '/api/about',
        method: 'GET',
        phase: 'discovery',
        type: 'metadata',
      },
    });

    check(res, {
      'baseline /api/about: status 200': (r) => r.status === 200,
      'baseline /api/about: has data': (r) => {
        try {
          return JSON.parse(r.body).data !== undefined;
        } catch {
          return false;
        }
      },
    });

    sleep(0.8); // Realistic user pause between API discovery actions
  }

  // Request 2: Get API documentation
  {
    const res = http.get(`${baseUrl}/api/help`, {
      tags: {
        endpoint: '/api/help',
        method: 'GET',
        phase: 'discovery',
        type: 'documentation',
      },
    });

    check(res, {
      'baseline /api/help: status 200': (r) => r.status === 200,
      'baseline /api/help: has endpoints': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data && body.data.endpoints !== undefined;
        } catch {
          return false;
        }
      },
    });

    sleep(1.2);
  }

  // ========================================================================
  // WORKFLOW PHASE 2: Browse and filter todos (main user workflow)
  // ========================================================================

  // Request 3: Get all todos (main list view)
  {
    const res = http.get(`${baseUrl}/api/todos`, {
      tags: {
        endpoint: '/api/todos',
        method: 'GET',
        phase: 'browsing',
        type: 'list',
      },
    });

    check(res, {
      'baseline /api/todos: status 200': (r) => r.status === 200,
      'baseline /api/todos: returns array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data);
        } catch {
          return false;
        }
      },
      'baseline /api/todos: has total count': (r) => {
        try {
          return typeof JSON.parse(r.body).total === 'number';
        } catch {
          return false;
        }
      },
    });

    sleep(0.7); // Time spent reading/scanning list
  }

  // Request 4: Filter todos by status - pending
  {
    const res = http.get(`${baseUrl}/api/todos/status/pending`, {
      tags: {
        endpoint: '/api/todos/status/:status',
        method: 'GET',
        phase: 'browsing',
        type: 'filtered-list',
        filter: 'pending',
      },
    });

    check(res, {
      'baseline /api/todos/status/pending: status 200': (r) => r.status === 200,
      'baseline /api/todos/status/pending: valid data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data) && typeof body.total === 'number';
        } catch {
          return false;
        }
      },
    });

    sleep(1.0);
  }

  // Request 5: Filter todos by query parameter - in-progress
  {
    const res = http.get(`${baseUrl}/api/todos?status=in-progress`, {
      tags: {
        endpoint: '/api/todos',
        method: 'GET',
        phase: 'browsing',
        type: 'filtered-list',
        filter: 'in-progress',
        parameter: 'query',
      },
    });

    check(res, {
      'baseline /api/todos?status=in-progress: status 200': (r) => r.status === 200,
      'baseline /api/todos?status=in-progress: correct structure': (r) => {
        try {
          const body = JSON.parse(r.body);
          return (
            body.success === true &&
            Array.isArray(body.data) &&
            typeof body.total === 'number'
          );
        } catch {
          return false;
        }
      },
    });

    sleep(0.9);
  }

  // ========================================================================
  // WORKFLOW PHASE 3: Check advanced features
  // ========================================================================

  // Request 6: Get generator information (learn about bulk generation)
  {
    const res = http.get(`${baseUrl}/api/todos/generate/info`, {
      tags: {
        endpoint: '/api/todos/generate/info',
        method: 'GET',
        phase: 'advanced',
        type: 'feature-info',
      },
    });

    check(res, {
      'baseline /api/todos/generate/info: status 200': (r) => r.status === 200,
      'baseline /api/todos/generate/info: has capabilities': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data !== undefined;
        } catch {
          return false;
        }
      },
    });

    sleep(0.6);
  }

  // Request 7: Query todos with completed filter
  {
    const res = http.get(`${baseUrl}/api/todos?status=completed`, {
      tags: {
        endpoint: '/api/todos',
        method: 'GET',
        phase: 'browsing',
        type: 'filtered-list',
        filter: 'completed',
        parameter: 'query',
      },
    });

    check(res, {
      'baseline /api/todos?status=completed: status 200': (r) => r.status === 200,
      'baseline /api/todos?status=completed: valid response': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success === true && Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });

    sleep(1.3); // Longer pause before cycling back
  }
}

/**
 * Teardown Phase - Executed once after baseline completes
 * Produces summary for trend comparison
 */
export function teardown(data) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 BASELINE TEST COMPLETED`);
  console.log(`${'='.repeat(70)}`);
  console.log(`✅ Test finished at: ${new Date().toISOString()}`);
  console.log(`📍 API tested: ${data.baseUrl}`);
  console.log(`${'-'.repeat(70)}`);
  console.log(`IMPORTANT: Baseline Results`);
  console.log(`  - Review p95 latency vs threshold (< 600ms)`);
  console.log(`  - Compare error rate (< 1%)`);
  console.log(`  - Check throughput (requests/sec)`);
  console.log(`${'-'.repeat(70)}`);
  console.log(`⚠️  STABILITY REQUIREMENT:`);
  console.log(`  VUs and duration MUST NOT CHANGE for valid trend comparison`);
  console.log(`  Current: 5–10 VUs, 2–3 min duration`);
  console.log(`${'-'.repeat(70)}`);
  console.log(`💡 NEXT STEPS:`);
  console.log(`  1. Store these metrics as baseline reference`);
  console.log(`  2. Compare against future PR runs`);
  console.log(`  3. Flag regressions > 10% latency or > 15% throughput drop`);
  console.log(`  4. If baseline needs reset, document reason and re-establish`);
  console.log(`${'='.repeat(70)}\n`);
}
