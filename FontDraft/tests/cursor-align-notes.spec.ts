import { test, expect } from './fixtures';

test('tool cursors use toolbar icons with shape badges and knife hotspot', async ({ page }) => {
  const canvas = (await page.locator('#canvas').boundingBox())!;
  for (const tool of ['select', 'pen', 'brush', 'eraser', 'rectangle', 'ellipse', 'knife', 'overlap', 'annotation', 'pan']) {
    await page.locator(`#${tool}-tool`).click();
    await page.mouse.move(canvas.x + 130, canvas.y + 130);
    await expect(page.locator('.tool-cursor')).toHaveAttribute('data-tool', tool);
    expect(await page.locator('.cursor-icon').innerHTML()).toBe(await page.locator(`#${tool}-tool svg`).innerHTML());
    if (tool === 'brush' || tool === 'eraser') await expect(page.locator('.tool-cursor > ellipse')).toHaveCount(1);
    if (tool === 'knife') await expect(page.locator('.tool-cursor > circle')).toHaveAttribute('r', '2.5');
  }
});

test('selection tool moves existing annotation with undo redo and persistence', async ({ page }) => {
  await page.locator('#annotation-tool').click();
  const canvas = (await page.locator('#canvas').boundingBox())!;
  await page.mouse.click(canvas.x + 100, canvas.y + 110);
  await page.getByLabel('주석 내용').fill('Move this note');
  await page.locator('#select-tool').click();
  const note = page.locator('.annotation-note'), before = (await note.boundingBox())!;
  await page.mouse.move(before.x + 40, before.y + 20); await page.mouse.down();
  await page.mouse.move(before.x + 100, before.y + 60); await page.mouse.up();
  const after = (await note.boundingBox())!;
  expect(after.x - before.x).toBeCloseTo(60, 0); expect(after.y - before.y).toBeCloseTo(40, 0);
  await page.mouse.move(after.x + 40, after.y + 20); await page.mouse.down();
  await page.mouse.move(after.x + 70, after.y + 40); await page.keyboard.press('Escape'); await page.mouse.up();
  expect((await note.boundingBox())!.x).toBeCloseTo(after.x, 0);
  await page.locator('#undo').click(); expect((await note.boundingBox())!.x).toBeCloseTo(before.x, 0);
  await page.locator('#redo').click(); expect((await note.boundingBox())!.x).toBeCloseTo(after.x, 0);
  await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');
  await page.reload(); await expect(page.getByLabel('주석 내용')).toHaveValue('Move this note');
});

test('alignment preserves whole contour shapes and aligns partial nodes independently', async ({ page }, info) => {
  await page.locator('#canvas').focus(); await page.keyboard.press('Meta+a');
  const nodes = () => page.locator('.node').evaluateAll(els => els.map(el => ({ id: el.getAttribute('data-node'), x: Number(el.getAttribute('data-x')), y: Number(el.getAttribute('data-y')) })));
  const before = await nodes();
  await page.locator('#align-controls').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('alignment-panel.png') });
  await page.getByRole('button', { name: '왼쪽 정렬', exact: true }).click();
  const after = await nodes();
  for (const prefix of ['inner', 'outer']) {
    const deltas = after.filter(n => n.id!.startsWith(prefix)).map(n => n.x - before.find(b => b.id === n.id)!.x);
    expect(new Set(deltas).size).toBe(1);
  }
  expect(after).not.toEqual(before);
  await page.locator('#undo').click(); expect(await nodes()).toEqual(before);
  await page.locator('#canvas').focus(); await page.keyboard.press('Escape');
  for (const id of ['outer-0', 'outer-1']) {
    const box = (await page.locator(`[data-node="${id}"]`).boundingBox())!;
    if (id === 'outer-1') await page.keyboard.down('Shift');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.up('Shift');
  }
  await page.getByRole('button', { name: '위로 정렬', exact: true }).click();
  const partial = await nodes();
  expect(partial.find(n => n.id === 'outer-1')!.y).toBe(partial.find(n => n.id === 'outer-0')!.y);
  expect(partial.find(n => n.id === 'outer-2')).toEqual(before.find(n => n.id === 'outer-2'));
});
