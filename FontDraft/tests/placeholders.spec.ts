import { test, expect, wheelZoom } from './fixtures';

test('editing long text preserves zoom and active glyph position', async ({ page }) => {
  await wheelZoom(page, -100);
  const before = await page.locator('[data-contour="outer"]').getAttribute('d');
  await page.locator('#text-run').fill('o'.repeat(80));
  await expect(page.locator('[data-contour="outer"]')).toHaveAttribute('d', before!);
  await page.locator('#text-run').fill('o');
  await expect(page.locator('[data-contour="outer"]')).toHaveAttribute('d', before!);
});

test('empty glyphs and missing characters share metric-sized placeholders without adding outlines', async ({ page }, info) => {
  await page.evaluate(async () => {
    const { createProject, createGlyph, saveDraft } = await import('/src/project.ts');
    const p = createProject('Placeholder');
    const h = createGlyph('H', [72]), x = createGlyph('x', [120]); h.width = x.width = 1000;
    p.glyphs = [h, x]; p.activeGlyph = h.id; await saveDraft(p);
  });
  await page.reload();
  await expect(page.locator('#drawing .glyph-placeholder')).toHaveText('H');
  await expect(page.locator('.glyph-card .glyph-placeholder')).toHaveCount(2);
  await expect(page.locator('.node')).toHaveCount(0);
  const fontSize = Number(await page.locator('#drawing .glyph-placeholder').getAttribute('font-size'));
  const baseline = await page.locator('#drawing .glyph-placeholder').getAttribute('y');
  await page.locator('#text-run').fill('HxЖ');
  await expect(page.locator('#drawing .glyph-placeholder')).toHaveCount(3);
  await expect(page.locator('#drawing .glyph-placeholder').first()).toHaveAttribute('font-size', String(fontSize));
  for (const el of await page.locator('#drawing .glyph-placeholder').all()) await expect(el).toHaveAttribute('y', baseline!);
  const thumbnail = page.locator('.glyph-card .glyph-placeholder').first();
  const canvas = page.locator('#drawing .glyph-placeholder').first();
  const metrics = await page.evaluate(() => {
    const lines = [...document.querySelectorAll('.baseline-guides line')];
    return lines.map(el => Number(el.getAttribute('y1')));
  });
  const origin = Number(baseline), cap = Math.min(...metrics.filter(y => y < origin));
  expect(fontSize).toBeGreaterThan(0); expect(cap).toBeLessThan(origin);
  await expect(thumbnail).toHaveCSS('fill', 'rgb(187, 187, 187)');
  await expect(canvas).toHaveCSS('fill', 'rgb(187, 187, 187)');
  await wheelZoom(page, -100);
  expect(Number(await canvas.getAttribute('font-size')) / fontSize).toBeCloseTo(Math.exp(.2));
  await page.screenshot({ path: info.outputPath('glyph-placeholders.png') });
  // Creating actual geometry removes only the active glyph's placeholder.
  await page.locator('#rectangle-tool').click();
  const b = (await page.locator('#canvas').boundingBox())!;
  await page.mouse.move(b.x + 130, b.y + 130); await page.mouse.down();
  await page.mouse.move(b.x + 190, b.y + 210); await page.mouse.up();
  await expect(page.locator('#drawing .glyph-placeholder')).toHaveCount(2);
  await expect(page.locator('.glyph-card[aria-current=true] .glyph-placeholder')).toHaveCount(0);
  await page.locator('#undo').click(); await expect(page.locator('#drawing .glyph-placeholder')).toHaveCount(3);
});
