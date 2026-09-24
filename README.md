# Expert Listing Typeahead Search

A resilient, accessible, and high-performance place/city typeahead search component designed for property discovery. Built with Next.js App Router, TypeScript, React 18, Tailwind CSS, and headless hook architecture.

---

## What it is

The Expert Listing Typeahead provides an accessible search interface for looking up locations across Nigeria and internationally. It combines a headless `useTypeahead` hook with a WAI-ARIA 1.2 compliant combobox UI and a hardened Next.js backend proxy to geocode place names in real time.

---

## Why this API

This project uses the **Open-Meteo Geocoding API** (`https://geocoding-api.open-meteo.com/v1/search`) because:
- **No API Key Requirements**: Eliminates authentication barriers during evaluation and local development.
- **Global & Regional Coverage**: High-quality geocoding data for Nigerian cities (Lagos, Abuja, Port Harcourt, Enugu) and international locations.
- **Clean Geospatial Metadata**: Returns structured geographic properties (place name, administrative regions, country, latitude, longitude) suitable for location-based property listing workflows.

---

## Architecture

The system follows a strict three-tier separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                      Presentation                       │
│    Typeahead.tsx (WAI-ARIA Combobox + Tailwind UI)      │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                    Headless State                       │
│  useTypeahead.ts (Debounce, Monotonic IDs, LRU Cache)   │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                  Server Route Handler                   │
│  app/api/places/route.ts (Validation, Rate Limiting,    │
│            Cache Headers, 5xx Retry, Timeout)           │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                 Upstream External API                   │
│             Open-Meteo Geocoding REST API               │
└─────────────────────────────────────────────────────────┘
```

1. **Presentation Layer (`components/Typeahead.tsx`)**: Pure UI component managing focus, dropdown listbox visibility, keyboard selection, and screen reader announcements.
2. **Headless Hook (`hooks/useTypeahead.ts`)**: State container managing query lifecycles, debouncing, AbortController cancellation, monotonic request ID race condition guards, and client-side LRU cache.
3. **Server Route Proxy (`app/api/places/route.ts`)**: Next.js route handler providing query parameter validation, upstream timeout isolation (5s), controlled 1-retry fallback for upstream 5xx errors, HTTP cache headers, and request rate limiting.

---

## Debouncing

- **300ms Delay**: User keystrokes are debounced by 300ms to balance perceived responsiveness with network efficiency.
- **Minimum Query Length (2 Characters)**: Queries shorter than 2 trimmed characters remain in an `idle` state without firing network requests or populating suggestions.
- **Fast Input Recovery**: Clearing the search input immediately resets results to `[]` and status to `idle`.

---

## Stale-Response Protection

In async typeahead systems, out-of-order network responses represent a critical race condition (e.g. searching `"lag"` followed rapidly by `"lagos"`—if `"lag"` resolves after `"lagos"`, stale results could overwrite newer results).

This project implements dual-layer protection:
1. **`AbortController` Cancellation**: When a new query is initiated or when the component unmounts, any pending in-flight request is immediately aborted via `controller.abort()`.
2. **Monotonic Request Sequence IDs (`requestIdRef`)**: Each fetch is assigned an incrementing integer request sequence ID. Before state updates or cache writes occur, the response verifies `currentRequestId === requestIdRef.current && !controller.signal.aborted`. Out-of-order or superseded responses are discarded immediately.

---

## Accessibility

The interface is built against the **WAI-ARIA 1.2 Combobox Pattern**:
- **Semantic ARIA Attributes**:
  - `role="combobox"` on the search input with `aria-autocomplete="list"`, `aria-haspopup="listbox"`, and `aria-expanded` reflecting dropdown visibility.
  - `role="listbox"` with `id="typeahead-listbox"` and `aria-label="Place suggestions"`.
  - `role="option"` with `aria-selected` accurately reflecting the currently highlighted item.
  - `aria-activedescendant="typeahead-option-{index}"` dynamically synchronizing active option focus while keeping cursor focus on the input.
- **Keyboard Navigation**:
  - `ArrowDown` / `ArrowUp`: Cycles through suggestions with cyclic wrapping.
  - `Home` / `End`: Navigates directly to the first or last suggestion.
  - `Enter`: Confirms selection of the highlighted suggestion.
  - `Escape`: Closes the dropdown listbox and clears search query.
  - `Tab`: Closes the listbox without causing accidental selection.
- **Visual Accessibility**:
  - `focus-visible` emerald focus ring (`focus-visible:ring-2 focus-visible:ring-emerald-600/30`).
  - Active options feature distinct background shading, font weight, and an accent left border (`border-l-3 border-emerald-600`), ensuring distinction is not dependent solely on color.
- **Screen Reader Announcements**: Polite live region (`aria-live="polite"`, `sr-only`) announcing status transitions ("Searching for places...", "{n} places found.", "No places found for {query}").

---

## Caching

- **Client-Side Bounded LRU Cache**: Implemented in `useTypeahead` using an in-memory `Map` capped at **50 entries**.
- **Key Normalization**: Queries are normalized via `searchQuery.trim().toLowerCase()` (e.g., `"  LoNDoN  "` and `"london"` resolve to the same cache entry).
- **Network Request Avoidance**: Cache hits return results immediately with `'success'` status and zero network requests.
- **LRU Recency & Eviction**: Re-accessed entries are promoted to the most recent position; adding an entry beyond 50 evicts the least recently used key.
- **State Isolation**: Only successful non-empty result arrays are cached; loading and error states are never stored.

---

## Server Hardening

The `/api/places` route handler includes production-minded protections:
- **Cache-Control Headers**: Successful 200 responses return `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`.
- **Request Rate Limiting**: In-memory per-IP limiter allowing 60 requests per minute. Exceeding limits returns `429 Too Many Requests` with a dynamic `Retry-After` header.
  > *Note: This in-memory limiter is suitable for the demo. Production deployments should use a shared store such as Redis or an edge-provider rate limiter.*
- **Controlled 5xx Retry**: When upstream returns a 5xx status code (`500`-`599`), the handler attempts 1 controlled retry before returning `502 Bad Gateway`.
- **5-Second Timeout**: Every upstream request is guarded by `AbortSignal.timeout(5000)`.

---

## Testing Strategy

The repository maintains automated test suites across three distinct testing tiers:

```
┌─────────────────────────────────────────────────────────┐
│              E2E & Accessibility (Playwright)           │
│   • Happy path search & keyboard selection              │
│   • Error & retry recovery flow                         │
│   • Automated Axe a11y scans across all UI states       │
├─────────────────────────────────────────────────────────┤
│           Integration & Contract (Vitest + MSW)         │
│   • API contract integrity between route & client       │
│   • Server validation, timeout, rate limiting & retry   │
│   • Component keyboard navigation & ARIA attributes     │
├─────────────────────────────────────────────────────────┤
│                 Unit Tests (Vitest + RTL)               │
│   • useTypeahead debounce & min-chars thresholds        │
│   • Monotonic request ID stale-response guards          │
│   • Bounded LRU cache hits, normalization, and eviction │
└─────────────────────────────────────────────────────────┘
```

---

## Scaling Path

For production deployment at enterprise scale, recommended enhancements include:
1. **Distributed Rate Limiting**: Migrate from in-memory Map to Upstash Redis or Vercel Edge Middleware rate limiting.
2. **Dedicated Search Index**: Index location listings in Elasticsearch, Typesense, or Meilisearch with prefix matching, phonetic typo tolerance, and edge ngram tokenization.
3. **Geo-Biased Ranking**: Bias search results based on user geolocation headers (`x-vercel-ip-latitude`, `x-vercel-ip-longitude`) to rank nearby properties higher.
4. **Edge CDN Caching**: Leverage edge network caching with regional stale-while-revalidate cache purging.

---

## Known Limitations

- **In-Memory Rate Limiting**: The demo rate limiter runs in Node.js server memory and is not synchronized across multi-instance serverless deployments.
- **Session-Scoped Cache**: The client LRU cache resides in React hook component memory and resets on full page reload.

---

## Running Locally

### Prerequisites
- Node.js 18.18+ or 20+
- `pnpm` (or `npm`)

### Installation
```bash
# Clone the repository
git clone https://github.com/Edimike501/autocomplete-project.git
cd autocomplete-project

# Install dependencies
pnpm install
```

### Development Server
```bash
pnpm run dev
# Open http://localhost:3000 in your browser
```

### Running Tests
```bash
# Run unit, contract, and integration tests
pnpm test

# Run E2E and accessibility tests with Playwright
pnpm run test:e2e
```

### Quality Checks & Build
```bash
# Typecheck
pnpm run typecheck

# Lint
pnpm run lint

# Production Build
pnpm run build
```

---

## Git Commit History Progression

```
08c2db9 test: add e2e and accessibility checks with CI workflow
104c18c style: migrate typeahead UI to Tailwind CSS
b8d7eb3 perf(api): add cache headers and request protection
b3ae950 perf(hook): add bounded cache for repeated queries
3fdeae9 test(ui): cover combobox accessibility and interaction edge cases
73726f9 feat(ui): add accessible combobox with keyboard navigation
dbf74b1 test: stabilize typeahead integration boundaries
0bacc50 fix(hook): prevent stale responses with abort controller and request-id guard
23bd044 test(hook): add failing test for out-of-order responses
54a3284 feat(hook): add debounced useTypeahead with explicit status states
dfaeefc feat(api): add validated places route with timeout and normalized response
1fa880b Initial commit
```
