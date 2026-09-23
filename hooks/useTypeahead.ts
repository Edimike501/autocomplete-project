import { useState, useEffect, useCallback, useRef } from 'react';
import type { Place } from '@/types/places';
import { fetchPlaces } from '@/lib/api';

export type TypeaheadStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface UseTypeaheadOptions {
  debounceMs?: number;
  minChars?: number;
}

export interface UseTypeaheadReturn {
  query: string;
  setQuery: (q: string) => void;
  results: Place[];
  status: TypeaheadStatus;
  error: string | null;
  retry: () => void;
}

const MAX_CACHE_SIZE = 50;

export function useTypeahead(options: UseTypeaheadOptions = {}): UseTypeaheadReturn {
  const { debounceMs = 300, minChars = 2 } = options;

  const [query, setQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<TypeaheadStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Bounded client-side LRU cache storing successful Place[] results keyed by normalized query
  const cacheRef = useRef<Map<string, Place[]>>(new Map());

  // Track in-flight AbortController and monotonic request sequence ID
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);

  // Debounce query updates by debounceMs
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => {
      clearTimeout(handler);
    };
  }, [query, debounceMs]);

  // Execute fetch for debouncedQuery with abort & request ID guards
  const executeFetch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    const normalizedKey = trimmed.toLowerCase();

    // Abort any existing in-flight request before starting a new action
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (trimmed.length < minChars) {
      setResults([]);
      setStatus('idle');
      setError(null);
      return;
    }

    // Check bounded LRU cache for existing successful result
    if (cacheRef.current.has(normalizedKey)) {
      const cached = cacheRef.current.get(normalizedKey)!;

      // Re-accessed entries become most recently used
      cacheRef.current.delete(normalizedKey);
      cacheRef.current.set(normalizedKey, cached);

      setResults(cached);
      setStatus('success');
      setError(null);
      return;
    }

    // Assign new monotonic request ID and AbortController
    const currentRequestId = ++requestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus('loading');
    setError(null);

    try {
      const data = await fetchPlaces(trimmed, controller.signal);

      // Guard: Ignore response if a newer request has been triggered or request was aborted
      if (currentRequestId !== requestIdRef.current || controller.signal.aborted) {
        return;
      }

      if (Array.isArray(data) && data.length > 0) {
        // Cache successful result arrays only
        const cache = cacheRef.current;
        cache.delete(normalizedKey);
        cache.set(normalizedKey, data);

        if (cache.size > MAX_CACHE_SIZE) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey !== undefined) {
            cache.delete(oldestKey);
          }
        }

        setResults(data);
        setStatus('success');
        setError(null);
      } else {
        setResults([]);
        setStatus('empty');
        setError(null);
      }
    } catch (err) {
      // Ignore errors for aborted or superseded requests
      if (currentRequestId !== requestIdRef.current || controller.signal.aborted) {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Network error occurred.';
      setResults([]);
      setStatus('error');
      setError(errorMessage);
    }
  }, [minChars]);

  // Fetch when debouncedQuery changes
  useEffect(() => {
    executeFetch(debouncedQuery);

    // Cleanup: Abort request on unmount or when debouncedQuery changes
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [debouncedQuery, executeFetch]);

  const retry = useCallback(() => {
    executeFetch(debouncedQuery);
  }, [debouncedQuery, executeFetch]);

  return {
    query,
    setQuery,
    results,
    status,
    error,
    retry,
  };
}
