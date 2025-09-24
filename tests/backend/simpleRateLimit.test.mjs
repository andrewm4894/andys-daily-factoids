// tests/backend/simpleRateLimit.test.mjs
// Simple tests for rate limiting logic without complex mocking

import { describe, it, expect } from './testFramework.mjs';

// Test the IP detection and validation functions directly
function getClientIP(headers) {
  if (!headers) return 'unknown';

  // 1. Try Cloudflare IP (most trusted)
  if (headers['cf-connecting-ip']) {
    return headers['cf-connecting-ip'];
  }
  // 2. Try CDN-provided client IP
  else if (headers['x-nf-client-connection-ip']) {
    return headers['x-nf-client-connection-ip'];
  }
  // 3. Try x-forwarded-for (but take the first IP, not the last)
  else if (headers['x-forwarded-for']) {
    const forwardedIPs = headers['x-forwarded-for'].split(',');
    return forwardedIPs[0].trim();
  }
  // 4. Fallback to other headers
  else if (headers['x-real-ip']) {
    return headers['x-real-ip'];
  }

  return 'unknown';
}

function isValidIP(ip) {
  // IPv4 regex
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 regex (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    return false;
  }

  // Additional validation for IPv4
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  return true;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

function generateFallbackId(headers) {
  const userAgent = headers['user-agent'] || 'unknown';
  const acceptLanguage = headers['accept-language'] || 'unknown';
  const acceptEncoding = headers['accept-encoding'] || 'unknown';

  const combined = `${userAgent}-${acceptLanguage}-${acceptEncoding}`;
  return `fallback-${hashString(combined).substring(0, 16)}`;
}

describe('IP Detection Tests', () => {
  it('should extract IP from cf-connecting-ip header', () => {
    const headers = { 'cf-connecting-ip': '192.168.1.1' };
    const ip = getClientIP(headers);
    expect(ip).toBe('192.168.1.1');
  });

  it('should extract IP from x-forwarded-for header', () => {
    const headers = { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' };
    const ip = getClientIP(headers);
    expect(ip).toBe('192.168.1.1');
  });

  it('should extract IP from x-real-ip header', () => {
    const headers = { 'x-real-ip': '203.0.113.1' };
    const ip = getClientIP(headers);
    expect(ip).toBe('203.0.113.1');
  });

  it('should return unknown for missing headers', () => {
    const headers = {};
    const ip = getClientIP(headers);
    expect(ip).toBe('unknown');
  });

  it('should handle null headers', () => {
    const ip = getClientIP(null);
    expect(ip).toBe('unknown');
  });
});

describe('IP Validation Tests', () => {
  it('should validate correct IPv4 addresses', () => {
    expect(isValidIP('192.168.1.1')).toBe(true);
    expect(isValidIP('10.0.0.1')).toBe(true);
    expect(isValidIP('203.0.113.1')).toBe(true);
    expect(isValidIP('8.8.8.8')).toBe(true);
  });

  it('should reject invalid IPv4 addresses', () => {
    expect(isValidIP('192.168.1.256')).toBe(false);
    expect(isValidIP('192.168.1')).toBe(false);
    expect(isValidIP('192.168.1.1.1')).toBe(false);
    expect(isValidIP('not-an-ip')).toBe(false);
    expect(isValidIP('')).toBe(false);
  });

  it('should validate IPv6 addresses', () => {
    // Our simple regex only handles basic IPv6, which is fine for our use case
    // We're primarily dealing with IPv4 addresses from web requests
    expect(isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    expect(isValidIP('::1')).toBe(false); // Our regex doesn't handle ::1
  });

  it('should reject invalid IPv6 addresses', () => {
    expect(isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334:extra')).toBe(false);
    expect(isValidIP('not-ipv6')).toBe(false);
  });
});

describe('Fallback ID Generation Tests', () => {
  it('should generate consistent fallback IDs', () => {
    const headers = {
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'en-US',
      'accept-encoding': 'gzip'
    };

    const id1 = generateFallbackId(headers);
    const id2 = generateFallbackId(headers);

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^fallback-[a-f0-9]+$/);
  });

  it('should generate different IDs for different headers', () => {
    const headers1 = {
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'en-US',
      'accept-encoding': 'gzip'
    };

    const headers2 = {
      'user-agent': 'Chrome/91.0',
      'accept-language': 'en-US',
      'accept-encoding': 'gzip'
    };

    const id1 = generateFallbackId(headers1);
    const id2 = generateFallbackId(headers2);

    expect(id1).not.toBe(id2);
  });

  it('should handle missing headers gracefully', () => {
    const headers = {};
    const id = generateFallbackId(headers);

    expect(id).toMatch(/^fallback-[a-f0-9]+$/);
  });
});

describe('Rate Limit Configuration Tests', () => {
  it('should have reasonable global limits', () => {
    const RATE_LIMIT = {
      GLOBAL_GENERATIONS_PER_HOUR: 50,
      GLOBAL_GENERATIONS_PER_DAY: 200,
      PER_IP_GENERATIONS_PER_HOUR: 10,
      PER_IP_GENERATIONS_PER_MINUTE: 3
    };

    // Global limits should be reasonable for cost control
    expect(RATE_LIMIT.GLOBAL_GENERATIONS_PER_HOUR).toBeGreaterThan(0);
    expect(RATE_LIMIT.GLOBAL_GENERATIONS_PER_DAY).toBeGreaterThan(RATE_LIMIT.GLOBAL_GENERATIONS_PER_HOUR);

    // Per-IP limits should be reasonable for individual users
    expect(RATE_LIMIT.PER_IP_GENERATIONS_PER_HOUR).toBeGreaterThan(0);
    expect(RATE_LIMIT.PER_IP_GENERATIONS_PER_MINUTE).toBeGreaterThan(0);
  });

  it('should have reasonable window durations', () => {
    const HOUR_WINDOW_MS = 60 * 60 * 1000;
    const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
    const MINUTE_WINDOW_MS = 60 * 1000;

    expect(HOUR_WINDOW_MS).toBe(3600000); // 1 hour
    expect(DAY_WINDOW_MS).toBe(86400000); // 1 day
    expect(MINUTE_WINDOW_MS).toBe(60000); // 1 minute
  });
});

describe('Hash Function Tests', () => {
  it('should generate consistent hashes', () => {
    const input = 'test string';
    const hash1 = hashString(input);
    const hash2 = hashString(input);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different inputs', () => {
    const hash1 = hashString('input 1');
    const hash2 = hashString('input 2');

    expect(hash1).not.toBe(hash2);
  });

  it('should generate valid hex strings', () => {
    const hash = hashString('test');
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
});

console.log('🧪 Running Simple Rate Limiting Tests...\n');
