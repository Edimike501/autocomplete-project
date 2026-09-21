import { useState, useEffect, useCallback } from 'react';
import type { Place, ApiErrorResponse } from '@/types/places';

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

export function useTypeahead(options: UseTypeaheadOptions = {}): UseTypeaheadReturn {
  const { debounceMs = 300, minChars = 2 } = options;

  const [query, setQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<TypeaheadStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Debounce query updates by debounceMs
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => {
      clearTimeout(handler);
    };
  }, [query, debounceMs]);

  // Execute fetch for debouncedQuery
  const executeFetch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < minChars) {
      setResults([]);
      setStatus('idle');
      setError(null);
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const response = await fetch(`/api/places?q=${encodeURIComponent(trimmed)}`);
      
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorResponse;
        setResults([]);
        setStatus('error');
        setError(errorData.error || 'Failed to fetch places.');
        return;
      }

      const data = (await response.json()) as Place[];
      if (Array.isArray(data) && data.length > 0) {
        setResults(data);
        setStatus('success');
        setError(null);
      } else {
        setResults([]);
        setStatus('empty');
        setError(null);
      }
    } catch {
      setResults([]);
      setStatus('error');
      setError('Network error occurred.');
    }
  }, [minChars]);

  // Fetch when debouncedQuery changes
  useEffect(() => {
    executeFetch(debouncedQuery);
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
