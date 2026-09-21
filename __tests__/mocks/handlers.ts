import { http, HttpResponse } from 'msw';
import type { OpenMeteoResponse } from '@/types/places';

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

export const handlers = [
  http.get(OPEN_METEO_BASE_URL, ({ request }) => {
    const url = new URL(request.url);
    const name = url.searchParams.get('name');

    if (!name || name.trim().length < 2) {
      return HttpResponse.json({ results: [] });
    }

    return HttpResponse.json(mockGeocodingResponse);
  }),
];
