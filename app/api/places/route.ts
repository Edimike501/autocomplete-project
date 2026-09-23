import { NextResponse } from 'next/server';
import type { OpenMeteoResponse, Place, ApiErrorResponse } from '@/types/places';
import { checkRateLimit, getClientIp } from '@/lib/rateLimiter';

const UPSTREAM_BASE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Executes upstream fetch with 5-second timeout and 1 controlled retry on 5xx status codes.
 */
async function fetchUpstreamWithRetry(upstreamUrl: string): Promise<Response> {
  let response = await fetch(upstreamUrl, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  // Controlled 1-retry fallback for upstream 5xx errors
  if (response.status >= 500 && response.status < 600) {
    response = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  return response;
}

export async function GET(request: Request): Promise<NextResponse<Place[] | ApiErrorResponse>> {
  // Check rate limit per client IP
  const clientIp = getClientIp(request);
  const { allowed, retryAfterSeconds } = checkRateLimit(clientIp);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get('q');

  if (!rawQuery) {
    return NextResponse.json(
      { error: 'Missing required query parameter "q".' },
      { status: 400 }
    );
  }

  const query = rawQuery.trim();

  // Validate search query length (min 2, max 100 chars).
  if (query.length < 2 || query.length > 100) {
    return NextResponse.json(
      { error: 'Query parameter "q" must be between 2 and 100 characters.' },
      { status: 400 }
    );
  }

  const upstreamUrl = `${UPSTREAM_BASE_URL}?name=${encodeURIComponent(
    query
  )}&count=8&language=en&format=json`;

  try {
    const response = await fetchUpstreamWithRetry(upstreamUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Upstream geocoding service returned an error.' },
        { status: 502 }
      );
    }

    const data = (await response.json()) as OpenMeteoResponse;
    const rawResults = data.results ?? [];

    // Normalize upstream items to client Place model
    const places: Place[] = rawResults.map((item) => {
      const place: Place = {
        id: item.id,
        name: item.name,
        lat: item.latitude,
        lon: item.longitude,
      };
      if (item.admin1) {
        place.admin1 = item.admin1;
      }
      if (item.country) {
        place.country = item.country;
      }
      return place;
    });

    return NextResponse.json(places, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    // Return 502 Bad Gateway on fetch timeout or network failure
    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError');
    const errorMessage = isTimeout
      ? 'Upstream geocoding service timed out.'
      : 'Failed to communicate with upstream geocoding service.';

    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}
