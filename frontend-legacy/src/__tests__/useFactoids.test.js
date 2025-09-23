// frontend/src/__tests__/useFactoids.test.js
import { renderHook, act } from '@testing-library/react';
import { useFactoids } from '../hooks/useFactoids';

// Mock fetch globally
global.fetch = jest.fn();

describe('useFactoids Hook', () => {
  const mockAPI_BASE_URL = 'https://api.example.com';
  const mockFactoids = [
    {
      id: '1',
      text: 'Test factoid 1',
      createdAt: { seconds: 1640995200 }, // 2022-01-01
      votes: { up: 5, down: 2 },
      generationMetadata: {
        modelName: 'GPT-4',
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 1000,
        timestamp: 1640995200000,
        cost: 0.02
      }
    },
    {
      id: '2',
      text: 'Test factoid 2',
      createdAt: { seconds: 1640995100 }, // Earlier date
      votes: { up: 3, down: 1 },
      generationMetadata: {
        modelName: 'Claude-3',
        temperature: 0.8,
        topP: 0.95,
        maxTokens: 800,
        timestamp: 1640995100000,
        cost: 0.015
      }
    },
    {
      id: '3',
      text: 'Test factoid 3',
      createdAt: { _seconds: 1640995000 }, // Alternative timestamp format
      votes: { up: 1, down: 0 },
      generationMetadata: {
        modelName: 'Gemini Pro',
        temperature: 0.6,
        topP: 0.85,
        maxTokens: 1200,
        timestamp: 1640995000000,
        cost: 0.025
      }
    }
  ];

  beforeEach(() => {
    fetch.mockClear();
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with empty factoids array', () => {
      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));
      
      expect(result.current.factoids).toEqual([]);
    });

    it('should initialize with loading true', () => {
      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));
      
      expect(result.current.loading).toBe(true);
    });

    it('should initialize with error null', () => {
      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));
      
      expect(result.current.error).toBe(null);
    });
  });

  describe('fetchFactoids', () => {
    it('should fetch factoids on mount', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactoids,
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(fetch).toHaveBeenCalledWith(
        `${mockAPI_BASE_URL}/.netlify/functions/getFactoids`
      );
      expect(result.current.factoids).toHaveLength(3);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should sort factoids by creation date (newest first)', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactoids,
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const sortedFactoids = result.current.factoids;
      expect(sortedFactoids[0].id).toBe('1'); // Newest (1640995200)
      expect(sortedFactoids[1].id).toBe('2'); // Middle (1640995100)
      expect(sortedFactoids[2].id).toBe('3'); // Oldest (1640995000)
    });

    it('should handle both timestamp formats (seconds and _seconds)', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactoids,
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Should handle both formats and sort correctly
      expect(result.current.factoids).toHaveLength(3);
      expect(result.current.factoids[0].id).toBe('1'); // Has seconds
      expect(result.current.factoids[2].id).toBe('3'); // Has _seconds
    });

    it('should handle fetch errors', async () => {
      const errorMessage = 'Network error';
      fetch.mockRejectedValueOnce(new Error(errorMessage));

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.error).toBe(errorMessage);
      expect(result.current.loading).toBe(false);
      expect(result.current.factoids).toEqual([]);
    });

    it('should handle non-ok responses', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.error).toBe('Error: 500 Internal Server Error');
      expect(result.current.loading).toBe(false);
      expect(result.current.factoids).toEqual([]);
    });

    it('should allow manual refetch', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactoids,
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      // Initial fetch
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.factoids).toHaveLength(3);

      // Manual refetch
      const newFactoids = [{ id: '4', text: 'New factoid', createdAt: { seconds: 1640995300 } }];
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => newFactoids,
      });

      await act(async () => {
        await result.current.fetchFactoids();
      });

      expect(result.current.factoids).toHaveLength(1);
      expect(result.current.factoids[0].id).toBe('4');
    });
  });

  describe('voteFactoid', () => {
    beforeEach(async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactoids,
      });
    });

    it('should vote on a factoid and update state', async () => {
      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const updatedFactoid = {
        id: '1',
        text: 'Test factoid 1',
        createdAt: { seconds: 1640995200 },
        votes: { up: 6, down: 2 }, // Increased up votes
        generationMetadata: mockFactoids[0].generationMetadata
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedFactoid,
      });

      await act(async () => {
        await result.current.voteFactoid('1', 'up');
      });

      expect(fetch).toHaveBeenCalledWith(
        `${mockAPI_BASE_URL}/.netlify/functions/voteFactoid`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ factoidId: '1', voteType: 'up' }),
        }
      );

      expect(result.current.factoids[0].votes.up).toBe(6);
    });

    it('should handle vote errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      fetch.mockRejectedValueOnce(new Error('Vote failed'));

      await act(async () => {
        await result.current.voteFactoid('1', 'up');
      });

      expect(consoleSpy).toHaveBeenCalledWith('Failed to vote:', expect.any(Error));
      expect(alertSpy).toHaveBeenCalledWith('Failed to register your vote. Please try again.');

      consoleSpy.mockRestore();
      alertSpy.mockRestore();
    });

    it('should handle non-ok vote responses', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await act(async () => {
        await result.current.voteFactoid('1', 'up');
      });

      expect(consoleSpy).toHaveBeenCalledWith('Failed to vote:', expect.any(Error));
      expect(alertSpy).toHaveBeenCalledWith('Failed to register your vote. Please try again.');

      consoleSpy.mockRestore();
      alertSpy.mockRestore();
    });
  });

  describe('shuffleFactoids', () => {
    it('should shuffle the factoids array', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactoids,
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const originalOrder = result.current.factoids.map(f => f.id);

      act(() => {
        result.current.shuffleFactoids();
      });

      const shuffledOrder = result.current.factoids.map(f => f.id);
      
      // Should have same elements but potentially different order
      expect(shuffledOrder).toHaveLength(originalOrder.length);
      expect(shuffledOrder.sort()).toEqual(originalOrder.sort());
    });

    it('should maintain all factoid properties after shuffling', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactoids,
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const originalFactoids = result.current.factoids;

      act(() => {
        result.current.shuffleFactoids();
      });

      const shuffledFactoids = result.current.factoids;
      
      // All factoids should still be present with same properties
      originalFactoids.forEach(original => {
        const shuffled = shuffledFactoids.find(f => f.id === original.id);
        expect(shuffled).toBeDefined();
        expect(shuffled.text).toBe(original.text);
        expect(shuffled.votes).toEqual(original.votes);
        expect(shuffled.generationMetadata).toEqual(original.generationMetadata);
      });
    });

    it('should handle empty factoids array', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      act(() => {
        result.current.shuffleFactoids();
      });

      expect(result.current.factoids).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle factoids without timestamps', async () => {
      const factoidsWithoutTimestamps = [
        { id: '1', text: 'No timestamp' },
        { id: '2', text: 'Also no timestamp' }
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => factoidsWithoutTimestamps,
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.factoids).toHaveLength(2);
      // Should not crash when sorting
    });

    it('should handle malformed factoid data', async () => {
      const malformedFactoids = [
        { id: '1', text: 'Valid factoid 1', createdAt: { seconds: 1640995200 } },
        { id: '2', text: 'Valid factoid 2', createdAt: { seconds: 1640995100 } }
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => malformedFactoids,
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.factoids).toHaveLength(2);
      expect(result.current.factoids[0].id).toBe('1');
      expect(result.current.factoids[1].id).toBe('2');
    });

    it('should handle API_BASE_URL changes', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => mockFactoids,
      });

      const { result, rerender } = renderHook(
        ({ apiUrl }) => useFactoids(apiUrl),
        { initialProps: { apiUrl: mockAPI_BASE_URL } }
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(fetch).toHaveBeenCalledWith(
        `${mockAPI_BASE_URL}/.netlify/functions/getFactoids`
      );

      const newAPIUrl = 'https://new-api.example.com';
      rerender({ apiUrl: newAPIUrl });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(fetch).toHaveBeenCalledWith(
        `${newAPIUrl}/.netlify/functions/getFactoids`
      );
    });
  });

  describe('Integration', () => {
    it('should maintain state consistency across multiple operations', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactoids,
      });

      const { result } = renderHook(() => useFactoids(mockAPI_BASE_URL));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.factoids).toHaveLength(3);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);

      // Shuffle
      act(() => {
        result.current.shuffleFactoids();
      });

      expect(result.current.factoids).toHaveLength(3);

      // Vote (mock successful response)
      const updatedFactoid = {
        ...mockFactoids[0],
        votes: { up: 6, down: 2 }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedFactoid,
      });

      await act(async () => {
        await result.current.voteFactoid('1', 'up');
      });

      expect(result.current.factoids).toHaveLength(3);
      expect(result.current.factoids.find(f => f.id === '1').votes.up).toBe(6);
    });
  });
});
