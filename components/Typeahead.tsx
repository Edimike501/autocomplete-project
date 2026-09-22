import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTypeahead } from '@/hooks/useTypeahead';
import type { Place } from '@/types/places';
import styles from './Typeahead.module.css';

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
          <span key={index} className={styles.matchHighlight}>
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
    <div ref={containerRef} className={styles.container}>
      <label htmlFor="typeahead-input" className={styles.label}>
        {label}
      </label>

      <div className={styles.comboboxWrapper}>
        <input
          ref={inputRef}
          id="typeahead-input"
          type="text"
          role="combobox"
          className={styles.input}
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
        <div className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">
          {getAnnouncementText()}
        </div>

        {/* Combobox Dropdown Results */}
        {isOpen && (
          <ul id="typeahead-listbox" role="listbox" className={styles.dropdown} aria-label="Place suggestions">
            {status === 'loading' && (
              <li className={styles.statusMessage} role="status">
                Loading places...
              </li>
            )}

            {status === 'empty' && (
              <li className={styles.statusMessage} role="status">
                No places found for &quot;{query}&quot;
              </li>
            )}

            {status === 'error' && (
              <li className={styles.errorMessage} role="alert">
                <span>{error || 'An error occurred while fetching places.'}</span>
                <button type="button" className={styles.retryButton} onClick={() => retry()}>
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
                    className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onMouseDown={(e) => {
                      // Prevent input blur before click selection executes
                      e.preventDefault();
                    }}
                    onClick={() => handleSelectPlace(place)}
                  >
                    <span className={styles.optionName}>
                      <HighlightText text={place.name} query={query} />
                    </span>
                    {metaText && <span className={styles.optionMeta}>{metaText}</span>}
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {/* Selected Location Card */}
      {selectedPlace && (
        <div className={styles.selectedCard} data-testid="selected-place-card">
          <div className={styles.selectedTitle}>Selected Location</div>
          <div className={styles.selectedName}>{selectedPlace.name}</div>
          <div className={styles.selectedDetails}>
            {[selectedPlace.admin1, selectedPlace.country].filter(Boolean).join(', ') || 'No regional metadata'}
          </div>
          <div className={styles.selectedDetails}>
            Coordinates: {selectedPlace.lat.toFixed(4)}, {selectedPlace.lon.toFixed(4)}
          </div>
        </div>
      )}
    </div>
  );
}
