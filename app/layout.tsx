import React from 'react';

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
      <body>{children}</body>
    </html>
  );
}
