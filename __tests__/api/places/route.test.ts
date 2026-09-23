// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../mocks/server';
import { OPEN_METEO_BASE_URL } from '../../mocks/handlers';
import { GET } from '@/app/api/places/route';
import { _resetRateLimiter } from '@/lib/rateLimiter';
import type { Place, ApiErrorResponse } from '@/types/places';

describe('GET /api/places', () => {
  beforeEach(() => {
    _resetRateLimiter();
  });

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

  it('normalizes upstream response items, returns 200 with Place[], and sets Cache-Control header', async () => {
    const request = new Request('http://localhost:3000/api/places?q=London');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=86400'
    );

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

  it('retries once when upstream returns a 5xx error and succeeds if retry returns 200', async () => {
    let attempt = 0;
    server.use(
      http.get(OPEN_METEO_BASE_URL, () => {
        attempt++;
        if (attempt === 1) {
          return new HttpResponse(null, { status: 503 });
        }
        return HttpResponse.json({
          results: [
            {
              id: 999,
              name: 'RecoveredCity',
              latitude: 12.34,
              longitude: 56.78,
            },
          ],
        });
      })
    );

    const request = new Request('http://localhost:3000/api/places?q=RecoveredCity');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(attempt).toBe(2);
    const places = (await response.json()) as Place[];
    expect(places[0].name).toBe('RecoveredCity');
  });

  it('returns 502 Bad Gateway when upstream server persistently fails with 500 error after retry', async () => {
    let attempts = 0;
    server.use(
      http.get(OPEN_METEO_BASE_URL, () => {
        attempts++;
        return new HttpResponse(null, { status: 500 });
      })
    );

    const request = new Request('http://localhost:3000/api/places?q=London');
    const response = await GET(request);

    expect(response.status).toBe(502);
    expect(attempts).toBe(2); // Initial attempt + 1 retry
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error).toBe('Upstream geocoding service returned an error.');
  });

  it('enforces rate limiting (429) and provides Retry-After header when threshold is exceeded', async () => {
    const ip = '192.168.1.50';

    // Fire 60 allowed requests
    for (let i = 0; i < 60; i++) {
      const request = new Request('http://localhost:3000/api/places?q=London', {
        headers: { 'x-forwarded-for': ip },
      });
      const response = await GET(request);
      expect(response.status).toBe(200);
    }

    // 61st request should be rate-limited
    const rateLimitedRequest = new Request('http://localhost:3000/api/places?q=London', {
      headers: { 'x-forwarded-for': ip },
    });
    const rateLimitedResponse = await GET(rateLimitedRequest);

    expect(rateLimitedResponse.status).toBe(429);
    expect(rateLimitedResponse.headers.has('Retry-After')).toBe(true);
    const retryAfter = Number(rateLimitedResponse.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);

    const body = (await rateLimitedResponse.json()) as ApiErrorResponse;
    expect(body.error).toBe('Too many requests. Please try again later.');
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
