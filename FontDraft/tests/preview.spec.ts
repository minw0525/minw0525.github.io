import { wheelZoom, expect, test } from './fixtures';

test('preview changes only rendering while tools, selection, modifiers and undo keep working', async ({ page }) => {
 const node=page.locator('[data-node="outer-0"]'),box=(await node.boundingBox())!;
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await page.locator('#modifier').click();
 await page.locator('#preview-mode').click();
 await expect(page.locator('.glyph-fill')).toHaveCSS('fill','rgb(0, 0, 0)');
 await expect(page.locator('#controls')).toBeHidden();await expect(page.locator('#guides')).toBeHidden();
 await expect(page.locator('.toolbar')).toBeVisible();await expect(page.locator('#editing-keys')).toBeVisible();
 await expect(page.locator('#modifier')).toHaveAttribute('aria-pressed','true');
 await page.getByLabel('오른쪽으로 1 이동',{exact:true}).click();await expect(node).toHaveAttribute('data-x','310');
 await page.locator('#undo').click();await expect(node).toHaveAttribute('data-x','300');
 await page.locator('#modifier').click();await page.locator('#rectangle-tool').click();
 const canvas=(await page.locator('#canvas').boundingBox())!;
 await page.mouse.move(canvas.x+40,canvas.y+40);await page.mouse.down();await page.mouse.move(canvas.x+100,canvas.y+110);
 await expect(page.locator('#preview path')).toBeVisible();await page.mouse.up();
 await expect(page.locator('.outline')).toHaveCount(3);
 await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveCount(2);
 await page.locator('#preview-mode').click();await expect(page.locator('#controls')).toBeVisible();
});

test('preview preserves a pen draft and allows finishing it', async ({ page }) => {
 await page.locator('#pen-tool').click();
 const b=(await page.locator('#canvas').boundingBox())!;
 await page.mouse.click(b.x+40,b.y+40);await page.mouse.click(b.x+100,b.y+70);
 await page.keyboard.press('p');await expect(page.locator('#preview-mode')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#finish-pen')).toBeVisible();await page.keyboard.press('Enter');
 await expect(page.locator('.outline')).toHaveCount(3);await expect(page.locator('#undo')).toBeEnabled();
 await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveCount(2);
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

test('preview allows annotations, transforms and layer switching',async({page})=>{
 await page.locator('#preview-mode').click();await page.locator('#annotation-tool').click();
 const b=(await page.locator('#canvas').boundingBox())!;await page.mouse.click(b.x+60,b.y+80);
 await page.getByLabel('주석 내용').fill('Preview note');await page.getByLabel('주석 내용').blur();
 await page.locator('#select-tool').click();await page.locator('#canvas').focus();await page.keyboard.press('ControlOrMeta+a');
 await page.locator('#app-menus > details > summary').filter({hasText:'편집'}).click();await page.getByRole('button',{name:'자유변형',exact:true}).click();
 await expect(page.locator('.free-transform')).toBeVisible();
 await page.locator('#layer-mask').click();await expect(page.locator('.glyph-fill')).toHaveAttribute('d','');
 await page.locator('#layer-foreground').click();await expect(page.locator('.glyph-fill')).not.toHaveAttribute('d','');
});
