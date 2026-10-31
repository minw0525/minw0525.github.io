import { test, expect } from './fixtures';

test('editing keys remain fixed while palettes scroll and share key styling', async ({ page }, info) => {
  const keys = page.locator('#editing-keys');
  await expect(keys.locator('button')).toHaveCount(7);
  const before = await keys.boundingBox();
  await page.locator('.inspector').evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await page.locator('.inspector').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await keys.boundingBox()).toEqual(before);
  expect(await keys.locator('button').evaluateAll(buttons => new Set(buttons.map(button => {
    const s = getComputedStyle(button);
    return [s.height, s.borderWidth, s.borderRadius, s.backgroundColor].join('/');
  })).size)).toBe(1);
  const up = (await keys.locator('[data-nudge="0,1"]').boundingBox())!;
  const left = (await keys.locator('[data-nudge="-1,0"]').boundingBox())!;
  expect(up.width).toBeGreaterThanOrEqual(52);
  expect(up.y).toBeLessThan(left.y);
  expect(up.x).toBeGreaterThan(left.x);
  await page.screenshot({ path: info.outputPath('fixed-keys-tablet.png') });
});

test('phone editing keys sit below the workspace without horizontal overflow', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const keys = (await page.locator('#editing-keys').boundingBox())!;
  const canvas = (await page.locator('#canvas').boundingBox())!;
  expect(keys.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
  expect(keys.y + keys.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  for (const button of await page.locator('#editing-keys button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBe(52);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: info.outputPath('fixed-keys-phone.png') });
});
