import { NextResponse } from 'next/server';
import type { OpenMeteoResponse, Place, ApiErrorResponse } from '@/types/places';

const UPSTREAM_BASE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REQUEST_TIMEOUT_MS = 5000;

export async function GET(request: Request): Promise<NextResponse<Place[] | ApiErrorResponse>> {
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
    const response = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

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

    return NextResponse.json(places);
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
