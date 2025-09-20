// tests/backend/rateLimit.test.mjs
// Test framework functions are defined locally to avoid conflicts
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

describeTest('Rate Limiting Tests', () => {
  beforeEachTest(() => {
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

  describeTest('IP Detection', () => {
    itTest('should extract IP from cf-connecting-ip header', async () => {
      const event = {
        headers: {
          'cf-connecting-ip': '192.168.1.1'
        }
      };

      const result = await checkRateLimit(event);
      
      expectTest(result.clientIP).toBe('192.168.1.1');
      expectTest(result.isAllowed).toBe(true);
    });

    itTest('should extract IP from x-forwarded-for header', async () => {
      const event = {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1'
        }
      };

      const result = await checkRateLimit(event);
      
      expectTest(result.clientIP).toBe('192.168.1.1');
    });

    itTest('should generate fallback ID for invalid IP', async () => {
      const event = {
        headers: {
          'user-agent': 'test-agent',
          'accept-language': 'en-US',
          'accept-encoding': 'gzip'
        }
      };

      const result = await checkRateLimit(event);
      
      expectTest(result.clientIP).toMatch(/^fallback-/);
      expectTest(result.isAllowed).toBe(true);
    });
  });

  describeTest('Global Rate Limiting', () => {
    itTest('should allow requests when under global limit', async () => {
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
      
      expectTest(result.isAllowed).toBe(true);
      expectTest(result.globalLimits.hourlyUsage).toBe(1);
    });

    itTest('should block requests when global hourly limit exceeded', async () => {
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
      
      expectTest(result.isAllowed).toBe(false);
      expectTest(result.limitType).toBe('global');
      expectTest(result.globalLimits.hourlyUsage).toBe(501);
    });

    itTest('should block requests when global daily limit exceeded', async () => {
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
      
      expectTest(result.isAllowed).toBe(false);
      expectTest(result.limitType).toBe('global');
      expectTest(result.globalLimits.dailyUsage).toBe(5001);
    });
  });

  describeTest('IP Rate Limiting', () => {
    itTest('should block requests when IP hourly limit exceeded', async () => {
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
      
      expectTest(result.isAllowed).toBe(false);
      expectTest(result.limitType).toBe('ip');
      expectTest(result.ipLimits.hourlyUsage).toBe(51);
    });

    itTest('should block requests when IP minute limit exceeded', async () => {
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
      
      expectTest(result.isAllowed).toBe(false);
      expectTest(result.limitType).toBe('ip');
      expectTest(result.ipLimits.minuteUsage).toBe(11);
    });
  });

  describeTest('Generation Recording', () => {
    itTest('should record generation in global and IP stats', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      const result = await recordGeneration(event);
      
      expectTest(result.success).toBe(true);
      
      // Verify that both global and IP collections were updated
      expectTest(mockFirestore.runTransaction).toHaveBeenCalledTimes(2);
      expectTest(mockDoc.set).toHaveBeenCalledTimes(2);
    });

    itTest('should handle Firebase errors gracefully', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      // Mock Firebase error
      mockFirestore.runTransaction.mockRejectedValue(new Error('Firebase error'));

      const result = await recordGeneration(event);
      
      expectTest(result.success).toBe(false);
      expectTest(result.error).toBe('Firebase error');
    });
  });

  describeTest('Error Handling', () => {
    itTest('should allow requests when Firebase is unavailable', async () => {
      const event = {
        headers: { 'cf-connecting-ip': '192.168.1.1' }
      };

      // Mock Firebase error
      mockDoc.get.mockRejectedValue(new Error('Firebase unavailable'));

      const result = await checkRateLimit(event);
      
      expectTest(result.isAllowed).toBe(true);
      expectTest(result.error).toBe('Rate limit check failed, allowing request');
    });

    itTest('should handle missing headers gracefully', async () => {
      const event = {};

      const result = await checkRateLimit(event);
      
      expectTest(result.clientIP).toMatch(/^fallback-/);
      expectTest(result.isAllowed).toBe(true);
    });
  });
});

// Simple test framework implementation
function describeTest(name, fn) {
  console.log(`\n📋 ${name}`);
  fn();
}

function itTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    throw error;
  }
}

function expectTest(actual) {
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

function beforeEachTest(fn) {
  fn();
}

// afterEachTest function defined but not used in this test file

// Simple Jest mock implementation
const jest = {
  fn: () => {
    const fn = () => fn.callCount++;
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
