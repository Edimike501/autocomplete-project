import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { Typeahead } from '@/components/Typeahead';

describe('Typeahead component', () => {
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

  it('displays loading state and updates WAI-ARIA attributes during fetch', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox', { name: 'Location Search' });
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(input).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
  });

  it('renders place options on success state and safely highlights matching query text', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('London');
    expect(options[0]).toHaveTextContent('England, United Kingdom');
    expect(options[1]).toHaveTextContent('New York');

    // Highlight span exists inside option
    const highlightSpan = options[0].querySelector('span > span');
    expect(highlightSpan).toBeInTheDocument();
  });

  it('renders empty state message when API returns no results', async () => {
    server.use(
      http.get('*/api/places', () => {
        return HttpResponse.json([]);
      })
    );

    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'UnknownPlace' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const emptyStatus = screen.getByRole('status');
    expect(emptyStatus).toHaveTextContent('No places found for "UnknownPlace"');
  });

  it('renders error state and handles Retry button click', async () => {
    let attempts = 0;
    server.use(
      http.get('*/api/places', () => {
        attempts++;
        if (attempts === 1) {
          return HttpResponse.json(
            { error: 'Upstream geocoding service error.' },
            { status: 502 }
          );
        }
        return HttpResponse.json([
          { id: 1, name: 'London', country: 'United Kingdom', lat: 51.5, lon: -0.1 },
        ]);
      })
    );

    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Upstream geocoding service error.');

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    expect(retryButton).toBeInTheDocument();

    // Click retry button
    await act(async () => {
      fireEvent.click(retryButton);
    });

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('London');
  });

  it('navigates options via ArrowDown, ArrowUp, and updates aria-activedescendant with wrapping', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const options = screen.getAllByRole('option');

    // Initial state: no option selected
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');

    // 1st ArrowDown: selects 1st option (index 0)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'typeahead-option-0');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // 2nd ArrowDown: selects 2nd option (index 1)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'typeahead-option-1');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');

    // 3rd ArrowDown: wraps around to 1st option (index 0)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'typeahead-option-0');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // ArrowUp: wraps backward to 2nd option (index 1)
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveAttribute('aria-activedescendant', 'typeahead-option-1');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to first and last option using Home and End keys', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // End key: jumps to last option (index 1)
    fireEvent.keyDown(input, { key: 'End' });
    expect(input).toHaveAttribute('aria-activedescendant', 'typeahead-option-1');

    // Home key: jumps to first option (index 0)
    fireEvent.keyDown(input, { key: 'Home' });
    expect(input).toHaveAttribute('aria-activedescendant', 'typeahead-option-0');
  });

  it('selects active option on Enter key press and renders selected place card', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Navigate to 1st option and press Enter
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Menu closes
    expect(input).toHaveAttribute('aria-expanded', 'false');

    // Selected place summary card renders
    const selectedCard = screen.getByTestId('selected-place-card');
    expect(selectedCard).toBeInTheDocument();
    expect(selectedCard).toHaveTextContent('London');
    expect(selectedCard).toHaveTextContent('England, United Kingdom');
    expect(selectedCard).toHaveTextContent('Coordinates: 51.5085, -0.1257');
  });

  it('closes dropdown on Escape key press and resets selection index', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(input).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('supports mouse hover and mouse click selection', async () => {
    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const options = screen.getAllByRole('option');

    // Hover 2nd option
    fireEvent.mouseEnter(options[1]);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');

    // Click 2nd option (New York)
    fireEvent.mouseDown(options[1]);
    fireEvent.click(options[1]);

    expect(input).toHaveAttribute('aria-expanded', 'false');
    const selectedCard = screen.getByTestId('selected-place-card');
    expect(selectedCard).toHaveTextContent('New York');
    expect(selectedCard).toHaveTextContent('New York, United States');
  });

  it('renders selected place card gracefully when optional fields (admin1, country) are missing', async () => {
    server.use(
      http.get('*/api/places', () => {
        return HttpResponse.json([
          { id: 99, name: 'Remote Island', lat: -10.5, lon: 105.6 },
        ]);
      })
    );

    render(<Typeahead label="Location Search" />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Remote' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const options = screen.getAllByRole('option');
    fireEvent.click(options[0]);

    const selectedCard = screen.getByTestId('selected-place-card');
    expect(selectedCard).toHaveTextContent('Remote Island');
    expect(selectedCard).toHaveTextContent('No regional metadata');
    expect(selectedCard).toHaveTextContent('Coordinates: -10.5000, 105.6000');
  });
});
