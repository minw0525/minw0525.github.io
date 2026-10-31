import { test, expect } from './fixtures';

test('two finger tap undoes and three finger tap redoes without drawing or moving the view', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native multi-touch injection requires CDP');
  const cdp = await context.newCDPSession(page), b = (await page.locator('#canvas').boundingBox())!;
  const points = [0, 1, 2].map(i => ({ x: b.x + 90 + i * 55, y: b.y + 110, id: i + 1 }));
  await page.locator('#rectangle-tool').click();
  await page.mouse.move(b.x + 60, b.y + 60); await page.mouse.down(); await page.mouse.move(b.x + 130, b.y + 150); await page.mouse.up();
  await expect(page.locator('.outline')).toHaveCount(3);
  await page.locator('#brush-tool').click(); await page.locator('#finger-tools').check();
  const position = await page.locator('[data-node="outer-0"]').evaluate((n: SVGGraphicsElement) => n.getBBox().x);
  const tap = async (count: number) => {
    for (let n = 1; n <= count; n++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.slice(0, n) });
    // Release one contact first: undo/redo must wait until every contact is up.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: points.slice(1, count) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await tap(2); await expect(page.locator('.outline')).toHaveCount(2);
  expect(await page.locator('[data-node="outer-0"]').evaluate((n: SVGGraphicsElement) => n.getBBox().x)).toBe(position);
  await tap(3); await expect(page.locator('.outline')).toHaveCount(3);
  expect(await page.locator('[data-node="outer-0"]').evaluate((n: SVGGraphicsElement) => n.getBBox().x)).toBe(position);
  // Finger drawing preference does not disable the history gesture.
  await page.locator('#finger-tools').uncheck(); await tap(2); await expect(page.locator('.outline')).toHaveCount(2);
  await tap(3); await expect(page.locator('.outline')).toHaveCount(3);
});

test('pan, long press, four contacts and cancellation do not undo', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native multi-touch injection requires CDP');
  const cdp = await context.newCDPSession(page), b = (await page.locator('#canvas').boundingBox())!;
  await page.locator('#rectangle-tool').click();
  await page.mouse.move(b.x + 60, b.y + 60); await page.mouse.down(); await page.mouse.move(b.x + 130, b.y + 150); await page.mouse.up();
  const points = [0, 1, 2, 3].map(i => ({ x: b.x + 90 + i * 45, y: b.y + 110, id: i + 1 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.slice(0, 2) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points.slice(0, 2).map(p => ({ ...p, x: p.x + 30 })) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.outline')).toHaveCount(3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.slice(0, 2) });
  await page.waitForTimeout(400);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.outline')).toHaveCount(3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.outline')).toHaveCount(3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.slice(0, 2) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.outline')).toHaveCount(3);
});
