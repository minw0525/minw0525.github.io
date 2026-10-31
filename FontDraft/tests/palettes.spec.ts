import { test, expect, contourPoint } from './fixtures';

test('bearings edit geometry and advance atomically with undo and persistence', async ({page}) => {
  const lsb=page.getByLabel('LSB',{exact:true}), adv=page.getByLabel('글리프 폭',{exact:true}), rsb=page.getByLabel('RSB',{exact:true});
  await expect(lsb).toHaveValue('75');await expect(rsb).toHaveValue('75');
  await lsb.fill('100');await lsb.blur();
  await expect(adv).toHaveValue('625');await expect(rsb).toHaveValue('75');
  await expect(page.locator('[data-node="outer-0"]')).toHaveAttribute('data-x','325');
  await page.locator('#undo').click();await expect(adv).toHaveValue('600');await expect(lsb).toHaveValue('75');
  await page.locator('#redo').click();await expect(adv).toHaveValue('625');await expect(lsb).toHaveValue('100');
  await rsb.fill('120');await rsb.blur();await expect(adv).toHaveValue('670');await expect(lsb).toHaveValue('100');
  await adv.fill('700');await adv.blur();await expect(rsb).toHaveValue('150');
  await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');await page.reload();
  await expect(lsb).toHaveValue('100');await expect(adv).toHaveValue('700');await expect(rsb).toHaveValue('150');
});

test('one node exposes editable coordinates and multiple nodes hide them', async ({page}) => {
  const n=page.locator('[data-node="outer-0"]'), b=(await n.boundingBox())!;await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
  await expect(page.locator('#coordinates')).toBeVisible();await expect(page.getByLabel('노드 X',{exact:true})).toHaveValue('300');
  const handle=Number(await page.locator('[data-handle="outer-0-outgoing"]').getAttribute('cx'));
  await page.getByLabel('노드 X',{exact:true}).fill('320.3');await page.getByLabel('노드 X',{exact:true}).blur();
  await expect(page.getByLabel('노드 X',{exact:true})).toHaveValue('320');await expect(n).toHaveAttribute('data-x','320');expect(Number(await page.locator('[data-handle="outer-0-outgoing"]').getAttribute('cx'))).toBeGreaterThan(handle);
  await page.locator('#undo').click();await expect(n).toHaveAttribute('data-x','300');
  await page.keyboard.press('Meta+a');await expect(page.locator('#coordinates')).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.locator('#coordinates')).toBeHidden();
});

test('nine pivots, flips and independent palettes remain usable', async ({page},info) => {
  const q=await contourPoint(page);await page.mouse.dblclick(q.x,q.y);
  await expect(page.locator('.inspector > section')).toHaveCount(5);
  await expect(page.locator('#transform-origin button')).toHaveCount(9);
  await page.getByRole('button',{name:'기준점 왼쪽 아래',exact:true}).click();
  await page.getByLabel('가로 배율',{exact:true}).fill('50');await page.locator('#apply-scale').click();
  await expect(page.locator('[data-node="outer-0"]')).toHaveAttribute('data-x','188');
  await expect(page.locator('[data-node="outer-0"]')).toHaveAttribute('data-y','300');
  await page.locator('#undo').click();
  await page.getByRole('button',{name:'기준점 중앙',exact:true}).click();
  const old=await page.locator('[data-node="outer-1"]').getAttribute('data-x');
  await page.locator('#flip-horizontal').click();
  expect(Number(await page.locator('[data-node="outer-1"]').getAttribute('data-x'))).toBeCloseTo(600-Number(old));
  await page.locator('#undo').click();await expect(page.locator('[data-node="outer-1"]')).toHaveAttribute('data-x',old!);
  await page.locator('#flip-vertical').click();await expect(page.locator('[data-node="outer-0"]')).toHaveAttribute('data-y','25');
  await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');
  expect(await page.evaluate(async()=>{const {loadWorkspace}=await import('/src/project.ts'),{contains}=await import('/src/geometry.ts');const w=await loadWorkspace(),p=w.projects.find(p=>p.id===w.last)!;return contains(p.glyphs.find(g=>g.id===p.activeGlyph)!.contours,{x:300,y:300});})).toBe(false);
  await expect(page.locator('#transform-panel #unite-selection svg')).toHaveCount(1);
  await expect(page.locator('#transform-panel #subtract-selection svg')).toHaveCount(1);
  await page.locator('#transform-panel').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('transform-palette.png')});
  await page.locator('#node-panel').scrollIntoViewIfNeeded();
  const up=(await page.getByLabel('위로 1 이동',{exact:true}).boundingBox())!,left=(await page.getByLabel('왼쪽으로 1 이동',{exact:true}).boundingBox())!;
  expect(up.width).toBeGreaterThanOrEqual(52);expect(up.height).toBeGreaterThanOrEqual(52);expect(up.y).toBeLessThan(left.y);expect(up.x).toBeGreaterThan(left.x);
  await page.screenshot({path:info.outputPath('node-palette.png')});
});
