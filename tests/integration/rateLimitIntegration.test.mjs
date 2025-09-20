// tests/integration/rateLimitIntegration.test.mjs
// Integration tests that actually call the rate limiting endpoint

import dotenv from 'dotenv';
import { describe, it, expect } from '../backend/testFramework.mjs';

dotenv.config({ path: './frontend/.env' });

const NETLIFY_FUNCTION_URL = process.env.NETLIFY_FUNCTION_URL || "https://andys-daily-factoids.com/.netlify/functions/checkRateLimit";
const FUNCTIONS_API_KEY = process.env.FUNCTIONS_API_KEY;

async function callRateLimitEndpoint() {
  if (!NETLIFY_FUNCTION_URL || !FUNCTIONS_API_KEY) {
    throw new Error("Missing NETLIFY_FUNCTION_URL or FUNCTIONS_API_KEY in environment variables");
  }

  const response = await fetch(NETLIFY_FUNCTION_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': FUNCTIONS_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

describe('Rate Limit Integration Tests', () => {
  it('should successfully call the rate limit endpoint', async () => {
    const result = await callRateLimitEndpoint();
    
    expect(result).toBeDefined();
    expect(typeof result.isAllowed).toBe('boolean');
    expect(typeof result.clientIP).toBe('string');
  });

  it('should return proper rate limit structure', async () => {
    const result = await callRateLimitEndpoint();
    
    // Check if global limits are present
    if (result.globalLimits) {
      expect(typeof result.globalLimits.hourlyUsage).toBe('number');
      expect(typeof result.globalLimits.dailyUsage).toBe('number');
      expect(typeof result.globalLimits.hourlyLimit).toBe('number');
      expect(typeof result.globalLimits.dailyLimit).toBe('number');
    }

    // Check if IP limits are present
    if (result.ipLimits) {
      expect(typeof result.ipLimits.hourlyUsage).toBe('number');
      expect(typeof result.ipLimits.minuteUsage).toBe('number');
      expect(typeof result.ipLimits.hourlyLimit).toBe('number');
      expect(typeof result.ipLimits.minuteLimit).toBe('number');
    }
  });

  it('should have reasonable rate limit values', async () => {
    const result = await callRateLimitEndpoint();
    
    if (result.globalLimits) {
      // Global limits should be reasonable for cost control
      expect(result.globalLimits.hourlyLimit).toBeGreaterThan(0);
      expect(result.globalLimits.dailyLimit).toBeGreaterThan(result.globalLimits.hourlyLimit);
      
      // Usage should not exceed limits
      expect(result.globalLimits.hourlyUsage).toBeLessThanOrEqual(result.globalLimits.hourlyLimit);
      expect(result.globalLimits.dailyUsage).toBeLessThanOrEqual(result.globalLimits.dailyLimit);
    }

    if (result.ipLimits) {
      // IP limits should be reasonable
      expect(result.ipLimits.hourlyLimit).toBeGreaterThan(0);
      expect(result.ipLimits.minuteLimit).toBeGreaterThan(0);
      
      // Usage should not exceed limits
      expect(result.ipLimits.hourlyUsage).toBeLessThanOrEqual(result.ipLimits.hourlyLimit);
      expect(result.ipLimits.minuteUsage).toBeLessThanOrEqual(result.ipLimits.minuteLimit);
    }
  });

  it('should return valid IP address or fallback', async () => {
    const result = await callRateLimitEndpoint();
    
    expect(result.clientIP).toBeDefined();
    expect(result.clientIP.length).toBeGreaterThan(0);
    
    // Should be either a valid IP or a fallback ID
    const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(result.clientIP);
    const isFallback = /^fallback-[a-f0-9]{16}$/.test(result.clientIP);
    
    expect(isIP || isFallback).toBe(true);
  });

  it('should handle multiple requests consistently', async () => {
    const results = [];
    
    // Make multiple requests
    for (let i = 0; i < 3; i++) {
      const result = await callRateLimitEndpoint();
      results.push(result);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // All requests should succeed
    results.forEach((result, index) => {
      expect(result).toBeDefined();
      expect(typeof result.isAllowed).toBe('boolean');
    });
    
    // Usage should be consistent or increasing (not decreasing)
    if (results[0].globalLimits && results[1].globalLimits) {
      expect(results[1].globalLimits.hourlyUsage).toBeGreaterThanOrEqual(results[0].globalLimits.hourlyUsage);
    }
  });
});

console.log('🔗 Running Rate Limit Integration Tests...\n');
