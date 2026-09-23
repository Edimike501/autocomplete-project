import React from 'react';
import './globals.css';

export const metadata = {
  title: 'Autocomplete Project',
  description: 'Typeahead search component',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
