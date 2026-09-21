/**
 * Normalized place item returned to the client application.
 */
export interface Place {
  id: string | number;
  name: string;
  admin1?: string;
  country?: string;
  lat: number;
  lon: number;
}

/**
 * Raw search result item returned by Open-Meteo Geocoding API.
 */
export interface OpenMeteoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  [key: string]: unknown;
}

/**
 * Top-level response schema returned by Open-Meteo Geocoding API.
 */
export interface OpenMeteoResponse {
  results?: OpenMeteoResult[];
  generationtime_ms?: number;
}

/**
 * Error response payload returned by API routes.
 */
export interface ApiErrorResponse {
  error: string;
}
