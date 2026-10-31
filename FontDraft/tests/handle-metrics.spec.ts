import { test, expect } from './fixtures';

test('single handle coordinates edit the handle, preserve smooth tangency and undo', async ({ page }) => {
  await page.evaluate(async () => {
    const { loadWorkspace, saveDraft } = await import('/src/project.ts');
    const w = await loadWorkspace(), p = w.projects.find(p => p.id === w.last)!;
    p.glyphs.find(g => g.id === p.activeGlyph)!.contours[0].nodes[0].smooth = true;
    await saveDraft(p);
  });
  await page.reload();
  const handle = page.locator('[data-handle="outer-0-outgoing"]');
  const box = (await handle.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const x = page.getByLabel('핸들 X', { exact: true }), y = page.getByLabel('핸들 Y', { exact: true });
  await expect(x).toBeVisible();
  const oldX = await x.inputValue(), oldY = await y.inputValue();
  const node = page.locator('[data-node="outer-0"]'), nodeX = await node.getAttribute('data-x'), nodeY = await node.getAttribute('data-y');
  await y.fill(String(Number(oldY) + 30)); await y.blur();
  await expect(y).toHaveValue(String(Number(oldY) + 30));
  await expect(node).toHaveAttribute('data-x', nodeX!); await expect(node).toHaveAttribute('data-y', nodeY!);
  await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');
  const cross = await page.evaluate(async () => {
    const { loadWorkspace } = await import('/src/project.ts');
    const w = await loadWorkspace(), p = w.projects.find(p => p.id === w.last)!;
    const n = p.glyphs.find(g => g.id === p.activeGlyph)!.contours[0].nodes[0];
    return Math.abs((n.incoming!.x - n.x) * (n.outgoing!.y - n.y) - (n.incoming!.y - n.y) * (n.outgoing!.x - n.x)) / Math.hypot(n.outgoing!.x - n.x, n.outgoing!.y - n.y);
  });
  expect(cross).toBeLessThan(1.5); // Integer grid takes priority over exact tangency.
  await page.locator('#undo').click(); await expect(y).toHaveValue(oldY); await expect(x).toHaveValue(oldX);
  await page.keyboard.down('Shift');
  const other = (await page.locator('[data-handle="outer-0-incoming"]').boundingBox())!;
  await page.mouse.click(other.x + other.width / 2, other.y + other.height / 2);
  await page.keyboard.up('Shift'); await expect(page.locator('#coordinates')).toBeHidden();
});

test('sidebearings use cubic extrema rather than off-curve control coordinates', async ({ page }) => {
  const bounds = await page.evaluate(async () => {
    const { loadWorkspace, saveDraft } = await import('/src/project.ts');
    const { outlineBounds } = await import('/src/geometry.ts');
    const w = await loadWorkspace(), p = w.projects.find(p => p.id === w.last)!;
    const g = p.glyphs.find(g => g.id === p.activeGlyph)!;
    g.width = 600;
    g.contours = [{ id: 'bulge', closed: true, nodes: [
      { id: 'a', x: 100, y: 0, outgoing: { x: -100, y: 0 } },
      { id: 'b', x: 100, y: 300, incoming: { x: -100, y: 300 } },
      { id: 'c', x: 300, y: 300, outgoing: { x: 500, y: 300 } },
      { id: 'd', x: 300, y: 0, incoming: { x: 500, y: 0 } },
    ] }];
    await saveDraft(p); return outlineBounds(g.contours);
  });
  expect(bounds).toEqual({ left: -50, right: 450, bottom: 0, top: 300 });
  await page.reload();
  const lsb = page.getByLabel('LSB', { exact: true }), rsb = page.getByLabel('RSB', { exact: true });
  await expect(lsb).toHaveValue('-50'); await expect(rsb).toHaveValue('150');
  await rsb.fill('80'); await rsb.blur(); await expect(page.getByLabel('글리프 폭', { exact: true })).toHaveValue('530');
  await lsb.fill('0'); await lsb.blur(); await expect(rsb).toHaveValue('80');
  await expect(page.getByLabel('글리프 폭', { exact: true })).toHaveValue('580');
});

test('node-only selection excludes handles, carries them when moved, and permits independent handle selection', async ({ page }) => {
  const node = page.locator('[data-node="outer-0"]');
  const box = (await node.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.node.selected')).toHaveCount(1);
  await expect(page.locator('.handle.selected, .handle-line.selected')).toHaveCount(0);
  await expect(page.locator('#selection-title')).toHaveText('1 노드');
  const before = await page.locator('[data-handle^="outer-0-"]').evaluateAll(elements => elements.map(e => Number(e.getAttribute('cx'))));
  const x = await node.evaluate((n: SVGGraphicsElement) => n.getBBox().x);
  await page.keyboard.press('ArrowRight');
  const delta = await node.evaluate((n: SVGGraphicsElement) => n.getBBox().x) - x;
  const after = await page.locator('[data-handle^="outer-0-"]').evaluateAll(elements => elements.map(e => Number(e.getAttribute('cx'))));
  after.forEach((value, i) => expect(value - before[i]).toBeCloseTo(delta));
  await expect(page.locator('.handle.selected')).toHaveCount(0);
  const h = (await page.locator('[data-handle="outer-0-outgoing"]').boundingBox())!;
  await page.mouse.click(h.x + h.width / 2, h.y + h.height / 2);
  await expect(page.locator('.node.selected')).toHaveCount(0);
  await expect(page.locator('.handle.selected')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(node).toHaveCount(1);
  await expect(page.locator('[data-handle="outer-0-incoming"]')).toHaveCount(1);
  await expect(page.locator('[data-handle="outer-0-outgoing"]')).toHaveCount(0);
  await page.locator('#undo').click();
  const restored = (await node.boundingBox())!;
  await page.mouse.click(restored.x + restored.width / 2, restored.y + restored.height / 2);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(node).toHaveCount(0);
  await expect(page.locator('[data-node^="outer-"]')).toHaveCount(3);
  await expect(page.locator('[data-handle^="outer-"]')).toHaveCount(6);
});
