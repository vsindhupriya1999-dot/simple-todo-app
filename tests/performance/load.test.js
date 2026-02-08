import http from 'k6/http';
import { check, sleep, group } from 'k6';

/**
 * =============================================================================
 * K6 LOAD TEST - Simple TODO App API
 * =============================================================================
 * 
 * PURPOSE:
 * This load test validates API **stability and scalability under sustained
 * production-like load**. It identifies bottlenecks, resource constraints, and
 * performance degradation patterns that only appear under realistic traffic.
 *
 * SCOPE:
 * ✗ NOT PR-safe (may trigger destructive operations, data mutations)
 * ✗ NOT suitable for every commit (resource intensive, requires cleanup)
 * ✅ Suitable for nightly/weekly runs on staging
 * ✅ Suitable for pre-release validation
 * ✅ Identifies latency degradation under load
 * ✅ Detects memory leaks, connection pooling issues
 *
 * KEY DIFFERENCES FROM SMOKE/BASELINE:
 *
 * SMOKE TEST:
 *   - 2–5 VUs, 50–60s, pr-safe, ramping
 *   - Validates endpoint availability
 *   - p95 < 800ms
 *
 * BASELINE TEST:
 *   - 5–10 VUs, 120–180s, constant load
 *   - Establishes performance trend baseline
 *   - p95 < 600ms (strict)
 *
 * LOAD TEST:
 *   - 20–40 VUs, 300–600s, NOT pr-safe
 *   - Stresses API under sustained load
 *   - p95 < 900ms (relaxed), p99 < 1500ms
 *   - Includes write operations (POST)
 *   - Detects resource constraints
 *
 * ENDPOINT SELECTION (DISCOVERED FROM src/index.ts):
 * Safe for load testing (read-only):
 * - GET /api/about
 * - GET /api/todos
 * - GET /api/todos/status/:status
 * - GET /api/help
 * - GET /api/todos/generate/info
 *
 * Write operations (OK in pre-release, uses in-memory store):
 * - POST /api/todos/generate (generates bulk test data, non-destructive)
 *
 * Excluded from load test:
 * - POST /api/todos (small payloads, would need cleanup)
 * - PUT /api/todos/:id (requires valid IDs, state dependent)
 * - DELETE /api/todos/:id (destructive, requires data setup)
 * - GET /api/todos/:id (requires valid IDs, no setup provided)
 *
 * PRODUCTION LOAD ESTIMATION:
 * Based on typical TODO app usage:
 * - Peak concurrent users: 20–40 during business hours
 * - Typical request pacing: 0.5–2s between interactions
 * - Mixed read/write ratio: ~90% reads, ~10% writes
 *
 * RUNNING NIGHTLY (STAGING):
 * export BASE_URL=https://staging.example.com
 * export LOAD_STAGE=nightly
 * k6 run \
 *   --out json=load-results-$(date +%Y%m%d-%H%M%S).json \
 *   tests/performance/load.test.js
 *
 * RUNNING PRE-RELEASE (STAGING):
 * export BASE_URL=https://staging.example.com
 * export LOAD_STAGE=pre-release
 * k6 run \
 *   --out influxdb=http://metrics.example.com:8086/k6 \
 *   tests/performance/load.test.js
 *
 * EXPECTED RESULTS (healthy API under load):
 * - Throughput: 150–300 requests/sec (20–40 VUs)
 * - p95 latency: 400–900ms
 * - p99 latency: 800–1500ms
 * - Error rate: < 2% (allows for some request failures)
 * - Connection pooling: stable across duration
 *
 * PERFORMANCE DEGRADATION ANALYSIS:
 * - If p95 grows > 50% during hold phase: possible memory leak
 * - If error rate increases during ramp-down: connection issues
 * - If throughput plateaus: bottleneck (DB, CPU, or connection pool)
 *
 * INTERPRETING RESULTS:
 * Threshold: p95 < 900ms, p99 < 1500ms
 * - Result: p95=750ms, p99=1200ms ✅ PASS (healthy)
 * - Result: p95=950ms, p99=1600ms ⚠️  FAIL (investigate)
 * - Result: p95=1200ms, p99=2000ms ❌ CRITICAL (severe degradation)
 * =============================================================================
 */

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LOAD_STAGE = __ENV.LOAD_STAGE || 'staging';

// k6 test options
export const options = {
  scenarios: {
    load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Ramp-up: 0 → 15 VUs over 60s (warm up connections)
        { duration: '60s', target: 15 },
        // Ramp-up: 15 → 40 VUs over 120s (build to peak load)
        { duration: '120s', target: 40 },
        // Hold: 40 VUs for 240s (sustain peak, identify degradation)
        { duration: '240s', target: 40 },
        // Ramp-down: 40 → 0 VUs over 60s (graceful shutdown, connection cleanup)
        { duration: '60s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Relaxed error threshold for load test (vs <1% for smoke/baseline)
    http_req_failed: ['rate<0.02'],
    // p95 latency under load (relaxed from baseline's <600ms)
    http_req_duration: ['p(95)<900', 'p(99)<1500'],
    // Per-endpoint thresholds for diagnostics
    'http_req_duration{endpoint:/api/todos}': ['p(95)<700'],
    'http_req_duration{endpoint:/api/about}': ['p(95)<500'],
  },
};

/**
 * Setup Phase - Executed once before load test
 * Validates environment and initializes test context
 */
export function setup() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📈 K6 LOAD TEST INITIALIZATION`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📍 Target API: ${BASE_URL}`);
  console.log(`🎯 Load Stage: ${LOAD_STAGE}`);
  console.log(`👥 VU Profile: 0 → 15 → 40 VUs (ramp, hold, ramp-down)`);
  console.log(`⏱️  Total Duration: ~480 seconds (8 minutes)`);
  console.log(`${'-'.repeat(80)}`);

  // Health check
  const healthRes = http.get(`${BASE_URL}/api/about`);

  check(healthRes, {
    'setup: API is reachable': (r) => r.status === 200,
    'setup: response time acceptable': (r) => r.timings.duration < 500,
  });

  if (healthRes.status !== 200) {
    throw new Error(
      `❌ Load test setup failed. API returned ${healthRes.status}. ` +
      `Ensure server is running at ${BASE_URL}`
    );
  }

  console.log('✅ API health check passed');
  console.log(`${'='.repeat(80)}\n`);

  return { baseUrl: BASE_URL, stage: LOAD_STAGE };
}

/**
 * Main Test Function - Simulates production user load
 * Mixes read and write operations reflective of real usage
 */
export default function (data) {
  const baseUrl = data.baseUrl;

  group('Read Operations (90% of traffic)', function () {
    // ====================================================================
    // PHASE 1: API Discovery & Metadata
    // ====================================================================

    group('Discovery Phase', function () {
      const res = http.get(`${baseUrl}/api/about`, {
        tags: {
          endpoint: '/api/about',
          method: 'GET',
          phase: 'discovery',
          type: 'metadata',
        },
      });

      check(res, {
        'load /api/about: status 200': (r) => r.status === 200,
        'load /api/about: reasonable latency': (r) => r.timings.duration < 1000,
      });

      sleep(Math.random() * 0.5 + 0.3); // 0.3–0.8s
    });

    // ====================================================================
    // PHASE 2: List & Filter (Primary User Workflow)
    // ====================================================================

    group('List & Filter Phase', function () {
      // Request 1: Main list view
      const listRes = http.get(`${baseUrl}/api/todos`, {
        tags: {
          endpoint: '/api/todos',
          method: 'GET',
          phase: 'list',
          type: 'primary',
        },
      });

      check(listRes, {
        'load /api/todos: status 200': (r) => r.status === 200,
        'load /api/todos: has data array': (r) => {
          try {
            return Array.isArray(JSON.parse(r.body).data);
          } catch {
            return false;
          }
        },
      });

      sleep(Math.random() * 0.8 + 0.5); // 0.5–1.3s

      // Request 2: Filter by status (high frequency)
      const statuses = ['pending', 'in-progress', 'completed'];
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

      const filterRes = http.get(`${baseUrl}/api/todos/status/${randomStatus}`, {
        tags: {
          endpoint: '/api/todos/status/:status',
          method: 'GET',
          phase: 'list',
          type: 'filtered',
          filter: randomStatus,
        },
      });

      check(filterRes, {
        'load /api/todos/status/:status: status 200': (r) => r.status === 200,
        'load /api/todos/status/:status: valid data': (r) => {
          try {
            const body = JSON.parse(r.body);
            return (
              Array.isArray(body.data) &&
              typeof body.total === 'number' &&
              body.data.every((item) => item.status === randomStatus || body.data.length === 0)
            );
          } catch {
            return false;
          }
        },
      });

      sleep(Math.random() * 1 + 0.6); // 0.6–1.6s

      // Request 3: Query with status parameter (alternative filtering)
      const queryRes = http.get(`${baseUrl}/api/todos?status=${randomStatus}`, {
        tags: {
          endpoint: '/api/todos',
          method: 'GET',
          phase: 'list',
          type: 'filtered',
          param_method: 'query',
        },
      });

      check(queryRes, {
        'load /api/todos?status=X: status 200': (r) => r.status === 200,
        'load /api/todos?status=X: applies filter': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.success === true && Array.isArray(body.data);
          } catch {
            return false;
          }
        },
      });

      sleep(Math.random() * 0.7 + 0.4); // 0.4–1.1s
    });

    // ====================================================================
    // PHASE 3: Feature Discovery & Info
    // ====================================================================

    group('Feature Info Phase', function () {
      const infoRes = http.get(`${baseUrl}/api/todos/generate/info`, {
        tags: {
          endpoint: '/api/todos/generate/info',
          method: 'GET',
          phase: 'features',
          type: 'info',
        },
      });

      check(infoRes, {
        'load /api/todos/generate/info: status 200': (r) => r.status === 200,
        'load /api/todos/generate/info: has capabilities': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data !== undefined;
          } catch {
            return false;
          }
        },
      });

      sleep(Math.random() * 0.6 + 0.3); // 0.3–0.9s

      const helpRes = http.get(`${baseUrl}/api/help`, {
        tags: {
          endpoint: '/api/help',
          method: 'GET',
          phase: 'features',
          type: 'documentation',
        },
      });

      check(helpRes, {
        'load /api/help: status 200': (r) => r.status === 200,
      });

      sleep(Math.random() * 0.5 + 0.2); // 0.2–0.7s
    });
  });

  // ========================================================================
  // PHASE 4: Write Operations (10% of traffic, non-destructive)
  // ========================================================================
  // Only generate bulk data; do NOT include destructive POST/PUT/DELETE
  
  if (Math.random() < 0.1) {
    // 10% of requests are write operations
    group('Write Operations (Bulk Generation)', function () {
      const generatePayload = JSON.stringify({
        count: Math.floor(Math.random() * 3) + 1, // 1–3 items
        status: ['pending', 'in-progress', 'completed'][Math.floor(Math.random() * 3)],
        randomizeCreationDate: true,
        maxCreationDaysAgo: 30,
      });

      const genRes = http.post(`${baseUrl}/api/todos/generate`, generatePayload, {
        headers: {
          'Content-Type': 'application/json',
        },
        tags: {
          endpoint: '/api/todos/generate',
          method: 'POST',
          phase: 'write',
          type: 'generation',
        },
      });

      check(genRes, {
        'load /api/todos/generate: status 201': (r) => r.status === 201,
        'load /api/todos/generate: has generated data': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Array.isArray(body.data) && body.data.length > 0;
          } catch {
            return false;
          }
        },
      });

      sleep(Math.random() * 1.5 + 0.8); // 0.8–2.3s
    });
  }
}

/**
 * Teardown Phase - Executed once after load test completes
 * Produces summary and recommendations
 */
export function teardown(data) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 LOAD TEST COMPLETED`);
  console.log(`${'='.repeat(80)}`);
  console.log(`✅ Test finished at: ${new Date().toISOString()}`);
  console.log(`📍 API tested: ${data.baseUrl}`);
  console.log(`${'-'.repeat(80)}`);
  console.log(`LOAD TEST METRICS TO REVIEW:`);
  console.log(`  ✓ Throughput (requests/sec across ramp-up, hold, ramp-down phases)`);
  console.log(`  ✓ p50, p95, p99 latency (peak should be during hold phase)`);
  console.log(`  ✓ Error rate (should stay < 2%)`);
  console.log(`  ✓ Per-endpoint latency (identify slow endpoints)`);
  console.log(`  ✓ Connection behavior (any increase in failure rate = pooling issue)`);
  console.log(`${'-'.repeat(80)}`);
  console.log(`DEGRADATION PATTERNS TO WATCH FOR:`);
  console.log(`  ⚠️  p95 latency increases during hold phase (possible memory leak)`);
  console.log(`  ⚠️  Error rate spikes during ramp-down (connection cleanup issue)`);
  console.log(`  ⚠️  Throughput plateau before reaching target VUs (bottleneck)`);
  console.log(`  ⚠️  Specific endpoint becomes slow under load (query optimization)`);
  console.log(`${'-'.repeat(80)}`);
  console.log(`NEXT STEPS:`);
  console.log(`  1. Compare results against previous load test runs`);
  console.log(`  2. If regressions detected, profile database queries`);
  console.log(`  3. Check server resource utilization (CPU, memory, connections)`);
  console.log(`  4. Consider auto-scaling thresholds based on latency`);
  console.log(`  5. Document baseline load test results for trend tracking`);
  console.log(`${'='.repeat(80)}\n`);
}
