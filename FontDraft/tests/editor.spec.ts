import { wheelZoom, contourPoint } from './fixtures';
import { expect, test, type Page } from './fixtures';

async function nodePoint(page: Page, id: string) {
  let box: Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>> = null;
  await expect.poll(async () => { box = await page.locator(`[data-node="${id}"]`).boundingBox(); return !!box; }).toBe(true);
  if (!box) throw new Error(`Missing node: ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function coordinates(page: Page, prefix: string) {
  return page.locator(`[data-node^="${prefix}"]`).evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-node'), n.getAttribute('data-x'), n.getAttribute('data-y')]).sort((a,b) => a[0]!.localeCompare(b[0]!)));
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.locator('.node')).toHaveCount(8); });

test('S01: double tap selects just one contour, leaving the counter untouched', async ({ page }) => {
  const p = await nodePoint(page, 'outer-0');
  const q = await contourPoint(page); await page.mouse.dblclick(q.x + 3, q.y);
  await expect(page.locator('.node.selected')).toHaveCount(4);
  await expect(page.locator('[data-node^="inner"].selected')).toHaveCount(0);
});

test('S02: node hit margin stays constant at different zoom levels', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    const p = await nodePoint(page, 'outer-0');
    await page.mouse.click(p.x + 12, p.y);
    await expect(page.locator('[data-node="outer-0"]')).toHaveClass(/selected/);
    await page.keyboard.press('Escape');
    await page.mouse.click(p.x, p.y - 16);
    await expect(page.locator('.node.selected')).toHaveCount(0);
    await wheelZoom(page,112);
  }
});

test('S03: modifier adds and removes nodes without clearing other selections', async ({ page }) => {
  const a = await nodePoint(page, 'outer-0'), b = await nodePoint(page, 'inner-1');
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  await expect(page.locator('.node.selected')).toHaveCount(2);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('.node.selected')).toHaveCount(1);
  await expect(page.locator('[data-node="inner-1"]')).toHaveClass(/selected/);
});

test('moving one contour preserves the other, with one-step Undo and Redo', async ({ page }) => {
  const inner = await coordinates(page, 'inner'), outer = await coordinates(page, 'outer');
  const p = await nodePoint(page, 'outer-0');
  const q = await contourPoint(page); await page.mouse.dblclick(q.x, q.y);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(p.x + 35, p.y + 20, { steps: 5 }); await page.mouse.up();
  expect(await coordinates(page, 'inner')).toEqual(inner);
  const changed = await coordinates(page, 'outer'); expect(changed).not.toEqual(outer);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await coordinates(page, 'outer')).toEqual(outer);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  expect(await coordinates(page, 'outer')).toEqual(changed);
});

test('handle drag changes the curve without moving nodes and can be undone', async ({ page }) => {
  await page.keyboard.press('Escape');
  const before = await page.locator('.glyph-fill').getAttribute('d');
  const nodes = await coordinates(page, 'outer');
  const box = (await page.locator('[data-handle="outer-0-outgoing"]').boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4); await page.mouse.down();
  await page.mouse.move(box.x + 35, box.y + 30); await page.mouse.up();
  expect(await coordinates(page, 'outer')).toEqual(nodes);
  expect(await page.locator('.glyph-fill').getAttribute('d')).not.toEqual(before);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await page.locator('.glyph-fill').getAttribute('d')).toEqual(before);
});

test('I02: pointer cancellation rolls back a partial drag', async ({ page }) => {
  const before = await coordinates(page, 'outer');
  await page.evaluate(() => {
    const canvas = document.querySelector('#canvas')!;
    canvas.addEventListener('pointerdown', e => canvas.setAttribute('data-pointer', String((e as PointerEvent).pointerId)), { once: true });
  });
  const p = await nodePoint(page, 'outer-0');
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 50, p.y);
  expect(await coordinates(page, 'outer')).not.toEqual(before);
  await page.locator('#canvas').evaluate(el => el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: Number(el.getAttribute('data-pointer')), bubbles: true })));
  await page.mouse.up();
  expect(await coordinates(page, 'outer')).toEqual(before);
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
});

test('I01: held overlay touch plus pen drag adds selection, release does not change gesture', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  const a = await nodePoint(page, 'outer-0'), b = await nodePoint(page, 'inner-0');
  await page.mouse.click(a.x, a.y);
  const m = (await page.locator('#modifier').boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: m.x + 30, y: m.y + 30, id: 1 }] });
  await expect(page.locator('#modifier')).toHaveAttribute('aria-pressed', 'true');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x + 20, y: b.y, button: 'left', buttons: 1, pointerType: 'pen' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x + 20, y: b.y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  await expect(page.locator('.node.selected')).toHaveCount(2);
  await expect(page.locator('#modifier')).toHaveAttribute('aria-pressed', 'false');
  expect(Number(await page.locator('[data-node="outer-0"]').getAttribute('data-x'))).toBeGreaterThan(300);
});

test('two-finger pinch changes view without changing outline coordinates', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page), before = await coordinates(page, '');
  const box = (await page.locator('#canvas').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const zoom = await page.locator('.glyph-fill').getAttribute('d');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 60, y, id: 1 }, { x: x + 60, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 100, y, id: 1 }, { x: x + 100, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.locator('.glyph-fill').getAttribute('d')).not.toEqual(zoom);
  expect(await coordinates(page, '')).toEqual(before);
});

test('iPhone-sized layout keeps canvas and modifier in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('#modifier')).toBeVisible();
  await expect.poll(async()=> (await nodePoint(page,'outer-0')).x).toBeLessThan(390);
  const p = await nodePoint(page, 'outer-0');expect(p.x).toBeGreaterThan(0);
  const q = await contourPoint(page); await page.mouse.dblclick(q.x, q.y);
  await expect(page.locator('.node.selected')).toHaveCount(4);
});
