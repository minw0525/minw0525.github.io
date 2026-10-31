import { contourPoint } from './fixtures';
import { expect, test, type Page } from './fixtures';

async function point(page: Page, node: string) {
  const b = (await page.locator(`[data-node="${node}"]`).boundingBox())!;
  return { x: b.x + 4, y: b.y + 4 };
}
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
}
async function originalNodes(page: Page) {
  return page.locator('[data-node^="outer"], [data-node^="inner"]').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-node'), n.getAttribute('data-x'), n.getAttribute('data-y')]));
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.locator('.node')).toHaveCount(8); });

test('rectangle and ellipse add independent contours with one-action undo', async ({ page }) => {
  const original = await originalNodes(page);
  const a = await point(page, 'inner-3'), b = await point(page, 'inner-1');
  for (const tool of ['사각형', '타원']) {
    await page.getByRole('button', { name: tool, exact: true }).click();
    await drag(page, { x: a.x + 30, y: a.y - 50 }, { x: b.x - 30, y: b.y + 50 });
    await expect(page.locator('.outline')).toHaveCount(3);
    expect(await originalNodes(page)).toEqual(original);
    await expect(page.locator('.node.selected')).toHaveCount(4);
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await expect(page.locator('.outline')).toHaveCount(2);
  }
});

test('pen creates a curved closed contour, with one undo for the path', async ({ page }) => {
  const canvas = (await page.locator('#canvas').boundingBox())!;
  await page.getByRole('button', { name: '펜', exact: true }).click();
  const start = { x: canvas.x + 45, y: canvas.y + 45 };
  await drag(page, start, { x: start.x + 30, y: start.y });
  await page.mouse.click(canvas.x + 130, canvas.y + 80);
  await page.mouse.click(canvas.x + 70, canvas.y + 140);
  await page.mouse.click(start.x, start.y);
  await expect(page.locator('.outline')).toHaveCount(3);
  await expect(page.locator('.node.selected')).toHaveCount(3);
  await expect(page.locator('[data-handle]')).toHaveCount(18);
  await expect(page.locator('#finish-pen')).toBeHidden();
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.locator('.outline')).toHaveCount(2);
});

test('open pen path is not filled or erased; Escape discards the draft', async ({ page }) => {
  const a = await point(page, 'inner-3'), b = await point(page, 'inner-1');
  const fill = await page.locator('.glyph-fill').getAttribute('d');
  await page.getByRole('button', { name: '펜', exact: true }).click();
  await page.mouse.click(a.x + 25, a.y); await page.mouse.click(b.x - 25, b.y);
  await page.getByRole('button', { name: '열린 경로 완료', exact: true }).click();
  await expect(page.locator('.outline')).toHaveCount(3);
  expect(await page.locator('.glyph-fill').getAttribute('d')).toBe(fill);
  await page.getByRole('button', { name: '지우개', exact: true }).click();
  await drag(page, { x: b.x + 100, y: b.y }, { x: a.x, y: a.y });
  await expect(page.locator('.outline')).toHaveCount(3);
  expect(await page.locator('.glyph-fill').getAttribute('d')).toBe(fill);
  await page.getByRole('button', { name: '펜', exact: true }).click();
  await page.mouse.move(a.x + 50, a.y + 40); await expect(page.locator('.cursor-hint')).toHaveCount(0);
  await page.mouse.click(a.x + 50, a.y + 40); await page.keyboard.press('Escape');
  await expect(page.locator('.node')).toHaveCount(10);
});

test('brush stroke preserves existing contours and remembers separate eraser settings', async ({ page }) => {
  const before = await originalNodes(page);
  const a = await point(page, 'inner-3'), b = await point(page, 'inner-1');
  await page.getByRole('button', { name: '브러시', exact: true }).click();
  await page.locator('#tip-size').evaluate((input: HTMLInputElement) => { input.value = '64'; input.dispatchEvent(new Event('input')); });
  await drag(page, { x: a.x + 30, y: a.y }, { x: b.x - 30, y: b.y - 45 });
  await expect(page.locator('.outline')).toHaveCount(3);
  expect(await originalNodes(page)).toEqual(before);
  await page.getByRole('button', { name: '지우개', exact: true }).click();
  await expect(page.locator('#tip-size')).toHaveValue('48');
  await page.getByRole('button', { name: '브러시', exact: true }).click();
  await expect(page.locator('#tip-size')).toHaveValue('64');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.locator('.outline')).toHaveCount(2);
});

test('unselected donut becomes C after erasing, restored by Undo', async ({ page }) => {
  const before = await page.locator('.glyph-fill').getAttribute('d');
  const outer = await point(page, 'outer-1'), inner = await point(page, 'inner-1');
  await page.getByRole('button', { name: '지우개', exact: true }).click();
  await drag(page, { x: outer.x + 35, y: outer.y }, { x: inner.x - 35, y: inner.y });
  await expect(page.locator('.outline')).toHaveCount(1);
  expect(await page.locator('.glyph-fill').getAttribute('d')).not.toBe(before);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await page.locator('.glyph-fill').getAttribute('d')).toBe(before);
});

test('selected outer contour erasure leaves inner nodes unchanged', async ({ page }) => {
  const outer = await point(page, 'outer-1'), inner = await point(page, 'inner-1');
  const original = await page.locator('[data-node^="inner"]').evaluateAll(nodes => nodes.map(n => n.outerHTML));
  const q = await contourPoint(page); await page.mouse.dblclick(q.x, q.y);
  await page.getByRole('button', { name: '지우개', exact: true }).click();
  await drag(page, { x: outer.x + 35, y: outer.y }, { x: inner.x - 35, y: inner.y });
  expect(await page.locator('[data-node^="inner"]').evaluateAll(nodes => nodes.map(n => n.outerHTML))).toEqual(original);
});

test('cancelling brush gesture never commits partial geometry', async ({ page }) => {
  const before = await page.locator('.glyph-fill').getAttribute('d');
  const p = await point(page, 'inner-0');
  await page.getByRole('button', { name: '브러시', exact: true }).click();
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 80, p.y + 50);
  await expect(page.locator('#preview path')).toHaveCount(1);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(page.locator('#preview path')).toHaveCount(0);
  expect(await page.locator('.glyph-fill').getAttribute('d')).toBe(before);
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
});
