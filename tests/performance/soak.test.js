import http from 'k6/http';
import { check, sleep, group } from 'k6';

/**
 * =============================================================================
 * K6 SOAK TEST - Simple TODO App API
 * =============================================================================
 * 
 * PURPOSE:
 * This soak test validates **API stability and sustainability under sustained
 * load over extended periods (30–60 minutes)**. It identifies performance
 * degradation that only manifests during long-running sessions:
 * - MEMORY LEAKS: Heap grows over time without stabilization
 * - LATENCY CREEP: Response times gradually increase (exponential tail)
 * - ERROR ACCUMULATION: Errors increase as resources become exhausted
 * - CONNECTION POOL EXHAUSTION: Connections not returned to pool
 *
 * DISTINCTION FROM OTHER TESTS:
 *
 * SMOKE TEST (50–60s, 5 VUs):
 *   - Quick validation, PR-safe
 *   - Doesn't reveal long-term issues
 *
 * BASELINE TEST (120–180s, 5–10 VUs):
 *   - Establishes performance reference
 *   - Short duration, steady state
 *
 * LOAD TEST (300–600s, 20–40 VUs):
 *   - Validates sustained capacity under realistic load
 *   - Still too short to reveal memory leaks
 *
 * STRESS TEST (240s, 10–100 VUs ramping):
 *   - Identifies breaking point
 *   - Peak load, short burst
 *
 * SOAK TEST (1800–3600s, 10–15 VUs constant):
 *   - Extended duration (30–60 minutes)
 *   - Constant load, realistic pacing
 *   - Reveals memory leaks, connection issues, error drift
 *   - Production-representative user sessions
 *
 * ENDPOINT SELECTION (DISCOVERED FROM src/index.ts):
 * 
 * Long-running session endpoints:
 * - GET /api/todos (primary list view, checked frequently)
 * - GET /api/todos/status/:status (filtering, user drill-down)
 * - POST /api/todos/generate (bulk data generation, realistic workflow)
 * - GET /api/todos/generate/info (capability check)
 * - GET /api/help, GET /api/about (metadata, occasional checks)
 *
 * Excluded (not typical in long sessions):
 * - POST /api/todos (single item, would need cleanup)
 * - PUT /api/todos/:id (requires valid IDs, state dependent)
 * - DELETE /api/todos/:id (destructive, not representative)
 * - GET /api/todos/:id (requires valid IDs, no setup)
 *
 * USER SESSION SIMULATION:
 * - Start with API discovery (metadata checks)
 * - Frequent list views and filters (main activity)
 * - Periodic bulk generation (heavy operations)
 * - Occasional info lookups
 * - Repeat for full duration
 *
 * RUNNING SOAK TEST (30 min on localhost):
 * k6 run --duration 30m tests/performance/soak.test.js
 *
 * RUNNING SOAK TEST (60 min on staging):
 * BASE_URL=https://staging.example.com k6 run \
 *   --duration 60m \
 *   --out json=soak-results-60min-$(date +%s).json \
 *   tests/performance/soak.test.js
 *
 * MONITORING DURING SOAK TEST:
 * - Watch server memory usage (top, htop, Activity Monitor)
 * - Monitor CPU usage (should remain constant, not increasing)
 * - Check error logs for warnings, timeouts, connection errors
 * - Track p95/p99 latency over time (should stay flat, not creep upward)
 *
 * INTERPRETING RESULTS:
 * 
 * HEALTHY SOAK TEST:
 * - Memory: Stable or slight growth in first 5 min, then flat
 * - Latency: p95 consistent throughout (e.g., 400ms ± 50ms)
 * - Errors: < 0.5% throughout, no increasing trend
 * - Throughput: Constant, no degradation
 * ✅ API is production-ready for long sessions
 *
 * MEMORY LEAK INDICATOR:
 * - Memory grows 50MB+ per hour without plateau
 * - p95 latency creeps from 400ms → 600ms → 1000ms
 * - Error rate increases from 0.1% → 1% → 5% over time
 * ❌ Stop test, investigate: array growth, event listener cleanup, GC
 *
 * CONNECTION POOL EXHAUSTION:
 * - After 15–20 min, "connection pool" errors appear
 * - Latency spikes periodically (every 5–10 min)
 * - Error rate increases at specific intervals
 * ❌ Check: pool.max, connection lifecycle, cleanup handlers
 *
 * GARBAGE COLLECTION ISSUE:
 * - Long pauses (> 500ms) appear suddenly at intervals
 * - p99 latency spikes while p50 remains stable
 * - CPU usage spikes correlate with pauses
 * ⚠️  Review: large object allocation, GC tuning needed
 *
 * PHASE TIMING:
 * Duration split across phases (simulating typical user session):
 * - 0–5 min:   Initial discovery (API info, help)
 * - 5–25 min:  Main activity (list, filter, generate) [20 min]
 * - 25–30 min: Taper and graceful exit
 *
 * For 60-minute soak:
 * - 0–5 min:   Discovery
 * - 5–55 min:  Main activity [50 min]
 * - 55–60 min: Taper
 * =============================================================================
 */

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SOAK_DURATION = __ENV.SOAK_DURATION || '30m';

// k6 test options
export const options = {
  scenarios: {
    soak_test: {
      executor: 'constant-vus',
      vus: 10,                        // Constant 10 VUs (realistic business hours load)
      duration: SOAK_DURATION,        // 30–60 minutes
    },
  },
  thresholds: {
    // Relaxed thresholds to tolerate long-duration variations
    http_req_failed: ['rate<0.05'],     // Allow up to 5% errors (drift expected)
    http_req_duration: [
      'p(50)<600',                       // Median should stay < 600ms
      'p(95)<1500',                      // 95th percentile < 1.5s
      'p(99)<3000',                      // 99th percentile < 3s
    ],
  },
};

/**
 * Setup Phase - Validates environment before soak test
 */
export function setup() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 K6 SOAK TEST INITIALIZATION`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📍 Target API: ${BASE_URL}`);
  console.log(`👥 Constant Load: 10 VUs`);
  console.log(`⏱️  Duration: ${SOAK_DURATION}`);
  console.log(`🎯 Focus: Memory leaks, latency creep, error accumulation`);
  console.log(`${'-'.repeat(80)}`);
  console.log(`\n⚠️  IMPORTANT - Monitor during soak test:`);
  console.log(`  • Server memory usage (should remain stable)`);
  console.log(`  • CPU utilization (should be constant)`);
  console.log(`  • Error logs for connection/timeout warnings`);
  console.log(`  • Latency percentiles (p95, p99 should not increase)`);
  console.log(`${'-'.repeat(80)}\n`);

  // Health check
  const healthRes = http.get(`${BASE_URL}/api/about`);

  check(healthRes, {
    'setup: API is reachable': (r) => r.status === 200,
    'setup: response time acceptable': (r) => r.timings.duration < 500,
  });

  if (healthRes.status !== 200) {
    throw new Error(
      `❌ Soak test setup failed. API returned ${healthRes.status}. ` +
      `Ensure server is running at ${BASE_URL}`
    );
  }

  console.log('✅ API health check passed. Starting soak test...\n');

  return { baseUrl: BASE_URL, startTime: new Date().getTime() };
}

/**
 * Main Test Function - Simulates extended user session
 * Repeats realistic workflow patterns for full soak duration
 */
export default function (data) {
  const baseUrl = data.baseUrl;

  // ========================================================================
  // PHASE 1: API Discovery (occasional, simulates new user or periodic checks)
  // ========================================================================
  if (Math.random() < 0.05) {
    // 5% of requests are discovery checks
    group('Session: Discovery Checks', function () {
      const aboutRes = http.get(`${baseUrl}/api/about`, {
        tags: {
          endpoint: '/api/about',
          method: 'GET',
          phase: 'discovery',
          type: 'metadata',
        },
      });

      check(aboutRes, {
        'soak /api/about: status 200': (r) => r.status === 200,
      });

      sleep(Math.random() * 0.3 + 0.2); // 0.2–0.5s

      const helpRes = http.get(`${baseUrl}/api/help`, {
        tags: {
          endpoint: '/api/help',
          method: 'GET',
          phase: 'discovery',
          type: 'documentation',
        },
      });

      check(helpRes, {
        'soak /api/help: status 200': (r) => r.status === 200,
      });

      sleep(Math.random() * 0.3 + 0.2); // 0.2–0.5s
    });
  }

  // ========================================================================
  // PHASE 2: Primary User Workflow (85% of session - list, filter, generate)
  // ========================================================================

  group('Session: Primary Activity - List & Filter', function () {
    // Activity 1: Check main list (frequent, every iteration)
    const listRes = http.get(`${baseUrl}/api/todos`, {
      tags: {
        endpoint: '/api/todos',
        method: 'GET',
        phase: 'primary',
        type: 'list',
        frequency: 'high',
      },
    });

    check(listRes, {
      'soak GET /api/todos: status 200': (r) => r.status === 200,
      'soak GET /api/todos: returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });

    sleep(Math.random() * 0.6 + 0.4); // 0.4–1.0s (reading/scanning list)
  });

  // ========================================================================
  // PHASE 3: Status Filtering (60% of requests - realistic drill-down behavior)
  // ========================================================================
  if (Math.random() < 0.6) {
    group('Session: Filter by Status', function () {
      const statuses = ['pending', 'in-progress', 'completed'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const filterRes = http.get(`${baseUrl}/api/todos/status/${status}`, {
        tags: {
          endpoint: '/api/todos/status/:status',
          method: 'GET',
          phase: 'primary',
          type: 'filter',
          status_value: status,
        },
      });

      check(filterRes, {
        'soak GET /api/todos/status/:status: status 200': (r) => r.status === 200,
        'soak GET /api/todos/status/:status: has data': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Array.isArray(body.data) && typeof body.total === 'number';
          } catch {
            return false;
          }
        },
      });

      sleep(Math.random() * 0.7 + 0.5); // 0.5–1.2s
    });
  }

  // ========================================================================
  // PHASE 4: Query with Parameters (30% - alternative filtering method)
  // ========================================================================
  if (Math.random() < 0.3) {
    group('Session: Query Filter', function () {
      const statuses = ['pending', 'in-progress', 'completed'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const queryRes = http.get(`${baseUrl}/api/todos?status=${status}`, {
        tags: {
          endpoint: '/api/todos',
          method: 'GET',
          phase: 'primary',
          type: 'query-filter',
        },
      });

      check(queryRes, {
        'soak GET /api/todos?status=X: status 200': (r) => r.status === 200,
      });

      sleep(Math.random() * 0.5 + 0.3); // 0.3–0.8s
    });
  }

  // ========================================================================
  // PHASE 5: Generator Info Check (15% - capability awareness)
  // ========================================================================
  if (Math.random() < 0.15) {
    group('Session: Generator Capabilities', function () {
      const infoRes = http.get(`${baseUrl}/api/todos/generate/info`, {
        tags: {
          endpoint: '/api/todos/generate/info',
          method: 'GET',
          phase: 'secondary',
          type: 'info',
        },
      });

      check(infoRes, {
        'soak GET /api/todos/generate/info: status 200': (r) => r.status === 200,
      });

      sleep(Math.random() * 0.4 + 0.2); // 0.2–0.6s
    });
  }

  // ========================================================================
  // PHASE 6: Bulk Generation (10% of requests - heavy write, memory stress)
  // ========================================================================
  if (Math.random() < 0.1) {
    group('Session: Bulk Data Generation', function () {
      const generatePayload = JSON.stringify({
        count: Math.floor(Math.random() * 4) + 1,  // 1–4 items
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
          phase: 'secondary',
          type: 'write',
          operation: 'generation',
        },
      });

      check(genRes, {
        'soak POST /api/todos/generate: status 201': (r) => r.status === 201,
        'soak POST /api/todos/generate: has data': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Array.isArray(body.data);
          } catch {
            return false;
          }
        },
      });

      sleep(Math.random() * 1.2 + 0.8); // 0.8–2.0s (heavier operation)
    });
  }

  // ========================================================================
  // Think time / user pause (realistic session pacing)
  // ========================================================================
  sleep(Math.random() * 0.5 + 0.3); // 0.3–0.8s between logical groups
}

/**
 * Teardown Phase - Analysis and health assessment
 */
export function teardown(data) {
  const elapsedSeconds = (new Date().getTime() - data.startTime) / 1000;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 SOAK TEST COMPLETED`);
  console.log(`${'='.repeat(80)}`);
  console.log(`✅ Test finished at: ${new Date().toISOString()}`);
  console.log(`📍 API tested: ${data.baseUrl}`);
  console.log(`⏱️  Elapsed time: ${elapsedMinutes} minutes ${elapsedSeconds % 60}s`);
  console.log(`${'-'.repeat(80)}`);

  console.log(`\nCRITICAL METRICS TO ANALYZE:\n`);

  console.log(`1️⃣  MEMORY BEHAVIOR (Check server metrics)`);
  console.log(`   ✅ HEALTHY: Memory grows < 20% in first 5 min, then stays flat`);
  console.log(`   ❌ LEAK: Memory continuously increases 20–50MB per hour`);
  console.log(`   ⚠️  WARNING: Memory spikes every 5–10 min (GC issue)\n`);

  console.log(`   Diagnosis:`);
  console.log(`   - Monitor 'node' process: top, htop, or Activity Monitor`);
  console.log(`   - Check heap snapshot: node --inspect, take snapshot at 10m and 30m`);
  console.log(`   - Look for: detached DOM, circular references, event listeners\n`);

  console.log(`2️⃣  LATENCY CREEP (Compare across test duration)`);
  console.log(`   ✅ HEALTHY:`);
  console.log(`      First 10 min:  p95 = 400ms`);
  console.log(`      Mid test:      p95 = 410ms ±50ms`);
  console.log(`      Final 10 min:  p95 = 420ms (stable)`);
  console.log(`   ❌ CREEP: Latency increases steadily`);
  console.log(`      First 10 min:  p95 = 400ms`);
  console.log(`      Mid test:      p95 = 750ms`);
  console.log(`      Final 10 min:  p95 = 1200ms (linear increase)\n`);

  console.log(`   Diagnosis:`);
  console.log(`   - Sorting on unsorted field: Add database index`);
  console.log(`   - Growing list: Implement pagination, caching`);
  console.log(`   - Connection leak: Check connection pool lifecycle\n`);

  console.log(`3️⃣  ERROR ACCUMULATION (Watch error rate over time)`);
  console.log(`   ✅ HEALTHY: Error rate stays < 0.5% throughout`);
  console.log(`   ⚠️  WATCH: Error rate increases from 0% → 2% as time progresses`);
  console.log(`   ❌ FAILURE: Error rate jumps suddenly (connection pool, memory full)\n`);

  console.log(`   Common patterns:`);
  console.log(`   - Periodic spikes (every 5 min): Connection timeout, GC pause`);
  console.log(`   - Gradual increase: Resource leak (connections, file descriptors)`);
  console.log(`   - Sudden spike at end: Out of memory, connection pool exhausted\n`);

  console.log(`4️⃣  THROUGHPUT STABILITY (Requests per second)`);
  console.log(`   ✅ HEALTHY: Throughput constant (e.g., 45 req/sec ±5)`);
  console.log(`   ❌ DEGRADATION: Throughput decreases over time\n`);

  console.log(`${'-'.repeat(80)}`);
  console.log(`INTERPRETING YOUR SOAK TEST RESULTS:\n`);

  console.log(`Result A: All metrics stable, no increase in errors`);
  console.log(`  ✅ API is production-ready for long sessions`);
  console.log(`  ✅ No memory leaks, no latency creep`);
  console.log(`  Action: Deploy with confidence\n`);

  console.log(`Result B: Latency creeps 50% over test duration`);
  console.log(`  ⚠️  Possible causes:`);
  console.log(`     • Database: Unsorted query, missing index`);
  console.log(`     • In-memory: List grows, O(n) operations on every request`);
  console.log(`     • GC: Large object allocations, tuning needed`);
  console.log(`  Action: Profile with flamegraph, identify slow query\n`);

  console.log(`Result C: Memory increases 5+ MB/min`);
  console.log(`  ❌ Memory leak detected`);
  console.log(`  Action: Take heap snapshots, find unreleased objects\n`);

  console.log(`Result D: Errors increase from 0% → 5% after 20 min`);
  console.log(`  ❌ Resource exhaustion`);
  console.log(`  Action: Check connection pool, file descriptors, timeout settings\n`);

  console.log(`${'-'.repeat(80)}`);
  console.log(`NEXT STEPS:\n`);

  console.log(`If HEALTHY (no issues):`);
  console.log(`  1. Schedule weekly soak tests (monitor for regressions)`);
  console.log(`  2. Extend to 2–4 hour soak monthly (catch slow leaks)`);
  console.log(`  3. Document baseline metrics for comparison\n`);

  console.log(`If ISSUES FOUND:`);
  console.log(`  1. Isolate the problem endpoint (disable phases, retry)`);
  console.log(`  2. Run 5–10 min soak targeting only that endpoint`);
  console.log(`  3. Take heap snapshot at start and end`);
  console.log(`  4. Analyze retained objects, detached elements`);
  console.log(`  5. Fix issue, re-run soak to confirm\n`);

  console.log(`${'-'.repeat(80)}`);
  console.log(`RECOMMENDED MONITORING SETUP:\n`);

  console.log(`During soak test, monitor in parallel terminal:`);
  console.log(`  # macOS:`);
  console.log(`  watch 'top -l 1 | grep -E "^(NODE|PhysMem)"'\n`);

  console.log(`  # Linux:`);
  console.log(`  watch -n 1 'ps aux | grep node | grep -v grep'\n`);

  console.log(`  # Windows PowerShell:`);
  console.log(`  while ($true) { Get-Process node | Select Name,@{n="Mem(MB)";e={[math]::Round($_.WS/1MB)}},CPU; Start-Sleep 1 }\n`);

  console.log(`${'='.repeat(80)}\n`);
}
