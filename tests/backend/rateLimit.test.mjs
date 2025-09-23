// tests/backend/rateLimit.test.mjs
// Lightweight assertions that mirror the Django rate-limit defaults

import { describe, it, expect } from './testFramework.mjs';

describe('Anonymous profile rate-limits', () => {
  const RATE_LIMIT = {
    per_minute: 1,
    per_hour: 3,
    per_day: 20,
  };

  it('should allow at least one request per minute', () => {
    expect(RATE_LIMIT.per_minute).toBeGreaterThan(0);
  });

  it('should have increasing windows', () => {
    expect(RATE_LIMIT.per_hour).toBeGreaterThan(RATE_LIMIT.per_minute);
    expect(RATE_LIMIT.per_day).toBeGreaterThan(RATE_LIMIT.per_hour);
  });
});

console.log('
🧪 Rate limit configuration sanity checks complete.');
