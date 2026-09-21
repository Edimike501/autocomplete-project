import type { Place, ApiErrorResponse } from '@/types/places';

/**
 * Client API fetcher for fetching normalized place search results.
 *
 * @param query Search query string
 * @param signal Optional AbortSignal for cancellation
 * @returns Array of Place objects
 */
export async function fetchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const trimmed = query.trim();
  const response = await fetch(`/api/places?q=${encodeURIComponent(trimmed)}`, { signal });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as ApiErrorResponse;
    throw new Error(errorData.error || 'Failed to fetch places.');
  }

  return (await response.json()) as Place[];
}
