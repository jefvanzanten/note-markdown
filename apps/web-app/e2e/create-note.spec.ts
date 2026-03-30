import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('/api/workspace', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ path: '/mock/notes', name: 'Mock Workspace' }),
    })
  );
  await page.route('/api/files', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  );
  await page.goto('/');
});

test('"+" button is visible in the tab bar', async ({ page }) => {
  await expect(page.getByTestId('new-tab-btn')).toBeVisible();
});

test('clicking "+" opens a new untitled tab', async ({ page }) => {
  await page.getByTestId('new-tab-btn').click();
  await expect(page.locator('.tab-title', { hasText: 'untitled' })).toBeVisible();
});

test('new tab shows the editor pane', async ({ page }) => {
  await page.getByTestId('new-tab-btn').click();
  await expect(page.locator('.editor-pane')).toBeVisible();
  await expect(page.locator('.empty-editor')).not.toBeVisible();
});

test('second "+" click produces "untitled (2)"', async ({ page }) => {
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('new-tab-btn').click();
  await expect(page.locator('.tab-title', { hasText: 'untitled (2)' })).toBeVisible();
});

test('Ctrl+S on new draft prompts for filename and saves', async ({ page }) => {
  page.on('dialog', async dialog => {
    await dialog.accept('my-new-note.md');
  });
  await page.route('/api/file*', route => {
    if (route.request().method() === 'PUT')
      return route.fulfill({ status: 200, body: 'OK' });
    return route.continue();
  });
  await page.route('/api/files', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ path: '/mock/notes/my-new-note.md', name: 'my-new-note.md' }]),
    })
  );

  await page.getByTestId('new-tab-btn').click();
  await page.keyboard.press('Control+s');

  await expect(page.locator('.dirty')).not.toBeVisible();
  await expect(page.locator('.tab-title', { hasText: 'my-new-note.md' })).toBeVisible();
});
