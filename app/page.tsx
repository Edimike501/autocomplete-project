'use client';

import React from 'react';
import { Typeahead } from '@/components/Typeahead';

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '3rem 1rem', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '36rem', margin: '0 auto', textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
          Property Location Search
        </h1>
        <p style={{ fontSize: '1rem', color: '#64748b', margin: 0 }}>
          Search for cities and towns across Nigeria and worldwide.
        </p>
      </div>

      <Typeahead
        label="Location Search"
        placeholder="Type at least 2 characters (e.g. Lagos, Abuja)..."
      />
    </main>
  );
}
