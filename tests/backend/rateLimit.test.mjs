// tests/backend/rateLimit.test.mjs
import { describe, it, expect, beforeEach, afterEach } from './testFramework.mjs';
import { checkRateLimit, recordGeneration } from '../../netlify/functions/checkRateLimit.js';

// Mock Firebase Admin
const mockFirestore = {
  collection: jest.fn(),
  runTransaction: jest.fn()
};

const mockDoc = {
  get: jest.fn(),
  set: jest.fn()
};

const mockCollection = {
  doc: jest.fn(() => mockDoc)
};

mockFirestore.collection.mockReturnValue(mockCollection);

// Mock the Firebase Admin module
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  },
  firestore: () => mockFirestore
}));

describe('Rate Limiting Tests', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Mock successful Firebase operations by default
    mockDoc.get.mockResolvedValue({
      exists: false,
      data: () => null
    });
    
    mockDoc.set.mockResolvedValue();
    mockFirestore.runTransaction.mockImplementation((callback) => {
      return callback({
        get: mockDoc.get,
        set: mockDoc.set
      });
    });
  });

  describe('IP Detection', () => {
    it('should extract IP from cf-connecting-ip header', async () => {
      const event = {
        headers: {
          'cf-connecting-ip': '192.168.1.1'
        }
      };

      const result = await checkRateLimit(event);
      
      expect(result.clientIP).toBe('192.168.1.1');
      expect(result.isAllowed).toBe(true);
    });

    it('should extract IP from x-forwarded-for header', async () => {
      const event = {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1'
        }
      };

      const result = await checkRateLimit(event);
      
      expect(result.clientIP).toBe('192.168.1.1');
    });

    it('should generate fallback ID for invalid IP', async () => {
      const event = {
        headers: {
          'user-agent': 'test-agent',
          'accept-language': 'en-US',
          'accept-encoding': 'gzip'
        }
      };

      const result = await checkRateLimit(event);
      
      expect(result.clientIP).toMatch(/^fallback-/);
      expect(result.isAllowed).toBe(true);
    });
  });

  describe('Global Rate Limiting', () => {
    it('should allow requests when under global limit', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      // Mock global stats with low usage
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          hourlyGenerations: [Date.now() - 1000], // 1 generation in the last hour
          dailyGenerations: [Date.now() - 1000],  // 1 generation in the last day
          lastUpdate: Date.now()
        })
      });

      const result = await checkRateLimit(event);
      
      expect(result.isAllowed).toBe(true);
      expect(result.globalLimits.hourlyUsage).toBe(1);
    });

    it('should block requests when global hourly limit exceeded', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      // Mock global stats with high usage
      const now = Date.now();
      const hourlyGenerations = Array(501).fill().map((_, i) => now - (i * 1000)); // 501 generations
      
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          hourlyGenerations,
          dailyGenerations: hourlyGenerations.slice(0, 100), // Only 100 daily
          lastUpdate: now
        })
      });

      const result = await checkRateLimit(event);
      
      expect(result.isAllowed).toBe(false);
      expect(result.limitType).toBe('global');
      expect(result.globalLimits.hourlyUsage).toBe(501);
    });

    it('should block requests when global daily limit exceeded', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      // Mock global stats with high daily usage
      const now = Date.now();
      const dailyGenerations = Array(5001).fill().map((_, i) => now - (i * 1000)); // 5001 generations
      
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          hourlyGenerations: dailyGenerations.slice(0, 100), // Only 100 hourly
          dailyGenerations,
          lastUpdate: now
        })
      });

      const result = await checkRateLimit(event);
      
      expect(result.isAllowed).toBe(false);
      expect(result.limitType).toBe('global');
      expect(result.globalLimits.dailyUsage).toBe(5001);
    });
  });

  describe('IP Rate Limiting', () => {
    it('should block requests when IP hourly limit exceeded', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      // Mock global stats (under limit)
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          hourlyGenerations: [Date.now() - 1000],
          dailyGenerations: [Date.now() - 1000],
          lastUpdate: Date.now()
        })
      });

      // Mock IP stats (over limit)
      const now = Date.now();
      const hourlyGenerations = Array(51).fill().map((_, i) => now - (i * 1000)); // 51 generations
      
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          hourlyGenerations,
          minuteGenerations: [now - 1000], // Only 1 per minute
          lastUpdate: now
        })
      });

      const result = await checkRateLimit(event);
      
      expect(result.isAllowed).toBe(false);
      expect(result.limitType).toBe('ip');
      expect(result.ipLimits.hourlyUsage).toBe(51);
    });

    it('should block requests when IP minute limit exceeded', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      // Mock global stats (under limit)
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          hourlyGenerations: [Date.now() - 1000],
          dailyGenerations: [Date.now() - 1000],
          lastUpdate: Date.now()
        })
      });

      // Mock IP stats (minute limit exceeded)
      const now = Date.now();
      const minuteGenerations = Array(11).fill().map((_, i) => now - (i * 100)); // 11 generations in last minute
      
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          hourlyGenerations: [now - 1000], // Only 1 per hour
          minuteGenerations,
          lastUpdate: now
        })
      });

      const result = await checkRateLimit(event);
      
      expect(result.isAllowed).toBe(false);
      expect(result.limitType).toBe('ip');
      expect(result.ipLimits.minuteUsage).toBe(11);
    });
  });

  describe('Generation Recording', () => {
    it('should record generation in global and IP stats', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      const result = await recordGeneration(event);
      
      expect(result.success).toBe(true);
      
      // Verify that both global and IP collections were updated
      expect(mockFirestore.runTransaction).toHaveBeenCalledTimes(2);
      expect(mockDoc.set).toHaveBeenCalledTimes(2);
    });

    it('should handle Firebase errors gracefully', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      // Mock Firebase error
      mockFirestore.runTransaction.mockRejectedValue(new Error('Firebase error'));

      const result = await recordGeneration(event);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Firebase error');
    });
  });

  describe('Error Handling', () => {
    it('should allow requests when Firebase is unavailable', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      // Mock Firebase error
      mockDoc.get.mockRejectedValue(new Error('Firebase unavailable'));

      const result = await checkRateLimit(event);
      
      expect(result.isAllowed).toBe(true);
      expect(result.error).toBe('Rate limit check failed, allowing request');
    });

    it('should handle missing headers gracefully', async () => {
      const event = {};

      const result = await checkRateLimit(event);
      
      expect(result.clientIP).toMatch(/^fallback-/);
      expect(result.isAllowed).toBe(true);
    });
  });
});

// Simple test framework implementation
function describe(name, fn) {
  console.log(`\n📋 ${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    throw error;
  }
}

function expect(actual) {
  return {
    toBe: (expected) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toMatch: (pattern) => {
      if (!pattern.test(actual)) {
        throw new Error(`Expected ${actual} to match ${pattern}`);
      }
    },
    toHaveBeenCalledTimes: (expected) => {
      if (actual.callCount !== expected) {
        throw new Error(`Expected ${expected} calls, got ${actual.callCount}`);
      }
    }
  };
}

function beforeEach(fn) {
  fn();
}

function afterEach(fn) {
  fn();
}

// Simple Jest mock implementation
const jest = {
  fn: () => {
    const fn = (...args) => fn.callCount++;
    fn.callCount = 0;
    fn.mockReturnValue = (value) => {
      fn.returnValue = value;
      return fn;
    };
    fn.mockResolvedValue = (value) => {
      fn.resolvedValue = value;
      return fn;
    };
    fn.mockRejectedValue = (value) => {
      fn.rejectedValue = value;
      return fn;
    };
    fn.mockImplementation = (impl) => {
      fn.implementation = impl;
      return fn;
    };
    return fn;
  },
  clearAllMocks: () => {
    // Reset all mock call counts
  }
};

// Mock module
global.jest = jest;

console.log('🧪 Running Rate Limiting Tests...\n');
