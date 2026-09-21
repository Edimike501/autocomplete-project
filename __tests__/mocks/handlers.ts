import { http, HttpResponse } from 'msw';
import type { OpenMeteoResponse, Place } from '@/types/places';

export const OPEN_METEO_BASE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export const mockGeocodingResponse: OpenMeteoResponse = {
  results: [
    {
      id: 2643743,
      name: 'London',
      latitude: 51.50853,
      longitude: -0.12574,
      country: 'United Kingdom',
      admin1: 'England',
    },
    {
      id: 5128581,
      name: 'New York',
      latitude: 40.71427,
      longitude: -74.00597,
      country: 'United States',
      admin1: 'New York',
    },
  ],
};

export const mockPlacesResponse: Place[] = [
  {
    id: 2643743,
    name: 'London',
    admin1: 'England',
    country: 'United Kingdom',
    lat: 51.50853,
    lon: -0.12574,
  },
  {
    id: 5128581,
    name: 'New York',
    admin1: 'New York',
    country: 'United States',
    lat: 40.71427,
    lon: -74.00597,
  },
];

export const handlers = [
  http.get('*/api/places', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q');

    if (!q || q.trim().length < 2) {
      return HttpResponse.json(
        { error: 'Query parameter "q" must be between 2 and 100 characters.' },
        { status: 400 }
      );
    }

    return HttpResponse.json(mockPlacesResponse);
  }),

  http.get(OPEN_METEO_BASE_URL, ({ request }) => {
    const url = new URL(request.url);
    const name = url.searchParams.get('name');

    if (!name || name.trim().length < 2) {
      return HttpResponse.json({ results: [] });
    }

    return HttpResponse.json(mockGeocodingResponse);
  }),
];
