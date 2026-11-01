import { test, expect } from './fixtures';

test('marquee can start over a neighboring glyph cell without switching glyph', async ({ page }) => {
  await page.locator('#text-run').fill('ooo'); await page.locator('#text-run').blur();
  await expect(page.locator('.neighbor-fill')).toHaveCount(2);
  const canvas = (await page.locator('#canvas').boundingBox())!;
  const right = Number(await page.locator('.sidebearing').last().getAttribute('x1')) + canvas.x;
  const top = (await page.locator('[data-node="outer-0"]').boundingBox())!;
  const left = (await page.locator('[data-node="outer-3"]').boundingBox())!;
  const bottom = (await page.locator('[data-node="outer-2"]').boundingBox())!;
  await page.mouse.move(right + 20, left.y + 25); await page.mouse.down();
  await page.mouse.move(left.x - 20, top.y - 20, { steps: 6 });
  await expect(page.locator('#marquee')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.node.selected')).toHaveCount(6);
});

test('marquee includes pointerup position even without an intermediate move', async ({ page }) => {
  const top = (await page.locator('[data-node="outer-0"]').boundingBox())!;
  const left = (await page.locator('[data-node="outer-3"]').boundingBox())!;
  const right = (await page.locator('[data-node="outer-1"]').boundingBox())!;
  const bottom = (await page.locator('[data-node="outer-2"]').boundingBox())!;
  await page.locator('#canvas').evaluate((el, p) => {
    const capture = el.setPointerCapture; el.setPointerCapture = () => {};
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, pointerType: 'pen', button: 0, buttons: 1, clientX: p.left.x - 25, clientY: p.top.y - 25 }));
    el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, pointerType: 'pen', button: 0, buttons: 0, clientX: p.right.x + 25, clientY: p.bottom.y + 25 }));
    el.setPointerCapture = capture;
  }, { top, left, right, bottom });
  await expect(page.locator('.node.selected')).toHaveCount(8);
});

test('each palette folds by its heading and remembers its own state', async ({ page }) => {
  const keys = await page.locator('#editing-keys').boundingBox();
  const glyph = page.locator('#glyph-panel-title button');
  await glyph.click(); await expect(glyph).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#glyph-properties')).toBeHidden();
  await expect(page.locator('#node-panel-title button')).toHaveAttribute('aria-expanded', 'true');
  expect(await page.locator('#editing-keys').boundingBox()).toEqual(keys);
  await page.locator('#brush-tool').click();
  const brush = page.locator('#tip-title button');
  await brush.click(); await expect(page.locator('#tip-preview')).toBeHidden();
  await page.locator('#eraser-tool').click();
  await expect(brush).toHaveText('ERASER'); await expect(brush).toHaveAttribute('aria-expanded', 'false');
  await brush.focus(); await page.keyboard.press('Enter'); await expect(page.locator('#tip-preview')).toBeVisible();
  await page.reload(); await expect(glyph).toHaveAttribute('aria-expanded', 'false');
  await glyph.click(); await expect(page.locator('#glyph-properties')).toBeVisible();
});

test('compact transforms retain 44px targets and fit beside the pivot grid', async ({ page }, info) => {
  await page.locator('#canvas').focus(); await page.keyboard.press('Meta+a');
  const origin = (await page.locator('#transform-origin').boundingBox())!;
  const flip = (await page.locator('.flip-controls').boundingBox())!;
  expect(flip.x).toBeGreaterThanOrEqual(origin.x + origin.width);
  expect(flip.y + flip.height).toBeLessThanOrEqual(origin.y + origin.height);
  expect((await page.locator('#transform-controls').boundingBox())!.height).toBeLessThan(570);
  for (const el of await page.locator('#transform-controls button').all()) {
    const box = (await el.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.locator('.inspector').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('#glyph-panel-title button').click();
  await page.locator('#node-panel-title button').click();
  await page.locator('#transform-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('compact-transform.png') });
});
