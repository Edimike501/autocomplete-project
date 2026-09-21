// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../mocks/server';
import { OPEN_METEO_BASE_URL } from '../../mocks/handlers';
import { GET } from '@/app/api/places/route';
import type { Place, ApiErrorResponse } from '@/types/places';

describe('GET /api/places', () => {
  it('returns 400 error when query parameter "q" is missing', async () => {
    const request = new Request('http://localhost:3000/api/places');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error).toBe('Missing required query parameter "q".');
  });

  it('returns 400 error when query parameter "q" is shorter than 2 characters', async () => {
    const request = new Request('http://localhost:3000/api/places?q=a');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error).toBe('Query parameter "q" must be between 2 and 100 characters.');
  });

  it('returns 400 error when trimmed query parameter "q" is shorter than 2 characters', async () => {
    const request = new Request('http://localhost:3000/api/places?q=%20x%20');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error).toBe('Query parameter "q" must be between 2 and 100 characters.');
  });

  it('returns 400 error when query parameter "q" exceeds 100 characters', async () => {
    const longQuery = 'a'.repeat(101);
    const request = new Request(`http://localhost:3000/api/places?q=${longQuery}`);
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error).toBe('Query parameter "q" must be between 2 and 100 characters.');
  });

  it('normalizes upstream response items and returns 200 with Place[]', async () => {
    const request = new Request('http://localhost:3000/api/places?q=London');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const places = (await response.json()) as Place[];

    expect(Array.isArray(places)).toBe(true);
    expect(places.length).toBe(2);

    expect(places[0]).toEqual({
      id: 2643743,
      name: 'London',
      admin1: 'England',
      country: 'United Kingdom',
      lat: 51.50853,
      lon: -0.12574,
    });

    expect(places[1]).toEqual({
      id: 5128581,
      name: 'New York',
      admin1: 'New York',
      country: 'United States',
      lat: 40.71427,
      lon: -74.00597,
    });
  });

  it('returns 502 Bad Gateway when upstream server returns a 500 error', async () => {
    server.use(
      http.get(OPEN_METEO_BASE_URL, () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    const request = new Request('http://localhost:3000/api/places?q=London');
    const response = await GET(request);

    expect(response.status).toBe(502);
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error).toBe('Upstream geocoding service returned an error.');
  });

  it('returns 502 Bad Gateway when upstream fetch fails due to network error', async () => {
    server.use(
      http.get(OPEN_METEO_BASE_URL, () => {
        return HttpResponse.error();
      })
    );

    const request = new Request('http://localhost:3000/api/places?q=London');
    const response = await GET(request);

    expect(response.status).toBe(502);
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error).toBe('Failed to communicate with upstream geocoding service.');
  });

  it('returns 502 Bad Gateway when upstream fetch times out', async () => {
    server.use(
      http.get(OPEN_METEO_BASE_URL, async () => {
        await delay(5500);
        return HttpResponse.json({ results: [] });
      })
    );

    const request = new Request('http://localhost:3000/api/places?q=London');
    const response = await GET(request);

    expect(response.status).toBe(502);
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error).toBe('Upstream geocoding service timed out.');
  }, 10000);
});
