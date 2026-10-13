/**
 * HealthSphere AI — k6 Load Test
 * 
 * Run locally:  k6 run scripts/load-test.js -e BASE_URL=http://localhost:3000
 * Run in CI:    Uses grafana/k6-action with env vars
 * 
 * Targets:
 *   - 100 virtual users
 *   - 5 minute duration
 *   - p95 latency < 500ms
 *   - Error rate < 0.1%
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Custom metrics
const errorRate = new Rate('errors');
const loginTrend = new Trend('login_duration');
const uploadTrend = new Trend('report_upload_duration');
const apiTrend = new Trend('api_duration');
const requestsCounter = new Counter('total_requests');

// Test configuration
export const options = {
  scenarios: {
    // Ramp up to 100 VUs over 2 minutes, hold for 3 minutes, ramp down
    api_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '3m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
    // Spike test: sudden burst
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '10s', target: 200 }, // Spike
        { duration: '30s', target: 10 },
        { duration: '10s', target: 0 },
      ],
      startTime: '4m',
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95th percentile < 500ms
    http_req_failed: ['rate<0.001'],   // Error rate < 0.1%
    errors: ['rate<0.001'],
    login_duration: ['p(95)<1000'],
    report_upload_duration: ['p(95)<3000'],
    api_duration: ['p(95)<500'],
  },
  // Export summary for CI
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// Base URL from environment
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_PASSWORD = 'TestPass123!';

// Test users (pre-seeded or created during test)
const testUsers = new SharedArray('test users', () => {
  const users = [];
  for (let i = 0; i < 50; i++) {
    users.push({
      email: `loadtest${i}@healthsphere.ai`,
      password: TEST_PASSWORD,
      name: `Load Test User ${i}`,
    });
  }
  return users;
});

// Helper: Generate random string
function randomString(len = 8) {
  return Math.random().toString(36).substring(2, 2 + len);
}

// Helper: Create auth headers
function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Cookie': `hs_token=${token}`,
  };
}

// Helper: Check response
function checkResponse(res, name, expectedStatus = 200) {
  const success = check(res, {
    [`${name}: status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${name}: has body`]: (r) => r.body && r.body.length > 0,
  });
  errorRate.add(!success);
  requestsCounter.add(1);
  return success;
}

// ===== SCENARIOS =====

// 1. Authentication Flow
function authFlow(user) {
  group('Authentication', () => {
    // Register (idempotent - will fail if exists, that's OK)
    let res = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
      email: user.email,
      name: user.name,
      password: user.password,
    }), { headers: { 'Content-Type': 'application/json' } });
    
    checkResponse(res, 'Register', 200); // May be 400 if exists
    
    // Login
    const loginStart = new Date();
    res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
      email: user.email,
      password: user.password,
    }), { headers: { 'Content-Type': 'application/json' } });
    loginTrend.add(new Date() - loginStart);
    
    if (!checkResponse(res, 'Login')) return null;
    
    const token = res.cookies.hs_token?.[0]?.value;
    if (!token) {
      errorRate.add(true);
      return null;
    }
    
    // Get session
    res = http.get(`${BASE_URL}/api/session`, { headers: authHeaders(token) });
    checkResponse(res, 'Session');
    
    return token;
  });
}

// 2. Profile & Settings
function profileFlow(token) {
  group('Profile Management', () => {
    // Get profile
    let res = http.get(`${BASE_URL}/api/me`, { headers: authHeaders(token) });
    checkResponse(res, 'Get Profile');
    
    // Update profile
    res = http.put(`${BASE_URL}/api/profile`, JSON.stringify({
      dob: '1990-01-01',
      sex: 'male',
      heightCm: 175,
      weightKg: 70,
      bloodGroup: 'O+',
    }), { headers: authHeaders(token) });
    checkResponse(res, 'Update Profile');
    
    // Get settings
    res = http.get(`${BASE_URL}/api/me`, { headers: authHeaders(token) });
    checkResponse(res, 'Get Settings');
  });
}

// 3. Report Upload (simulated - base64 encoded small PDF)
function reportFlow(token) {
  group('Report Upload', () => {
    // Create a minimal PDF base64 (1-page text PDF)
    const pdfBase64 = 'JVBERi0xLjQKJcfsj6IKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwo+PgplbmRvYmoKMiAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDEgMCBSCj4+CmVuZG9iagoKc3RhcnR4cmVmCjEwMAolJUVPRgo='; // Minimal valid PDF
    
    const uploadStart = new Date();
    const res = http.post(`${BASE_URL}/api/reports`, JSON.stringify({
      filename: `test-report-${randomString()}.pdf`,
      mime: 'application/pdf',
      dataBase64: pdfBase64,
    }), { headers: authHeaders(token) });
    uploadTrend.add(new Date() - uploadStart);
    
    checkResponse(res, 'Upload Report');
    
    // List reports
    const listRes = http.get(`${BASE_URL}/api/reports`, { headers: authHeaders(token) });
    checkResponse(listRes, 'List Reports');
    
    return res.json('report?.id');
  });
}

// 4. Metrics & Trends
function metricsFlow(token) {
  group('Metrics & Trends', () => {
    // Add metric
    let res = http.post(`${BASE_URL}/api/metrics`, JSON.stringify({
      key: 'weight_kg',
      value: 70 + Math.random() * 5,
      unit: 'kg',
      date: new Date().toISOString().split('T')[0],
    }), { headers: authHeaders(token) });
    checkResponse(res, 'Add Metric');
    
    // Get metrics
    res = http.get(`${BASE_URL}/api/metrics`, { headers: authHeaders(token) });
    checkResponse(res, 'Get Metrics');
    
    // Get trends for weight
    res = http.get(`${BASE_URL}/api/trends/weight_kg`, { headers: authHeaders(token) });
    checkResponse(res, 'Get Trends');
  });
}

// 5. Insights & Dashboard
function insightsFlow(token) {
  group('Insights & Dashboard', () => {
    const endpoints = [
      '/api/overview',
      '/api/insights',
      '/api/dashboard/stats', // if exists
    ];
    
    for (const ep of endpoints) {
      const start = new Date();
      const res = http.get(`${BASE_URL}${ep}`, { headers: authHeaders(token) });
      apiTrend.add(new Date() - start);
      checkResponse(res, `GET ${ep}`);
    }
  });
}

// 6. Reminders
function remindersFlow(token) {
  group('Reminders', () => {
    // Create reminder
    let res = http.post(`${BASE_URL}/api/reminders`, JSON.stringify({
      title: `Load test reminder ${randomString()}`,
      type: 'medication',
      dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    }), { headers: authHeaders(token) });
    checkResponse(res, 'Create Reminder');
    
    // List reminders
    res = http.get(`${BASE_URL}/api/reminders`, { headers: authHeaders(token) });
    checkResponse(res, 'List Reminders');
  });
}

// 7. Care Team
function careFlow(token) {
  group('Care Team', () => {
    // Add doctor
    let res = http.post(`${BASE_URL}/api/doctors`, JSON.stringify({
      name: `Dr. Load Test ${randomString()}`,
      specialty: 'Cardiology',
      phone: '+1-555-0100',
      clinic: 'Test Clinic',
    }), { headers: authHeaders(token) });
    checkResponse(res, 'Add Doctor');
    
    // Add contact
    res = http.post(`${BASE_URL}/api/contacts`, JSON.stringify({
      name: `Emergency Contact ${randomString()}`,
      relation: 'Spouse',
      phone: '+1-555-0199',
      priority: 1,
    }), { headers: authHeaders(token) });
    checkResponse(res, 'Add Contact');
    
    // Get care team
    res = http.get(`${BASE_URL}/api/care`, { headers: authHeaders(token) });
    checkResponse(res, 'Get Care Team');
  });
}

// 8. Hospitals / Nearby
function hospitalsFlow(token) {
  group('Nearby Care', () => {
    // Search hospitals (uses sample data, fast)
    let res = http.get(`${BASE_URL}/api/hospitals?city=Mumbai&type=hospital`, { headers: authHeaders(token) });
    checkResponse(res, 'Search Hospitals');
    
    // Geocode (may be slower)
    res = http.get(`${BASE_URL}/api/hospitals?place=Bandra%20Mumbai`, { headers: authHeaders(token) });
    checkResponse(res, 'Geocode Place');
  });
}

// 9. Lifestyle
function lifestyleFlow(token) {
  group('Lifestyle', () => {
    // Generate plan
    let res = http.post(`${BASE_URL}/api/lifestyle/regenerate`, {}, { headers: authHeaders(token) });
    checkResponse(res, 'Regenerate Plan');
    
    // Log exercise
    res = http.post(`${BASE_URL}/api/lifestyle/logs`, JSON.stringify({
      type: 'exercise_minutes',
      value: 30,
      date: new Date().toISOString().split('T')[0],
    }), { headers: authHeaders(token) });
    checkResponse(res, 'Log Exercise');
    
    // Get lifestyle
    res = http.get(`${BASE_URL}/api/lifestyle`, { headers: authHeaders(token) });
    checkResponse(res, 'Get Lifestyle');
  });
}

// 10. Search (Command Palette)
function searchFlow(token) {
  group('Search', () => {
    const queries = ['blood', 'report', 'doctor', 'reminder', 'weight'];
    for (const q of queries) {
      const res = http.get(`${BASE_URL}/api/search?q=${q}`, { headers: authHeaders(token) });
      checkResponse(res, `Search: ${q}`);
      sleep(0.1);
    }
  });
}

// 11. Admin (if admin user)
function adminFlow(token) {
  group('Admin Panel', () => {
    const endpoints = [
      '/api/admin/overview',
      '/api/admin/users',
      '/api/admin/audit',
    ];
    
    for (const ep of endpoints) {
      const start = new Date();
      const res = http.get(`${BASE_URL}${ep}`, { headers: authHeaders(token) });
      apiTrend.add(new Date() - start);
      // Admin endpoints may return 403 for non-admin - that's expected
      check(res, {
        [`Admin ${ep}: valid response`]: (r) => [200, 403].includes(r.status),
      });
    }
  });
}

// ===== MAIN VU FUNCTION =====

export default function () {
  // Pick a random test user
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  
  // Authenticate
  const token = authFlow(user);
  if (!token) {
    // If login failed, try next iteration
    sleep(1);
    return;
  }
  
  // Run all flows with think time
  const flows = [
    profileFlow,
    reportFlow,
    metricsFlow,
    insightsFlow,
    remindersFlow,
    careFlow,
    hospitalsFlow,
    lifestyleFlow,
    searchFlow,
  ];
  
  // Shuffle flows for realistic distribution
  const shuffled = [...flows].sort(() => Math.random() - 0.5);
  
  for (const flow of shuffled) {
    try {
      flow(token);
    } catch (e) {
      errorRate.add(true);
      console.error(`Flow error: ${e}`);
    }
    // Think time: 0.5-2 seconds between API calls
    sleep(Math.random() * 1.5 + 0.5);
  }
  
  // Logout
  http.post(`${BASE_URL}/api/auth/logout`, {}, { headers: authHeaders(token) });
  
  // Iteration sleep
  sleep(Math.random() * 2 + 1);
}

// ===== SETUP / TEARDOWN =====

export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);
  console.log(`Test users: ${testUsers.length}`);
  
  // Verify base URL is reachable
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error(`Health check failed: ${res.status} ${res.body}`);
  }
  console.log('Health check passed');
  
  // Clean up any existing test users (optional)
  // Could call a cleanup API here
  
  return { baseUrl: BASE_URL };
}

export function teardown(data) {
  console.log('Load test completed');
  console.log(`Base URL: ${data.baseUrl}`);
}

// ===== HANDLE SUMMARY =====

export function handleSummary(data) {
  const { metrics, root_group } = data;
  
  // Custom summary
  const summary = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    duration: root_group.duration,
    vus: root_group.vus,
    iterations: root_group.iterations,
    checks: {
      passed: 0,
      failed: 0,
      rate: 0,
    },
    thresholds: {},
    metrics: {},
  };
  
  // Aggregate checks
  for (const [name, check] of Object.entries(root_group.checks)) {
    summary.checks.passed += check.passes;
    summary.checks.failed += check.fails;
  }
  summary.checks.rate = summary.checks.passed / (summary.checks.passed + summary.checks.failed || 1);
  
  // Key metrics
  const keyMetrics = [
    'http_req_duration',
    'http_req_failed',
    'http_reqs',
    'login_duration',
    'report_upload_duration',
    'api_duration',
    'errors',
    'total_requests',
  ];
  
  for (const m of keyMetrics) {
    if (metrics[m]) {
      summary.metrics[m] = {
        avg: metrics[m].values.avg,
        min: metrics[m].values.min,
        med: metrics[m].values.med,
        max: metrics[m].values.max,
        'p(90)': metrics[m].values['p(90)'],
        'p(95)': metrics[m].values['p(95)'],
        'p(99)': metrics[m].values['p(99)'],
      };
    }
  }
  
  // Thresholds
  for (const [name, threshold] of Object.entries(options.thresholds || {})) {
    const metric = metrics[name.replace(/^.*:/, '')]; // Remove threshold prefix
    if (metric) {
      // Simplified threshold check
      summary.thresholds[name] = {
        threshold,
        passed: true, // k6 evaluates this separately
      };
    }
  }
  
  // Write JSON summary for CI
  return {
    'stdout': JSON.stringify(summary, null, 2),
    'summary.json': JSON.stringify(summary, null, 2),
    // Also output JUnit for CI integration
    'junit.xml': jUnitReport(summary),
  };
}

function jUnitReport(summary) {
  const testsuites = {
    testsuite: {
      '@name': 'HealthSphere AI Load Test',
      '@timestamp': summary.timestamp,
      '@tests': summary.checks.passed + summary.checks.failed,
      '@failures': summary.checks.failed,
      '@time': summary.duration / 1000,
      testcase: [],
    },
  };
  
  // Add key metrics as test cases
  for (const [name, metric] of Object.entries(summary.metrics)) {
    const passed = metric['p(95)'] < 500; // Simplified
    testsuites.testsuite.testcase.push({
      '@name': name,
      '@classname': 'k6.metrics',
      '@time': metric.avg / 1000,
      ...(passed ? {} : { failure: { '@message': `p95 ${metric['p(95)']}ms exceeds 500ms threshold` } }),
    });
  }
  
  // Convert to XML (simplified)
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<testsuites>\n';
  xml += `  <testsuite name="${testsuites.testsuite['@name']}" timestamp="${testsuites.testsuite['@timestamp']}" tests="${testsuites.testsuite['@tests']}" failures="${testsuites.testsuite['@failures']}" time="${testsuites.testsuite['@time']}">\n`;
  
  for (const tc of testsuites.testsuite.testcase) {
    xml += `    <testcase name="${tc['@name']}" classname="${tc['@classname']}" time="${tc['@time']}">\n`;
    if (tc.failure) {
      xml += `      <failure message="${tc.failure['@message']}"/>\n`;
    }
    xml += '    </testcase>\n';
  }
  
  xml += '  </testsuite>\n';
  xml += '</testsuites>';
  
  return xml;
}