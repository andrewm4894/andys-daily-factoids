// tests/frontend/useRateLimit.test.js
import { renderHook, act } from '@testing-library/react';
import { useRateLimit } from '../hooks/useRateLimit';

// Mock fetch
global.fetch = jest.fn();

describe('useRateLimit Hook', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useRateLimit('http://localhost:3000'));
    
    expect(result.current.rateLimitInfo.isLoading).toBe(true);
    expect(result.current.rateLimitInfo.globalLimits.hourlyUsage).toBe(0);
  });

  it('should fetch rate limit status on mount', async () => {
    const mockResponse = {
      isAllowed: true,
      globalLimits: {
        hourlyUsage: 5,
        dailyUsage: 20,
        hourlyLimit: 50,
        dailyLimit: 200
      },
      ipLimits: {
        hourlyUsage: 2,
        minuteUsage: 1,
        hourlyLimit: 10,
        minuteLimit: 3
      },
      limitType: null
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useRateLimit('http://localhost:3000'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/.netlify/functions/checkRateLimit',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(result.current.rateLimitInfo.isLoading).toBe(false);
    expect(result.current.rateLimitInfo.globalLimits.hourlyUsage).toBe(10);
    expect(result.current.canGenerateMore()).toBe(true);
  });

  it('should handle global rate limit exceeded', async () => {
    const mockResponse = {
      isAllowed: false,
      limitType: 'global',
      globalLimits: {
        hourlyUsage: 50,
        dailyUsage: 100,
        hourlyLimit: 50,
        dailyLimit: 200
      }
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useRateLimit('http://localhost:3000'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.canGenerateMore()).toBe(false);
    expect(result.current.getStatusMessage()).toContain('Global rate limit reached');
  });

  it('should handle IP rate limit exceeded', async () => {
    const mockResponse = {
      isAllowed: false,
      limitType: 'ip',
      ipLimits: {
        hourlyUsage: 10,
        minuteUsage: 3,
        hourlyLimit: 10,
        minuteLimit: 3
      }
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useRateLimit('http://localhost:3000'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.canGenerateMore()).toBe(false);
    expect(result.current.getStatusMessage()).toContain('IP rate limit reached');
  });

  it('should update from generation response', () => {
    const { result } = renderHook(() => useRateLimit('http://localhost:3000'));

    const mockGenerationResponse = {
      rateLimitInfo: {
        globalLimits: {
          hourlyUsage: 5,
          dailyUsage: 20,
          hourlyLimit: 50,
          dailyLimit: 200
        },
        ipLimits: {
          hourlyUsage: 2,
          minuteUsage: 1,
          hourlyLimit: 10,
          minuteLimit: 3
        },
        limitType: null
      }
    };

    act(() => {
      result.current.updateFromGenerationResponse(mockGenerationResponse);
    });

    expect(result.current.rateLimitInfo.globalLimits.hourlyUsage).toBe(25);
    expect(result.current.rateLimitInfo.ipLimits.minuteUsage).toBe(2);
  });

  it('should handle fetch errors gracefully', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useRateLimit('http://localhost:3000'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.rateLimitInfo.isLoading).toBe(false);
    expect(result.current.rateLimitInfo.error).toBe('Network error');
  });

  it('should refresh rate limit status', async () => {
    const mockResponse = {
      isAllowed: true,
      globalLimits: { hourlyUsage: 0, dailyUsage: 0, hourlyLimit: 50, dailyLimit: 200 },
      ipLimits: { hourlyUsage: 0, minuteUsage: 0, hourlyLimit: 10, minuteLimit: 3 },
      limitType: null
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useRateLimit('http://localhost:3000'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Clear previous calls
    fetch.mockClear();

    // Mock new response
    const newMockResponse = {
      ...mockResponse,
        globalLimits: { ...mockResponse.globalLimits, hourlyUsage: 10 }
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => newMockResponse,
    });

    await act(async () => {
      result.current.fetchRateLimitStatus();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.rateLimitInfo.globalLimits.hourlyUsage).toBe(100);
  });
});
