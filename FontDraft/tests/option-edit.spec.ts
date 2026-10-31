import { test, expect } from './fixtures';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

test('Option projects nodes and handles onto their axes while keeping other points fixed', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { moveOnAxis } = await import('/src/model.ts');
    const n = { id: 'n', x: 100, y: 100, smooth: true, incoming: { x: 70, y: 60 }, outgoing: { x: 130, y: 140 } };
    moveOnAxis(n, 'node', 20, 0);
    const slid = structuredClone(n);
    moveOnAxis(n, 'outgoing', 20, -10);
    const corner = { id: 'c', x: 0, y: 0, incoming: { x: -30, y: 0 }, outgoing: { x: 0, y: 40 } };
    moveOnAxis(corner, 'node', 5, 7);
    return { slid, n, corner };
  });
  expect(result.slid).toMatchObject({ x: 107, y: 110, incoming: { x: 70, y: 60 }, outgoing: { x: 130, y: 140 } });
  expect(result.n).toMatchObject({ x: 107, y: 110, incoming: { x: 70, y: 60 }, outgoing: { x: 133, y: 143 } });
  expect(result.corner).toMatchObject({ x: 5, y: 7, incoming: { x: -30, y: 0 }, outgoing: { x: 0, y: 40 } });
});

test('Opt tap and Alt key constrain editing with undo and Shift nudge', async ({ page }, info) => {
  const n = page.locator('[data-node="outer-0"]'), h = page.locator('[data-handle="outer-0-outgoing"]');
  const initial=(await n.boundingBox())!;await page.mouse.dblclick(initial.x+initial.width/2,initial.y+initial.height/2);await expect(n).toHaveClass(/smooth/);
  const before = await page.locator('[data-handle^="outer-0-"]').evaluateAll(es => es.map(e => [e.getAttribute('cx'), e.getAttribute('cy')]));
  await page.locator('#option-modifier').click(); await expect(page.locator('#option-modifier')).toHaveAttribute('aria-pressed', 'true');
  const b = (await n.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + 35, b.y + 35); await page.mouse.up();
  await expect(n).toHaveAttribute('data-y', '575');
  expect(Number(await n.getAttribute('data-x'))).toBeGreaterThan(300);
  expect(await page.locator('[data-handle^="outer-0-"]').evaluateAll(es => es.map(e => [e.getAttribute('cx'), e.getAttribute('cy')]))).toEqual(before);
  await page.locator('#undo').click(); await expect(n).toHaveAttribute('data-x', '300');
  await page.locator('#option-modifier').click(); await page.keyboard.down('Alt');
  const hb = (await h.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + 30, hb.y + 25); await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(n).toHaveAttribute('data-x', '300');
  expect(await h.getAttribute('cy')).toBe(before[1][1]);
  const x = Number(await h.getAttribute('cx'));
  await page.locator('#option-modifier').click(); await page.locator('#modifier').click();
  await page.getByLabel('오른쪽으로 1 이동', { exact: true }).click();
  expect(Number(await h.getAttribute('cx'))).toBeGreaterThan(x);
  await page.screenshot({ path: info.outputPath('option-palette.png') });
});

test('legacy stored coordinates and imported/exported UFO coordinates are integer rounded', async ({ page }) => {
  const baseline = await page.evaluate(async () => {
    const { createProject, createGlyph } = await import('/src/project.ts');
    const { exportUFO } = await import('/src/ufo.ts');
    const p = createProject('Round', true), second = createGlyph('B', [66]);
    second.contours = [{ id: 'fraction', closed: false, nodes: [{ id: 'f0', x: 10.4, y: -5.7, outgoing: { x: 20.8, y: 7.1 } }, { id: 'f1', x: 30.9, y: 40.5 }] }];
    p.glyphs.push(second);
    p.glyphs[0].contours[0].nodes[0].outgoing!.x = 424.7;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('fontdraft'); request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['projects', 'settings'], 'readwrite');
        tx.objectStore('projects').put(p); tx.objectStore('settings').put(p.id, 'last');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
    return Array.from(await exportUFO(p));
  });
  await page.reload();
  const values = await page.evaluate(async () => {
    const { loadWorkspace } = await import('/src/project.ts');
    const w = await loadWorkspace(), p = w.projects.find(p => p.id === w.last)!;
    return p.glyphs.flatMap(g => g.contours.flatMap(c => c.nodes.flatMap(n => [n, n.incoming, n.outgoing].filter(Boolean).flatMap(p => [p!.x, p!.y]))));
  });
  expect(values.every(Number.isInteger)).toBe(true);
  const files = unzipSync(Uint8Array.from(baseline));
  const key = 'FontDraft.ufo/glyphs/glyph00000.glif';
  files[key] = strToU8(strFromU8(files[key]).replace('x="300"', 'x="300.7"'));
  await page.locator('#project-menu').click();
  await page.locator('#file-input').setInputFiles({ name: 'fraction.ufoz', mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)) });
  await expect(page.locator('[data-node="outer-0"]')).toHaveAttribute('data-x', '301');
});


test('Opt corner nodes move freely even with collinear or single handles', async ({page}) => {
 const result=await page.evaluate(async()=>{
  const {moveOnAxis}=await import('/src/model.ts');
  return [false,true].flatMap(smooth=>[1,2].map(count=>{
   const n={id:'n',x:100,y:100,smooth,incoming:{x:70,y:100},...(count===2?{outgoing:{x:130,y:100}}:{})};
   moveOnAxis(n,'node',5,7);return n;
  }));
 });
 for(const n of result.slice(0,2)) expect(n).toMatchObject({x:105,y:107,incoming:{x:70,y:100}});
 for(const n of result.slice(2)) expect(n).toMatchObject({x:105,y:100,incoming:{x:70,y:100}});
 expect(result[1].outgoing).toEqual({x:130,y:100});expect(result[3].outgoing).toEqual({x:130,y:100});
 const node=page.locator('[data-node="outer-0"]'),initial=(await node.boundingBox())!;await page.mouse.click(initial.x+initial.width/2,initial.y+initial.height/2);
 const handles=()=>page.locator('[data-handle^="outer-0-"]').evaluateAll(es=>es.map(e=>[e.getAttribute('cx'),e.getAttribute('cy')]));
 const before=await handles();await page.locator('#option-modifier').click();
 await page.getByLabel('위로 1 이동',{exact:true}).click();
 await expect(node).toHaveAttribute('data-y','576');expect(await handles()).toEqual(before);
 await page.locator('#undo').click();await expect(node).toHaveAttribute('data-y','575');
 const b=(await node.boundingBox())!;
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+35,b.y+35);await page.mouse.up();
 expect(Number(await node.getAttribute('data-y'))).toBeLessThan(575);
 expect(Number(await node.getAttribute('data-x'))).toBeGreaterThan(300);expect(await handles()).toEqual(before);
});
