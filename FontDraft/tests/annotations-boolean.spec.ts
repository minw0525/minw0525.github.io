import { writeFileSync } from 'node:fs';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { expect, test } from './fixtures';

test('inline annotation stays visible, edits and deletes with undo and reload', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.node')).toHaveCount(8);
  await page.locator('#annotation-tool').click();
  const b = (await page.locator('#canvas').boundingBox())!;
  await page.mouse.click(b.x+b.width*.65,b.y+140);
  const note=page.locator('.annotation-note textarea');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await note.fill('어깨 곡선\n조금 더 넓게 <&>'); await note.blur();
  await expect(note).toBeVisible();
  await note.fill('수정'); await note.blur(); await page.locator('#undo').click();
  await expect(note).toHaveValue('어깨 곡선\n조금 더 넓게 <&>');
  await page.locator('.annotation-note button').click(); await expect(page.locator('.annotation-note')).toHaveCount(0);
  await page.locator('#undo').click(); await expect(page.locator('.annotation-note')).toHaveCount(1);
  await expect(page.locator('#save-status')).toHaveText('기기에 저장됨'); await page.reload();
  await expect(page.locator('.annotation-note textarea')).toHaveValue('어깨 곡선\n조금 더 넓게 <&>');
});

test('annotation GLIF lib roundtrip and unsupported annotation version rejection', async ({ page }, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createProject } = await import('/src/project.ts');
    const { exportUFO, importUFO, glyphXML } = await import('/src/ufo.ts');
    const p = createProject('Notes'); p.glyphs[0].annotations = [{ id: 'note-1', x: -20.25, y: 801, text: '한글 <&>\n두 줄' }];
    const restored = await importUFO(await exportUFO(p));
    return { annotations: restored.glyphs[0].annotations, xml: glyphXML(p.glyphs[0]), bytes: Array.from(await exportUFO(p)) };
  });
  expect(result.annotations).toEqual([{ id: 'note-1', x: -20, y: 801, text: '한글 <&>\n두 줄' }]);
  expect(result.xml).toContain('<lib><dict><key>org.fontdraft.annotations</key>');
  writeFileSync(testInfo.outputPath('annotations.ufoz'), Buffer.from(result.bytes));
  const files = unzipSync(Uint8Array.from(result.bytes));
  const path = 'FontDraft.ufo/glyphs/glyph00000.glif';
  files[path] = strToU8(strFromU8(files[path]).replace('<key>version</key><integer>1</integer>', '<key>version</key><integer>2</integer>'));
  const error = await page.evaluate(async bytes => {
    const { importUFO } = await import('/src/ufo.ts');
    try { await importUFO(Uint8Array.from(bytes)); return ''; } catch (e) { return e.message; }
  }, Array.from(zipSync(files)));
  expect(error).toContain('지원하지 않는 주석 형식');
});

test('boolean geometry: holes, selected cutters, unaffected contours and no overlap', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const g = await import('/src/geometry.ts'), m = await import('/src/model.ts');
    const a = g.shape('rectangle', {x:0,y:0}, {x:200,y:200})[0];
    const b = g.shape('rectangle', {x:100,y:0}, {x:300,y:200})[0];
    const far = g.shape('rectangle', {x:700,y:0}, {x:800,y:100})[0];
    const open = {id:'open',closed:false,nodes:[{id:'p1',x:0,y:0},{id:'p2',x:1,y:1}]};
    const merged = g.combine([a,b,far,open], new Set([a.nodes[0].id,b.nodes[0].id,far.nodes[0].id]));
    const cut = g.combine([a,b,far,open], new Set([b.nodes[0].id]), 'subtract');
    const none = g.combine([a,far,open], new Set([far.nodes[0].id]), 'subtract');
    const ring = m.sample();
    const ringMerged = g.combine(ring, new Set(ring.flatMap(c=>c.nodes.map(n=>n.id))));
    const base = g.shape('rectangle', {x:0,y:0}, {x:600,y:600})[0];
    const ringCut = g.combine([base,...ring], new Set(ring.flatMap(c=>c.nodes.map(n=>n.id))), 'subtract');
    return {union:merged.length,far:merged.includes(far),open:merged.includes(open),unionFilled:g.contains(merged,{x:150,y:100}),cutRemoved:!g.contains(cut,{x:150,y:100}),cutKept:g.contains(cut,{x:50,y:100}),cutterGone:!cut.includes(b),cutFar:cut.includes(far),cutOpen:cut.includes(open),noOp:JSON.stringify(none)===JSON.stringify([a,far,open]),hole:!g.contains(ringMerged,{x:300,y:300}),ringCutCenter:g.contains(ringCut,{x:300,y:300}),ringCutEdge:!g.contains(ringCut,{x:100,y:300})};
  });
  expect(result).toEqual({union:3,far:true,open:true,unionFilled:true,cutRemoved:true,cutKept:true,cutterGone:true,cutFar:true,cutOpen:true,noOp:true,hole:true,ringCutCenter:true,ringCutEdge:true});
});

test('subtract button uses selected contour as cutter in one action and supports undo', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.node')).toHaveCount(8);
  const before = await page.locator('.glyph-fill').getAttribute('d');
  await page.locator('#rectangle-tool').click();
  const b = (await page.locator('#canvas').boundingBox())!;
  await page.mouse.move(b.x+b.width*.5,b.y+b.height*.45);await page.mouse.down();
  await page.mouse.move(b.x+b.width*.82,b.y+b.height*.55);await page.mouse.up();
  await expect(page.locator('.node.selected')).toHaveCount(4);
  const withCutter = await page.locator('.glyph-fill').getAttribute('d');
  await page.locator('#select-tool').click(); await page.locator('#subtract-selection').click();
  await expect(page.locator('.outline')).toHaveCount(1);
  expect(await page.locator('.glyph-fill').getAttribute('d')).not.toBe(before);
  await page.locator('#undo').click(); await expect(page.locator('.glyph-fill')).toHaveAttribute('d',withCutter!);
  await page.locator('#redo').click(); await expect(page.locator('.outline')).toHaveCount(1);
});
