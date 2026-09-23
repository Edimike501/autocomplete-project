import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTypeahead } from '@/hooks/useTypeahead';
import type { Place } from '@/types/places';

export interface TypeaheadProps {
  onSelect?: (place: Place) => void;
  placeholder?: string;
  label?: string;
}

/**
 * Escapes special regex characters in search strings.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Renders text with matching query substrings safely highlighted.
 */
function HighlightText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) {
    return <>{text}</>;
  }

  const regex = new RegExp(`(${escapeRegExp(trimmed)})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <span
            key={index}
            className="font-bold text-emerald-700 bg-emerald-100/70 rounded-xs px-0.5"
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

export function Typeahead({
  onSelect,
  placeholder = 'Search for a city or town...',
  label = 'Search Location',
}: TypeaheadProps) {
  const { query, setQuery, results, status, error, retry } = useTypeahead();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync dropdown visibility with search status and results
  useEffect(() => {
    if (status === 'loading' || status === 'success' || status === 'empty' || status === 'error') {
      setIsOpen(true);
    } else if (status === 'idle') {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  }, [status]);

  // Reset highlighted option index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelectPlace = useCallback(
    (place: Place) => {
      setSelectedPlace(place);
      setQuery(place.name);
      setIsOpen(false);
      setSelectedIndex(-1);
      if (onSelect) {
        onSelect(place);
      }
    },
    [onSelect, setQuery]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        setIsOpen(true);
        return;
      }
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (results.length === 0) return;
        setSelectedIndex((prev) => (prev + 1) % results.length);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (results.length === 0) return;
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
        break;
      }
      case 'Home': {
        event.preventDefault();
        if (results.length === 0) return;
        setSelectedIndex(0);
        break;
      }
      case 'End': {
        event.preventDefault();
        if (results.length === 0) return;
        setSelectedIndex(results.length - 1);
        break;
      }
      case 'Enter': {
        if (isOpen && selectedIndex >= 0 && selectedIndex < results.length) {
          event.preventDefault();
          handleSelectPlace(results[selectedIndex]);
        }
        break;
      }
      case 'Escape': {
        event.preventDefault();
        setQuery('');
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
      }
      case 'Tab': {
        setIsOpen(false);
        break;
      }
      default:
        break;
    }
  };

  // Generate accessible live region announcement text
  const getAnnouncementText = (): string => {
    if (status === 'loading') return 'Searching for places...';
    if (status === 'success')
      return `${results.length} place${results.length === 1 ? '' : 's'} found.`;
    if (status === 'empty') return `No places found for "${query}".`;
    if (status === 'error') return `Error: ${error || 'Failed to fetch places.'}`;
    return '';
  };

  const activeOptionId =
    isOpen && selectedIndex >= 0 && selectedIndex < results.length
      ? `typeahead-option-${selectedIndex}`
      : undefined;

  return (
    <div ref={containerRef} className="flex flex-col gap-4 w-full max-w-lg mx-auto text-slate-800">
      <label htmlFor="typeahead-input" className="text-sm font-semibold text-slate-700">
        {label}
      </label>

      <div className="relative w-full">
        <input
          ref={inputRef}
          id="typeahead-input"
          type="text"
          role="combobox"
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-600/30"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen && e.target.value.trim().length >= 2) {
              setIsOpen(true);
            }
          }}
          onFocus={() => {
            if (query.trim().length >= 2 && status !== 'idle') {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          aria-expanded={isOpen}
          aria-controls="typeahead-listbox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-activedescendant={activeOptionId}
        />

        {/* Visually hidden live region for screen readers */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {getAnnouncementText()}
        </div>

        {/* Combobox Dropdown Results */}
        {isOpen && (
          <ul
            id="typeahead-listbox"
            role="listbox"
            className="absolute top-[calc(100%+0.375rem)] left-0 right-0 z-50 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg list-none m-0"
            aria-label="Place suggestions"
          >
            {status === 'loading' && (
              <li className="p-4 text-sm text-slate-500 text-center" role="status">
                Loading places...
              </li>
            )}

            {status === 'empty' && (
              <li className="p-4 text-sm text-slate-500 text-center" role="status">
                No places found for &quot;{query}&quot;
              </li>
            )}

            {status === 'error' && (
              <li
                className="flex items-center justify-between gap-3 p-3.5 text-sm text-red-700 bg-red-50 border-y sm:border sm:rounded-md border-red-100"
                role="alert"
              >
                <span>{error || 'An error occurred while fetching places.'}</span>
                <button
                  type="button"
                  className="px-2.5 py-1 text-xs font-semibold text-red-700 bg-white border border-red-300 rounded hover:bg-red-100 transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                  onClick={() => retry()}
                >
                  Retry
                </button>
              </li>
            )}

            {status === 'success' &&
              results.map((place, index) => {
                const isSelected = selectedIndex === index;
                const metaText = [place.admin1, place.country].filter(Boolean).join(', ');

                return (
                  <li
                    key={place.id}
                    id={`typeahead-option-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`flex flex-col gap-0.5 px-4 py-2.5 cursor-pointer select-none transition border-l-3 ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950 border-emerald-600 font-medium'
                        : 'text-slate-700 border-transparent hover:bg-slate-50'
                    }`}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onMouseDown={(e) => {
                      // Prevent input blur before click selection executes
                      e.preventDefault();
                    }}
                    onClick={() => handleSelectPlace(place)}
                  >
                    <span className="text-[0.9375rem] font-medium text-slate-900">
                      <HighlightText text={place.name} query={query} />
                    </span>
                    {metaText && <span className="text-xs text-slate-500">{metaText}</span>}
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {/* Selected Location Card */}
      {selectedPlace && (
        <div
          className="mt-2 p-4 bg-white border border-slate-200 rounded-lg flex flex-col gap-1.5 shadow-xs"
          data-testid="selected-place-card"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
            Selected Location
          </div>
          <div className="text-lg font-semibold text-slate-900">{selectedPlace.name}</div>
          <div className="text-sm text-slate-600">
            {[selectedPlace.admin1, selectedPlace.country].filter(Boolean).join(', ') ||
              'No regional metadata'}
          </div>
          <div className="text-sm text-slate-600">
            Coordinates: {selectedPlace.lat.toFixed(4)}, {selectedPlace.lon.toFixed(4)}
          </div>
        </div>
      )}
    </div>
  );
}
