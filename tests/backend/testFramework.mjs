// tests/backend/testFramework.mjs
// Simple test framework for backend tests

const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

export function describe(name, fn) {
  console.log(`\n📋 ${name}`);
  fn();
}

export function it(name, fn) {
  try {
    fn();
    testResults.passed++;
    testResults.tests.push({ name, status: 'passed' });
    console.log(`  ✅ ${name}`);
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name, status: 'failed', error: error.message });
    console.log(`  ❌ ${name}: ${error.message}`);
  }
}

export function expect(actual) {
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
    },
    toBeGreaterThan: (expected) => {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan: (expected) => {
      if (actual >= expected) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toBeLessThanOrEqual: (expected) => {
      if (actual > expected) {
        throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
      }
    },
    toBeGreaterThanOrEqual: (expected) => {
      if (actual < expected) {
        throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
      }
    },
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined, got undefined`);
      }
    },
    not: {
      toBe: (expected) => {
        if (actual === expected) {
          throw new Error(`Expected ${actual} not to be ${expected}`);
        }
      }
    }
  };
}

export function beforeEach(fn) {
  fn();
}

export function afterEach(fn) {
  fn();
}

// Simple Jest mock implementation
const jest = {
  fn: () => {
    const fn = (...args) => {
      fn.callCount++;
      if (fn.returnValue !== undefined) {
        return fn.returnValue;
      }
      if (fn.implementation) {
        return fn.implementation(...args);
      }
    };
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

export { jest };

// Print summary at the end
process.on('exit', () => {
  console.log(`\n📊 Test Summary:`);
  console.log(`  ✅ Passed: ${testResults.passed}`);
  console.log(`  ❌ Failed: ${testResults.failed}`);
  console.log(`  📈 Total: ${testResults.passed + testResults.failed}`);

  if (testResults.failed > 0) {
    console.log(`\n❌ Failed Tests:`);
    testResults.tests
      .filter(test => test.status === 'failed')
      .forEach(test => {
        console.log(`  - ${test.name}: ${test.error}`);
      });
    process.exit(1);
  } else {
    console.log(`\n🎉 All tests passed!`);
  }
});
