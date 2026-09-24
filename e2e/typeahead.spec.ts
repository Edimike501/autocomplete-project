import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Typeahead Search E2E & Accessibility', () => {
  test('happy path: searches, navigates keyboard suggestions, and selects a place', async ({ page }) => {
    // Mock upstream /api/places response
    await page.route('**/api/places*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            name: 'Lagos',
            admin1: 'Lagos State',
            country: 'Nigeria',
            lat: 6.5244,
            lon: 3.3792,
          },
          {
            id: 2,
            name: 'Abuja',
            admin1: 'Federal Capital Territory',
            country: 'Nigeria',
            lat: 9.0765,
            lon: 7.3986,
          },
        ]),
      });
    });

    await page.goto('/');

    const input = page.getByRole('combobox', { name: 'Location Search' });
    await expect(input).toBeVisible();

    // Type query
    await input.fill('Lagos');

    // Verify dropdown suggestions render
    const listbox = page.getByRole('listbox', { name: 'Place suggestions' });
    await expect(listbox).toBeVisible();

    const options = page.getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.first()).toContainText('Lagos');

    // Keyboard navigation: ArrowDown to highlight 1st option, Enter to select
    await input.press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await input.press('Enter');

    // Verify dropdown closes and selected location card displays accurate details
    await expect(listbox).not.toBeVisible();

    const selectedCard = page.getByTestId('selected-place-card');
    await expect(selectedCard).toBeVisible();
    await expect(selectedCard).toContainText('Lagos');
    await expect(selectedCard).toContainText('Lagos State, Nigeria');
    await expect(selectedCard).toContainText('Coordinates: 6.5244, 3.3792');
  });

  test('error and recovery path: renders error message with retry and recovers gracefully', async ({
    page,
  }) => {
    let callCount = 0;
    await page.route('**/api/places*', async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Upstream geocoding service returned an error.' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 99,
              name: 'Enugu',
              admin1: 'Enugu State',
              country: 'Nigeria',
              lat: 6.4584,
              lon: 7.5464,
            },
          ]),
        });
      }
    });

    await page.goto('/');

    const input = page.getByRole('combobox', { name: 'Location Search' });
    await input.fill('Enugu');

    // Verify error alert is rendered with retry button
    const errorAlert = page.locator('li[role="alert"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('Upstream geocoding service returned an error.');

    const retryButton = errorAlert.getByRole('button', { name: 'Retry' });
    await expect(retryButton).toBeVisible();

    // Click retry button to recover
    await retryButton.click();

    // Verify suggestions list renders upon successful retry
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toContainText('Enugu');
  });

  test('accessibility scan: ensures zero accessibility violations across UI states', async ({
    page,
  }) => {
    await page.route('**/api/places*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            name: 'London',
            admin1: 'England',
            country: 'United Kingdom',
            lat: 51.5085,
            lon: -0.1257,
          },
        ]),
      });
    });

    await page.goto('/');

    // 1. Initial State Scan
    const initialScan = await new AxeBuilder({ page }).analyze();
    expect(initialScan.violations).toEqual([]);

    // 2. Open Dropdown State Scan
    const input = page.getByRole('combobox');
    await input.fill('London');
    await expect(page.getByRole('listbox')).toBeVisible();

    const openDropdownScan = await new AxeBuilder({ page }).analyze();
    expect(openDropdownScan.violations).toEqual([]);

    // 3. Selected Location Card State Scan
    await page.getByRole('option').first().click();
    await expect(page.getByTestId('selected-place-card')).toBeVisible();

    const selectedStateScan = await new AxeBuilder({ page }).analyze();
    expect(selectedStateScan.violations).toEqual([]);
  });
});
