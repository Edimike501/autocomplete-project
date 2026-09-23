'use client';

import React from 'react';
import { Typeahead } from '@/components/Typeahead';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-xl text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
          Property Location Search
        </h1>
        <p className="text-base text-slate-600">
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
