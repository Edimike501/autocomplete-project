import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useTypeahead } from '@/hooks/useTypeahead';

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

  it('does not trigger fetch when query is under minimum character threshold (2 chars)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useTypeahead({ minChars: 2 }));

    act(() => {
      result.current.setQuery('a');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
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
      http.get('/api/places', () => {
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
      http.get('/api/places', () => {
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

  it('retries fetching results when retry() is called', async () => {
    let attempts = 0;
    server.use(
      http.get('/api/places', () => {
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
});
