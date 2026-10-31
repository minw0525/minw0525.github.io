import { wheelZoom, expect, test } from './fixtures';

test('preview shows black fill only, preserves selection and blocks editing', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.node')).toHaveCount(8);
  const node = (await page.locator('[data-node="outer-0"]').boundingBox())!;
  await page.mouse.click(node.x+4,node.y+4);
  const before = await page.locator('.node').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-x'),n.getAttribute('data-y')]));
  const path = await page.locator('.glyph-fill').getAttribute('d');
  await expect(page.locator('.glyph-fill')).toHaveCSS('fill','rgb(210, 210, 210)');
  await page.locator('#preview-mode').click();
  await expect(page.locator('.glyph-fill')).toHaveCSS('fill','rgb(0, 0, 0)');
  await expect(page.locator('.glyph-fill')).toHaveAttribute('d',path!);
  for (const id of ['controls','guides','annotations','preview']) await expect(page.locator('#'+id)).not.toBeVisible();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Meta+z');
  await page.mouse.move(node.x+4,node.y+4); await page.mouse.down(); await page.mouse.move(node.x+40,node.y+25); await page.mouse.up();
  expect(await page.locator('.node').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-x'),n.getAttribute('data-y')]))).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-node="outer-0"]')).toHaveClass(/selected/);
  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('.glyph-fill')).toHaveCSS('fill','rgb(210, 210, 210)');
});

test('preview retains a pen draft without committing it', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.node')).toHaveCount(8);
  await page.locator('#pen-tool').click();
  const b=(await page.locator('#canvas').boundingBox())!;
  await page.mouse.click(b.x+b.width*.4,b.y+150); await page.mouse.click(b.x+b.width*.5,b.y+200);
  await expect(page.locator('.node')).toHaveCount(10);
  await page.keyboard.press('p'); await expect(page.locator('#preview-mode')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Enter'); await page.keyboard.press('p');
  await expect(page.locator('.node')).toHaveCount(10);
  await expect(page.locator('#finish-pen')).toBeVisible();
  await expect(page.locator('#undo')).toBeDisabled();
});

test('live proof panel follows edits, stays independent and can resize or collapse', async ({ page }, testInfo) => {
  await page.goto('/'); await expect(page.locator('.node')).toHaveCount(8);
  await expect(page.locator('#proof-fill')).toHaveCSS('fill','rgb(0, 0, 0)');
  const before = await page.locator('#proof-fill').getAttribute('d');
  const node=(await page.locator('[data-node="outer-0"]').boundingBox())!;
  await page.mouse.click(node.x+4,node.y+4); await page.keyboard.press('ArrowRight');
  expect(await page.locator('#proof-fill').getAttribute('d')).not.toBe(before);
  await page.locator('#undo').click(); await expect(page.locator('#proof-fill')).toHaveAttribute('d',before!);
  await expect(page.locator('#proof-size')).toHaveCount(0);
  const enlarged=await page.locator('#proof-fill').getAttribute('d');
  await wheelZoom(page); await expect(page.locator('#proof-fill')).toHaveAttribute('d',enlarged!);
  const height=(await page.locator('#proof-panel').boundingBox())!.height;
  await page.locator('#proof-resize').focus(); await page.keyboard.press('ArrowUp');
  expect((await page.locator('#proof-panel').boundingBox())!.height).toBeGreaterThan(height);
  await expect(page.locator('#proof-fill')).not.toHaveAttribute('d',enlarged!);
  await page.locator('#proof-toggle').click(); await expect(page.locator('#proof-viewport')).not.toBeVisible();
  await page.locator('#preview-mode').click(); await expect(page.locator('#controls')).not.toBeVisible();
  await page.locator('#proof-toggle').click(); await expect(page.locator('#proof-viewport')).toBeVisible();
  await page.locator('#preview-mode').click(); await expect(page.locator('#controls')).toBeVisible();
});


test('split editor fits tablet and phone screens', async ({ page }, testInfo) => {
  await page.goto('/'); await expect(page.locator('.node')).toHaveCount(8);
  await page.screenshot({path:testInfo.outputPath('tablet-edit.png')});
  await page.locator('#preview-mode').click();
  await page.screenshot({path:testInfo.outputPath('tablet-preview.png')});
  await page.locator('#preview-mode').click();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('#proof-toggle')).toBeVisible();
  await expect(page.locator('#preview-mode')).toBeVisible();
  await expect.poll(async()=>{const b=await page.locator('[data-node="outer-0"]').boundingBox();return b ? b.x+b.width/2 : Infinity;}).toBeLessThan(390);
  await page.screenshot({path:testInfo.outputPath('phone-edit.png')});
});
