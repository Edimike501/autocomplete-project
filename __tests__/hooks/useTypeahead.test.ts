import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../mocks/server';
import { useTypeahead } from '@/hooks/useTypeahead';
import { createDeferred } from '../utils/deferred';
import type { Place } from '@/types/places';

describe('useTypeahead hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes with idle status, empty query, and empty results', () => {
    const { result } = renderHook(() => useTypeahead());

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('does not trigger fetch when query is empty or under minChars threshold', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useTypeahead({ minChars: 2 }));

    // Single character query
    act(() => {
      result.current.setQuery('a');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();

    // Reset to empty string query
    act(() => {
      result.current.setQuery('');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.results).toEqual([]);
  });

  it('debounces rapid typing and triggers exactly one API request after delay', async () => {
    const { result } = renderHook(() => useTypeahead({ debounceMs: 300 }));

    // Simulate rapid typing: L -> Lo -> Lon -> Lond -> London
    act(() => {
      result.current.setQuery('L');
    });
    act(() => {
      result.current.setQuery('Lo');
    });
    act(() => {
      result.current.setQuery('Lon');
    });

    // Advance 150ms - timer should not have fired yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(result.current.status).toBe('idle');

    // Type more before timer finishes
    act(() => {
      result.current.setQuery('London');
    });

    // Advance 300ms from last keystroke
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe('success');
    expect(result.current.results.length).toBeGreaterThan(0);
    expect(result.current.results[0].name).toBe('London');
  });

  it('handles loading -> success status transition for valid search results', async () => {
    const { result } = renderHook(() => useTypeahead());

    act(() => {
      result.current.setQuery('London');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe('success');
    expect(result.current.results.length).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('handles empty status transition when API returns no results', async () => {
    server.use(
      http.get('*/api/places', () => {
        return HttpResponse.json([]);
      })
    );

    const { result } = renderHook(() => useTypeahead());

    act(() => {
      result.current.setQuery('UnknownCityName');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe('empty');
    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('handles error status transition when API returns a 502 error', async () => {
    server.use(
      http.get('*/api/places', () => {
        return HttpResponse.json(
          { error: 'Upstream geocoding service returned an error.' },
          { status: 502 }
        );
      })
    );

    const { result } = renderHook(() => useTypeahead());

    act(() => {
      result.current.setQuery('London');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBe('Upstream geocoding service returned an error.');
  });

  it('retries fetching latest valid query when retry() is called', async () => {
    let attempts = 0;
    server.use(
      http.get('*/api/places', () => {
        attempts++;
        if (attempts === 1) {
          return HttpResponse.json(
            { error: 'Temporary service error' },
            { status: 502 }
          );
        }
        return HttpResponse.json([
          { id: 1, name: 'London', lat: 51.5, lon: -0.1 },
        ]);
      })
    );

    const { result } = renderHook(() => useTypeahead());

    act(() => {
      result.current.setQuery('London');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Temporary service error');

    // Call retry()
    await act(async () => {
      result.current.retry();
    });

    expect(result.current.status).toBe('success');
    expect(result.current.results.length).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it('ignores slow out-of-order response when a newer fast response resolves first using deferred helper', async () => {
    const lagDeferred = createDeferred<Place[]>();
    const lagosDeferred = createDeferred<Place[]>();

    server.use(
      http.get('*/api/places', async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get('q');

        if (q === 'lag') {
          const data = await lagDeferred.promise;
          return HttpResponse.json(data);
        }

        if (q === 'lagos') {
          const data = await lagosDeferred.promise;
          return HttpResponse.json(data);
        }

        return HttpResponse.json([]);
      })
    );

    const { result } = renderHook(() => useTypeahead({ debounceMs: 100 }));

    // User types "lag"
    act(() => {
      result.current.setQuery('lag');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // User updates query to "lagos"
    act(() => {
      result.current.setQuery('lagos');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Resolve "lagos" response first
    await act(async () => {
      lagosDeferred.resolve([
        { id: 102, name: 'Lagos', country: 'Nigeria', lat: 6.5, lon: 3.37 },
      ]);
    });

    expect(result.current.results[0]?.name).toBe('Lagos');

    // Resolve slow "lag" response second
    await act(async () => {
      lagDeferred.resolve([
        { id: 101, name: 'Lag', country: 'Germany', lat: 48.0, lon: 11.0 },
      ]);
    });

    // Results MUST remain "Lagos"
    expect(result.current.results[0]?.name).toBe('Lagos');
  });

  it('aborts active fetch request on unmount without throwing or setting error state', async () => {
    let requestAborted = false;

    server.use(
      http.get('*/api/places', async ({ request }) => {
        request.signal.addEventListener('abort', () => {
          requestAborted = true;
        });
        await delay(500);
        return HttpResponse.json([
          { id: 1, name: 'London', lat: 51.5, lon: -0.1 },
        ]);
      })
    );

    const { result, unmount } = renderHook(() => useTypeahead({ debounceMs: 100 }));

    act(() => {
      result.current.setQuery('London');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Unmount hook while request is pending
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(requestAborted).toBe(true);
  });

  describe('Bounded LRU Cache behaviour', () => {
    it('serves repeated queries from cache and avoids redundant network requests', async () => {
      let networkCalls = 0;
      server.use(
        http.get('*/api/places', ({ request }) => {
          networkCalls++;
          const url = new URL(request.url);
          const q = url.searchParams.get('q');
          return HttpResponse.json([
            { id: 1, name: q || 'Place', lat: 10, lon: 20 },
          ]);
        })
      );

      const { result } = renderHook(() => useTypeahead({ debounceMs: 100 }));

      // 1. Initial query for "Paris" -> triggers network call
      act(() => {
        result.current.setQuery('Paris');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.status).toBe('success');
      expect(result.current.results[0]?.name).toBe('Paris');
      expect(networkCalls).toBe(1);

      // 2. Query for "London" -> triggers network call
      act(() => {
        result.current.setQuery('London');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.status).toBe('success');
      expect(result.current.results[0]?.name).toBe('London');
      expect(networkCalls).toBe(2);

      // 3. Repeat query for "Paris" -> cache hit, avoids network call
      act(() => {
        result.current.setQuery('Paris');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.status).toBe('success');
      expect(result.current.results[0]?.name).toBe('Paris');
      expect(networkCalls).toBe(2); // Still 2 calls, network was avoided
    });

    it('normalizes query casing and whitespace for cache hits', async () => {
      let networkCalls = 0;
      server.use(
        http.get('*/api/places', () => {
          networkCalls++;
          return HttpResponse.json([
            { id: 2, name: 'Berlin', lat: 52.5, lon: 13.4 },
          ]);
        })
      );

      const { result } = renderHook(() => useTypeahead({ debounceMs: 100 }));

      // Initial query with standard casing
      act(() => {
        result.current.setQuery('Berlin');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.status).toBe('success');
      expect(networkCalls).toBe(1);

      // Query with mixed case and surrounding whitespace
      act(() => {
        result.current.setQuery('   bErLiN   ');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.status).toBe('success');
      expect(result.current.results[0]?.name).toBe('Berlin');
      expect(networkCalls).toBe(1); // Served from cache
    });

    it('evicts the least recently used entry when exceeding the 50-item limit and preserves re-accessed entries', async () => {
      const callCounts: Record<string, number> = {};
      server.use(
        http.get('*/api/places', ({ request }) => {
          const url = new URL(request.url);
          const q = url.searchParams.get('q') || '';
          callCounts[q] = (callCounts[q] || 0) + 1;
          return HttpResponse.json([
            { id: Math.random(), name: `Result for ${q}`, lat: 0, lon: 0 },
          ]);
        })
      );

      const { result } = renderHook(() => useTypeahead({ debounceMs: 50 }));

      // Fill cache with 50 distinct items: city-00 through city-49
      for (let i = 0; i < 50; i++) {
        const queryName = `city-${i.toString().padStart(2, '0')}`;
        act(() => {
          result.current.setQuery(queryName);
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(50);
        });
        expect(callCounts[queryName]).toBe(1);
      }

      // Re-access city-00 -> makes it the most recently used (city-01 is now the oldest/LRU)
      act(() => {
        result.current.setQuery('city-00');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(callCounts['city-00']).toBe(1); // Cache hit, no extra network call

      // Add 51st item: city-50 -> exceeds limit (50), evicting LRU item (city-01)
      act(() => {
        result.current.setQuery('city-50');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(callCounts['city-50']).toBe(1);

      // Verify city-00 is STILL in cache (not evicted because it was re-accessed)
      act(() => {
        result.current.setQuery('city-00');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(callCounts['city-00']).toBe(1); // Still 1 call (cache hit)

      // Verify city-01 was evicted -> triggers a new network call
      act(() => {
        result.current.setQuery('city-01');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(callCounts['city-01']).toBe(2); // Second network call triggered due to eviction
    });

    it('does not cache error states or loading states', async () => {
      let attempt = 0;
      server.use(
        http.get('*/api/places', () => {
          attempt++;
          if (attempt === 1) {
            return HttpResponse.json({ error: 'Server unavailable' }, { status: 500 });
          }
          return HttpResponse.json([
            { id: 10, name: 'RetrySuccess', lat: 10, lon: 20 },
          ]);
        })
      );

      const { result } = renderHook(() => useTypeahead({ debounceMs: 100 }));

      // First query fails
      act(() => {
        result.current.setQuery('failQuery');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.status).toBe('error');
      expect(attempt).toBe(1);

      // Second query for same term should NOT return cached error and must make a new network request
      act(() => {
        result.current.setQuery('otherQuery');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      act(() => {
        result.current.setQuery('failQuery');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.status).toBe('success');
      expect(result.current.results[0]?.name).toBe('RetrySuccess');
      expect(attempt).toBe(3);
    });
  });
});
