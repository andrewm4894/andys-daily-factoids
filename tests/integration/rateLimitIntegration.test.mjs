// tests/integration/rateLimitIntegration.test.mjs
// Integration tests that call the Django rate-limit status endpoint

import dotenv from 'dotenv';
import { describe, it, expect } from '../backend/testFramework.mjs';

dotenv.config({ path: './frontend/.env' });

function sanitizeBase(base) {
  return base.replace(/\/$/, '');
}

const FACTOIDS_API_BASE = sanitizeBase(
  process.env.FACTOIDS_API_BASE || 'https://factoids-backend.onrender.com/api/factoids'
);
const FACTOIDS_API_KEY = process.env.FACTOIDS_API_KEY;
const RATE_LIMIT_URL = `${FACTOIDS_API_BASE}/limits/`;

async function callRateLimitEndpoint() {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (FACTOIDS_API_KEY) {
    headers['x-api-key'] = FACTOIDS_API_KEY;
  }

  const response = await fetch(RATE_LIMIT_URL, { method: 'GET', headers });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

describe('Rate Limit Integration Tests', () => {
  it('should return the expected shape', async () => {
    const result = await callRateLimitEndpoint();

    expect(result).toBeDefined();
    expect(result.profile).toBeDefined();
    expect(result.rate_limit).toBeDefined();
    expect(typeof result.rate_limit.per_minute).toBe('number');
    expect(result.rate_limit.current_window_requests).toBeDefined();
  });

  it('should provide cost budget information', async () => {
    const result = await callRateLimitEndpoint();

    expect(result.cost_budget_remaining).toBeDefined();
  });

  it('should respond consistently across multiple calls', async () => {
    const first = await callRateLimitEndpoint();
    const second = await callRateLimitEndpoint();

    expect(first.profile).toBe(second.profile);
    expect(second.rate_limit.current_window_requests).toBeGreaterThanOrEqual(
      first.rate_limit.current_window_requests
    );
  });
});

console.log('🔗 Running Django Rate Limit Integration Tests...');
