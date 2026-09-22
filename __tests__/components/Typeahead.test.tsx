import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { Typeahead } from '@/components/Typeahead';
import { createDeferred } from '../utils/deferred';
import type { Place } from '@/types/places';

describe('Typeahead component & accessibility edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders input with correct WAI-ARIA combobox attributes', () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox', { name: 'Location Search' });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-haspopup', 'listbox');
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('ensures input keeps focus during keyboard navigation', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'London' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Home' });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'End' });
    expect(document.activeElement).toBe(input);
  });

  it('removes aria-activedescendant attribute when no option is active', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Dropdown open, but no option highlighted yet
    expect(input).not.toHaveAttribute('aria-activedescendant');

    // ArrowDown highlights option 0
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'typeahead-option-0');

    // Escape closes dropdown and removes aria-activedescendant
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('ensures aria-expanded accurately matches listbox DOM visibility', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'London' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('maintains stable listbox ID and option IDs', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('id', 'typeahead-listbox');

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('id', 'typeahead-option-0');
    expect(options[1]).toHaveAttribute('id', 'typeahead-option-1');
  });

  it('sets aria-selected="true" only on the active option', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('Escape key closes list and clears input query', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(input.value).toBe('London');
    expect(input).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input.value).toBe('');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Tab key closes list without causing accidental selection', async () => {
    const handleSelect = vi.fn();
    render(<Typeahead label="Location Search" onSelect={handleSelect} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Highlight 1st option
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // Press Tab
    fireEvent.keyDown(input, { key: 'Tab' });

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(handleSelect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('selected-place-card')).not.toBeInTheDocument();
  });

  it('clicking an option works cleanly when input blurs first', async () => {
    const handleSelect = vi.fn();
    render(<Typeahead label="Location Search" onSelect={handleSelect} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const options = screen.getAllByRole('option');

    // Simulate mouse down -> preventDefault -> click
    const mouseDownEvent = fireEvent.mouseDown(options[0]);
    expect(mouseDownEvent).toBe(false); // defaultPrevented is true

    fireEvent.click(options[0]);

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'London' })
    );
    expect(screen.getByTestId('selected-place-card')).toHaveTextContent('London');
  });

  it('clicking outside closes the dropdown list', async () => {
    render(
      <div>
        <Typeahead label="Location Search" />
        <button type="button">Outside Button</button>
      </div>
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(input).toHaveAttribute('aria-expanded', 'true');

    // Click outside button
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside Button' }));

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('announces status changes via aria-live polite region', async () => {
    render(<Typeahead label="Location Search" />);

    const liveRegion = screen.getByText('', { selector: '[aria-live="polite"]' });
    expect(liveRegion).toBeInTheDocument();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(liveRegion).toHaveTextContent('2 places found.');
  });

  it('does not leave stale results visible during loading state', async () => {
    const lagosDeferred = createDeferred<Place[]>();
    server.use(
      http.get('*/api/places', async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get('q');

        if (q === 'Lagos') {
          return HttpResponse.json(await lagosDeferred.promise);
        }

        return HttpResponse.json([
          { id: 1, name: 'London', country: 'United Kingdom', lat: 51.5, lon: -0.1 },
        ]);
      })
    );

    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');

    // 1st query: London (resolves immediately)
    fireEvent.change(input, { target: { value: 'London' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getAllByRole('option')).toHaveLength(1);

    // 2nd query: update to "Lagos" (pending on lagosDeferred)
    fireEvent.change(input, { target: { value: 'Lagos' } });

    // Advance 300ms for debounce to trigger fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // While fetch is pending, loading status renders and old options are cleared
    const statusItem = screen.getByRole('status');
    expect(statusItem).toHaveTextContent('Loading places...');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();

    // Resolve deferred promise
    await act(async () => {
      lagosDeferred.resolve([
        { id: 2, name: 'Lagos', country: 'Nigeria', lat: 6.5, lon: 3.37 },
      ]);
    });

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Lagos');
  });

  it('handles places with missing admin1, country, or coordinates gracefully', async () => {
    server.use(
      http.get('*/api/places', () => {
        return HttpResponse.json([
          { id: 77, name: 'Ocean Spot', lat: 0.0, lon: 0.0 },
        ]);
      })
    );

    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Ocean' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const option = screen.getByRole('option');
    expect(option).toHaveTextContent('Ocean Spot');

    fireEvent.click(option);

    const card = screen.getByTestId('selected-place-card');
    expect(card).toHaveTextContent('Ocean Spot');
    expect(card).toHaveTextContent('No regional metadata');
    expect(card).toHaveTextContent('Coordinates: 0.0000, 0.0000');
  });

  it('highlights text correctly with special characters and case differences', async () => {
    server.use(
      http.get('*/api/places', () => {
        return HttpResponse.json([
          { id: 88, name: "St. John's (City)", country: 'Canada', lat: 47.5, lon: -52.7 },
        ]);
      })
    );

    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: "john's (city)" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const option = screen.getByRole('option');
    expect(option).toHaveTextContent("St. John's (City)");

    const highlight = option.querySelector('span > span');
    expect(highlight).toHaveTextContent("John's (City)");
  });
});
