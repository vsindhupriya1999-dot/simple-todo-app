import http from 'k6/http';
import { check, sleep, group } from 'k6';

/**
 * =============================================================================
 * K6 STRESS TEST - Simple TODO App API
 * =============================================================================
 * 
 * PURPOSE:
 * This stress test **incrementally increases load until the API fails or 
 * degrades critically**. It identifies:
 * - SAFE CAPACITY: Maximum VUs where p95 latency stays acceptable (< 1200ms)
 * - BREAKING POINT: Load where error rate exceeds 5% or p99 > 3000ms
 *
 * FAILURE vs DEGRADATION:
 * - DEGRADATION: Response times increase but requests still succeed
 *   - p95 increases from 600ms → 1000ms → 1500ms
 *   - Error rate < 1%
 *   - Action: Consider increasing capacity, optimize queries
 *
 * - FAILURE: System returns errors or becomes unresponsive
 *   - Error rate > 5% (timeouts, 5xx, connection resets)
 *   - p99 latency > 3000ms (user-facing timeout)
 *   - VU increases no longer improve throughput (plateau)
 *   - Action: Stop test, investigate bottleneck, scale resources
 *
 * ENDPOINT SELECTION (DISCOVERED FROM src/index.ts):
 * 
 * PRIMARY STRESS ENDPOINTS (Heavy Logic):
 * - POST /api/todos/generate (bulk data generation, validation, in-memory ops)
 * - GET /api/todos (list all, may involve filtering, sorting)
 * - GET /api/todos/status/:status (filtering by status, common query)
 *
 * SECONDARY ENDPOINTS (Metadata, Lightweight):
 * - GET /api/about (metadata, no logic)
 * - GET /api/help (documentation, no logic)
 * - GET /api/todos/generate/info (generator info)
 *
 * EXCLUDED (Destructive or State-Dependent):
 * - POST /api/todos (creates single item, would need cleanup)
 * - PUT /api/todos/:id (modifies state, requires valid IDs)
 * - DELETE /api/todos/:id (destructive, requires valid IDs)
 * - GET /api/todos/:id (requires valid IDs, depends on setup)
 *
 * TEST DESIGN:
 * - Start: 10 VUs
 * - Each stage: increase by 10–15 VUs every 30 seconds
 * - Max target: 100 VUs (identify breaking point)
 * - Total duration: ~5 minutes
 * - Pacing: 0.5–1.5s between requests (realistic user pace)
 *
 * RUNNING LOCALLY:
 * k6 run tests/performance/stress.test.js
 *
 * RUNNING WITH CUSTOM URL:
 * BASE_URL=http://staging.example.com k6 run tests/performance/stress.test.js
 *
 * INTERPRETING RESULTS:
 * 
 * Safe Capacity = Highest VU level where:
 *   - Error rate < 1%
 *   - p95 latency < 1200ms
 *   - p99 latency < 2000ms
 *   - Throughput still increases with load
 *
 * Breaking Point = First VU level where:
 *   - Error rate jumps > 5%
 *   - p99 latency > 3000ms
 *   - Throughput plateaus (no improvement despite more VUs)
 *   - Connection errors appear
 *
 * EXAMPLE ANALYSIS:
 *   Stage 1 (10 VUs):  p95=400ms, errors=0.0% ✅ Healthy
 *   Stage 2 (25 VUs):  p95=650ms, errors=0.2% ✅ Acceptable
 *   Stage 3 (40 VUs):  p95=950ms, errors=0.5% ✅ Safe capacity
 *   Stage 4 (55 VUs):  p95=1500ms, errors=1.8% ⚠️  Degrading
 *   Stage 5 (70 VUs):  p95=2500ms, errors=6.2% ❌ FAILURE (breaking point)
 *   Verdict: Safe capacity ~40 VUs, breaking point ~70 VUs
 *
 * NEXT STEPS AFTER STRESS TEST:
 * 1. If breaking point is high (> 80 VUs): API is robust, scale to demands
 * 2. If breaking point is low (< 30 VUs): Investigate bottleneck
 *    - Database: Check query performance, connection pool
 *    - Memory: Monitor heap usage, check for leaks
 *    - CPU: Profile hot code paths, consider optimization
 *    - I/O: Check bandwidth, file descriptor limits
 * 3. Add caching to heavy endpoints (GET /api/todos)
 * 4. Consider horizontal scaling (load balancer, multiple instances)
 * =============================================================================
 */

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// k6 test options - Step-wise increasing VU scenario
export const options = {
  scenarios: {
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Stage 1: Baseline (10 VUs, 30s) - Establish healthy baseline
        { duration: '30s', target: 10 },
        // Stage 2: Moderate load (25 VUs, 30s) - Start putting pressure
        { duration: '30s', target: 25 },
        // Stage 3: Normal sustained (40 VUs, 30s) - Typical production load
        { duration: '30s', target: 40 },
        // Stage 4: High load (55 VUs, 30s) - Where degradation may appear
        { duration: '30s', target: 55 },
        // Stage 5: Very high (70 VUs, 30s) - Approaching capacity limits
        { duration: '30s', target: 70 },
        // Stage 6: Critical (85 VUs, 30s) - Test failure scenarios
        { duration: '30s', target: 85 },
        // Stage 7: Maximum stress (100 VUs, 30s) - Push to breaking point
        { duration: '30s', target: 100 },
        // Ramp down: 100 → 0 VUs (graceful shutdown)
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Error threshold for stress test (relaxed from load test's 2%)
    // We expect increased errors under extreme load
    http_req_failed: ['rate<0.10'],  // Warn at 10% failure
    // Latency thresholds - watch for degradation
    http_req_duration: [
      'p(95)<2000',   // 95th percentile should not exceed 2 seconds
      'p(99)<3000',   // 99th percentile should not exceed 3 seconds
    ],
  },
};

/**
 * Setup Phase - Validates API health before stress testing
 */
export function setup() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`⚡ K6 STRESS TEST INITIALIZATION`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📍 Target API: ${BASE_URL}`);
  console.log(`👥 VU Progression: 10 → 25 → 40 → 55 → 70 → 85 → 100 VUs`);
  console.log(`⏱️  Stage Duration: 30 seconds each (240s total + ramp down)`);
  console.log(`🎯 Objective: Identify safe capacity and breaking point`);
  console.log(`${'-'.repeat(80)}`);

  // Health check
  const healthRes = http.get(`${BASE_URL}/api/about`);

  check(healthRes, {
    'setup: API is reachable': (r) => r.status === 200,
    'setup: response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (healthRes.status !== 200) {
    throw new Error(
      `❌ Stress test setup failed. API returned ${healthRes.status}. ` +
      `Ensure server is running at ${BASE_URL}`
    );
  }

  console.log('✅ API health check passed. Starting stress test...');
  console.log(`${'-'.repeat(80)}\n`);

  return { baseUrl: BASE_URL };
}

/**
 * Main Test Function - Stresses the API with increasing load
 * Mixes read-heavy and write operations
 */
export default function (data) {
  const baseUrl = data.baseUrl;

  // ========================================================================
  // HEAVY OPERATION 1: Bulk generation (stresses input validation, in-mem ops)
  // ========================================================================
  group('Heavy: Bulk Generation', function () {
    const generatePayload = JSON.stringify({
      count: Math.floor(Math.random() * 5) + 2,  // 2–6 items per request
      status: ['pending', 'in-progress', 'completed'][Math.floor(Math.random() * 3)],
      randomizeCreationDate: true,
      maxCreationDaysAgo: 30,
      maxDeadlineDays: 60,
    });

    const genRes = http.post(`${baseUrl}/api/todos/generate`, generatePayload, {
      headers: { 'Content-Type': 'application/json' },
      tags: {
        endpoint: '/api/todos/generate',
        method: 'POST',
        operation: 'heavy',
        type: 'write',
      },
    });

    check(genRes, {
      'stress POST /api/todos/generate: status 201 or 400': (r) =>
        r.status === 201 || r.status === 400,
      'stress POST /api/todos/generate: valid response': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
    });

    sleep(Math.random() * 1 + 0.5);  // 0.5–1.5s pause
  });

  // ========================================================================
  // HEAVY OPERATION 2: List all todos (stresses filtering, sorting, serialization)
  // ========================================================================
  group('Heavy: List All Todos', function () {
    const listRes = http.get(`${baseUrl}/api/todos`, {
      tags: {
        endpoint: '/api/todos',
        method: 'GET',
        operation: 'heavy',
        type: 'read',
      },
    });

    check(listRes, {
      'stress GET /api/todos: status 200': (r) => r.status === 200,
      'stress GET /api/todos: has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });

    sleep(Math.random() * 0.8 + 0.4);  // 0.4–1.2s
  });

  // ========================================================================
  // HEAVY OPERATION 3: Filter by status (stresses query logic and filtering)
  // ========================================================================
  group('Heavy: Filter by Status', function () {
    const statuses = ['pending', 'in-progress', 'completed'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    const filterRes = http.get(`${baseUrl}/api/todos/status/${status}`, {
      tags: {
        endpoint: '/api/todos/status/:status',
        method: 'GET',
        operation: 'heavy',
        type: 'read',
        filter: status,
      },
    });

    check(filterRes, {
      'stress GET /api/todos/status/:status: status 200': (r) => r.status === 200,
      'stress GET /api/todos/status/:status: applies filter': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data) && typeof body.total === 'number';
        } catch {
          return false;
        }
      },
    });

    sleep(Math.random() * 0.9 + 0.5);  // 0.5–1.4s
  });

  // ========================================================================
  // LIGHTWEIGHT OPERATION 1: Query with parameters (alternative filtering path)
  // ========================================================================
  group('Lightweight: Query Filter', function () {
    const statuses = ['pending', 'in-progress', 'completed'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    const queryRes = http.get(`${baseUrl}/api/todos?status=${status}`, {
      tags: {
        endpoint: '/api/todos',
        method: 'GET',
        operation: 'light',
        type: 'read',
      },
    });

    check(queryRes, {
      'stress GET /api/todos?status=X: status 200': (r) => r.status === 200,
    });

    sleep(Math.random() * 0.6 + 0.3);  // 0.3–0.9s
  });

  // ========================================================================
  // LIGHTWEIGHT OPERATION 2: Metadata endpoints (minimal processing)
  // ========================================================================
  group('Lightweight: Metadata', function () {
    const endpoints = ['/api/about', '/api/help', '/api/todos/generate/info'];
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

    const metaRes = http.get(`${baseUrl}${endpoint}`, {
      tags: {
        endpoint: endpoint,
        method: 'GET',
        operation: 'light',
        type: 'metadata',
      },
    });

    check(metaRes, {
      'stress metadata: status 200': (r) => r.status === 200,
    });

    sleep(Math.random() * 0.5 + 0.2);  // 0.2–0.7s
  });
}

/**
 * Teardown Phase - Analysis and recommendations
 */
export function teardown(data) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 STRESS TEST COMPLETED`);
  console.log(`${'='.repeat(80)}`);
  console.log(`✅ Test finished at: ${new Date().toISOString()}`);
  console.log(`📍 API tested: ${data.baseUrl}`);
  console.log(`${'-'.repeat(80)}`);

  console.log(`CRITICAL METRICS TO ANALYZE:\n`);

  console.log(`1️⃣  DEGRADATION PATTERN (Expected)`);
  console.log(`   Stage 1–3 (10–40 VUs):  Latency should increase gradually`);
  console.log(`   - p95 latency: ~400ms → 600ms → 1000ms`);
  console.log(`   - Error rate: < 1% throughout`);
  console.log(`   - Throughput: Continues to increase`);
  console.log(`   ✅ This is NORMAL. API is handling increased load.\n`);

  console.log(`2️⃣  SAFE CAPACITY (Find This)`);
  console.log(`   The highest VU level where:`);
  console.log(`   - Error rate < 1%`);
  console.log(`   - p95 latency < 1200ms`);
  console.log(`   - p99 latency < 2000ms`);
  console.log(`   - Throughput increases with VUs (no plateau)`);
  console.log(`   ℹ️  Example: Safe capacity at 40–50 VUs\n`);

  console.log(`3️⃣  FAILURE/BREAKING POINT (Identify This)`);
  console.log(`   First stage where ANY of these occur:`);
  console.log(`   - Error rate jumps > 5%`);
  console.log(`   - p99 latency > 3000ms (user-facing timeout)`);
  console.log(`   - Throughput plateaus despite more VUs (resource exhaustion)`);
  console.log(`   - Connection errors, timeouts, 5xx errors appear`);
  console.log(`   ❌ This is FAILURE. System cannot handle more load.\n`);

  console.log(`${'-'.repeat(80)}`);
  console.log(`INTERPRETING YOUR RESULTS:\n`);

  console.log(`Scenario A - High Breaking Point (80–100 VUs)`);
  console.log(`  ✅ API is robust and scalable`);
  console.log(`  ✅ Current staging setup can handle production spikes`);
  console.log(`  Action: Monitor metrics, consider cost optimization\n`);

  console.log(`Scenario B - Moderate Breaking Point (40–60 VUs)`);
  console.log(`  ⚠️  API has reasonable capacity but limits visible`);
  console.log(`  ⚠️  May struggle during peak hours with current infra`);
  console.log(`  Action: Profile database, optimize hot paths, test caching\n`);

  console.log(`Scenario C - Low Breaking Point (< 30 VUs)`);
  console.log(`  ❌ API has severe bottleneck`);
  console.log(`  ❌ Cannot sustain production load`);
  console.log(`  Action: URGENT - investigate bottleneck before release\n`);

  console.log(`${'-'.repeat(80)}`);
  console.log(`BOTTLENECK DIAGNOSIS:\n`);

  console.log(`If breaking point is low, check:`);
  console.log(`  1. Database performance:`);
  console.log(`     - Run EXPLAIN on /api/todos and /api/todos/status/:status queries`);
  console.log(`     - Check connection pool size (default may be too small)`);
  console.log(`     - Monitor slow query log\n`);

  console.log(`  2. Memory usage:`);
  console.log(`     - In-memory storage (todos array) grows with generation`);
  console.log(`     - Each POST /api/todos/generate adds ~100 bytes`);
  console.log(`     - At 100 VUs for 240s: potential 2.4MB+ growth`);
  console.log(`     - Check heap warnings, GC pauses\n`);

  console.log(`  3. CPU/Event loop:`);
  console.log(`     - Filter operations scan entire array (O(n))`);
  console.log(`     - With many todos, filtering becomes slow`);
  console.log(`     - Consider indexing or database migration\n`);

  console.log(`  4. I/O limits:`);
  console.log(`     - File descriptor limits (ulimit -n)`);
  console.log(`     - Network connection limits per process\n`);

  console.log(`${'-'.repeat(80)}`);
  console.log(`RECOMMENDED ACTIONS:\n`);

  console.log(`Immediate:`);
  console.log(`  ☐ Run stress test weekly to track trends`);
  console.log(`  ☐ Set alert if breaking point drops > 20% from baseline\n`);

  console.log(`Short-term (1–2 weeks):`);
  console.log(`  ☐ Add database indexes on status and deadline fields`);
  console.log(`  ☐ Implement query result caching for /api/todos`);
  console.log(`  ☐ Profile slow endpoints (use 'time' or APM tool)\n`);

  console.log(`Medium-term (1–2 months):`);
  console.log(`  ☐ Migrate in-memory storage to persistent database`);
  console.log(`  ☐ Implement connection pooling`);
  console.log(`  ☐ Set up horizontal scaling (load balancer + multiple instances)\n`);

  console.log(`${'='.repeat(80)}\n`);
}
