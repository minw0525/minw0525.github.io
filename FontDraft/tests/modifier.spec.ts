import { test, expect, type Page } from './fixtures';
test.use({ hasTouch: true });

async function tapShift(page: Page) {
  const button = page.locator('#modifier'); await button.scrollIntoViewIfNeeded();
  const b = (await button.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}

// Chromium injects pen events; WebKit exercises the same tool flow with a mouse.
// Neither substitutes for simultaneous finger/Pencil verification on physical iPad.
async function draw(page: Page, browserName: string, a: { x: number; y: number }, b = a) {
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...a, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...b, button: 'left', buttons: 1, pointerType: 'pen' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...b, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
    await cdp.detach();
  } else {
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y); await page.mouse.up();
  }
}

 test('tapped Shift remains active for additive selection and 10 unit nudge, then toggles off', async ({ page, browserName }) => {
  await tapShift(page); await expect(page.locator('#modifier')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#modifier')).toContainText('고정');
  for (const id of ['outer-0', 'outer-1']) {
    const b = (await page.locator(`[data-node="${id}"]`).boundingBox())!;
    await draw(page, browserName, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
  }
  await expect(page.locator('.node.selected')).toHaveCount(2);
  await page.getByLabel('오른쪽으로 1 이동', { exact: true }).click();
  await expect(page.locator('[data-node="outer-0"]')).toHaveAttribute('data-x', '310');
  await tapShift(page); await expect(page.locator('#modifier')).toHaveAttribute('aria-pressed', 'false');
  const b = (await page.locator('[data-node="outer-2"]').boundingBox())!;
  await draw(page, browserName, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
  await expect(page.locator('.node.selected')).toHaveCount(1);
});

test('tapped Shift enables knife splitting after the finger is lifted', async ({ page, browserName }) => {
  const left = (await page.locator('[data-node="outer-3"]').boundingBox())!;
  const right = (await page.locator('[data-node="outer-1"]').boundingBox())!;
  const original = await page.locator('.glyph-fill').getAttribute('d');
  await page.locator('#knife-tool').click(); await tapShift(page);
  await expect(page.locator('#knife-tool')).toHaveAttribute('data-mode', 'split');
  await draw(page, browserName, { x: right.x + 40, y: right.y - 30 }, { x: (left.x + right.x) / 2, y: right.y - 30 });
  await expect(page.locator('.outline')).toHaveCount(1);
  await page.locator('#undo').click(); await expect(page.locator('.glyph-fill')).toHaveAttribute('d', original!);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modifier')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#knife-tool')).toHaveAttribute('data-mode', 'insert');
});

test('cancelled Shift does not latch, and losing page focus clears a latch', async ({ page }) => {
  const m = page.locator('#modifier');
  const b = (await m.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await expect(m).toHaveAttribute('aria-pressed', 'true');
  await m.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await page.mouse.up(); await expect(m).toHaveAttribute('aria-pressed', 'false');
  await tapShift(page); await expect(m).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(m).toHaveAttribute('aria-pressed', 'false');
});
