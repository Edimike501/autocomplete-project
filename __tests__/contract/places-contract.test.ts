import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/places/route';
import { fetchPlaces } from '@/lib/api';
import type { Place } from '@/types/places';

describe('API & Client Place Contract Integrity', () => {
  it('proves GET /api/places response strictly matches Place[] contract consumed by useTypeahead without UI re-shaping', async () => {
    // 1. Query route handler directly
    const routeRequest = new Request('http://localhost/3000/api/places?q=London');
    const routeResponse = await GET(routeRequest);

    expect(routeResponse.status).toBe(200);
    const routePlaces = (await routeResponse.json()) as Place[];

    // 2. Verify response array non-emptiness and field types
    expect(Array.isArray(routePlaces)).toBe(true);
    expect(routePlaces.length).toBeGreaterThan(0);

    const firstPlace = routePlaces[0];
    expect(firstPlace).toHaveProperty('id');
    expect(firstPlace).toHaveProperty('name');
    expect(firstPlace).toHaveProperty('lat');
    expect(firstPlace).toHaveProperty('lon');

    expect(typeof firstPlace.id === 'string' || typeof firstPlace.id === 'number').toBe(true);
    expect(typeof firstPlace.name).toBe('string');
    expect(typeof firstPlace.lat).toBe('number');
    expect(typeof firstPlace.lon).toBe('number');

    if (firstPlace.admin1 !== undefined) {
      expect(typeof firstPlace.admin1).toBe('string');
    }
    if (firstPlace.country !== undefined) {
      expect(typeof firstPlace.country).toBe('string');
    }

    // 3. Verify client API helper fetches and parses the exact same contract
    const clientPlaces = await fetchPlaces('London');
    expect(clientPlaces).toEqual(routePlaces);
  });
});
