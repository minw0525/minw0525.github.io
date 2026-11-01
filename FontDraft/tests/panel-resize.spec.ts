import { test, expect } from './fixtures';

test('both panel widths resize, persist, and follow reversed layout', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  for (const [name, selector, dx] of [['사이드패널 폭', '.sidebar', -60], ['글리프 목록 폭', '.glyphs', 50]] as const) {
    const grip = page.getByRole('separator', { name });
    const before = (await page.locator(selector).boundingBox())!.width;
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 100); await page.mouse.down();
    await page.mouse.move(box.x + 5 + dx, box.y + 100); await page.mouse.up();
    expect((await page.locator(selector).boundingBox())!.width).toBe(before + Math.abs(dx));
  }
  await page.reload();
  await expect(page.getByRole('separator', { name: '사이드패널 폭' })).toHaveAttribute('aria-valuenow', '268');
  await expect(page.getByRole('separator', { name: '글리프 목록 폭' })).toHaveAttribute('aria-valuenow', '146');
  await page.locator('#app').evaluate(el => el.classList.add('sidebar-left'));
  const grip = page.getByRole('separator', { name: '사이드패널 폭' });
  await grip.focus(); await page.keyboard.press('ArrowRight');
  await expect(grip).toHaveAttribute('aria-valuenow', '284');
  await page.getByRole('separator', { name: '글리프 목록 폭' }).focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('separator', { name: '글리프 목록 폭' })).toHaveAttribute('aria-valuenow', '162');
});

test('minimum panel widths have no horizontal overflow and adapt to phone', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  for (const selector of ['.sidebar', '.inspector', '.inspector-panel', '.glyphs', '#glyph-list', '#editing-keys']) {
    const overflowing = await page.locator(selector).evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth).map(el => [el.id, el.scrollWidth, el.clientWidth]));
    expect(overflowing, selector).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar > .panel-resize')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
