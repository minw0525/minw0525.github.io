import { wheelZoom, test, expect, contourPoint } from './fixtures';

test('new project defaults and bulk characters share width and Unicode mapping', async ({ page }) => {
  await page.locator('#project-menu').click(); await page.locator('#new-project').click();
  for (const [name,value] of Object.entries({name:'Unititled',upm:'1000',ascender:'800',descender:'-200',xHeight:'500',capHeight:'750'})) await expect(page.locator(`#project-form [name=${name}]`)).toHaveValue(value);
  await page.locator('#project-form button[type=submit]').click();
  await page.locator('#add-glyph').click(); await page.locator('#glyph-form [name=characters]').fill('가나다😀가');
  await page.locator('#glyph-form [name=width]').fill('700'); await page.locator('#glyph-form button[type=submit]').click();
  await expect(page.locator('.glyph-card')).toHaveCount(5);
  await expect(page.locator('#glyph-properties [name=unicodes]')).toHaveValue('AC00'); await expect(page.locator('#glyph-properties [name=width]')).toHaveValue('700');
});

test('all handles are visible and independently selectable and movable', async ({ page }) => {
  await expect(page.locator('.handle')).toHaveCount(16); await expect(page.locator('.node.selected')).toHaveCount(0);
  const h=page.locator('[data-handle="outer-0-outgoing"]'), b=(await h.boundingBox())!;
  const before=await page.locator('[data-node="outer-0"]').getAttribute('data-x');
  await page.mouse.move(b.x+4,b.y+4);await page.mouse.down();await page.mouse.move(b.x+24,b.y+14);await page.mouse.up();
  await expect(page.locator('.handle.selected')).toHaveCount(1);await expect(page.locator('.node.selected')).toHaveCount(0);
  await expect(page.locator('[data-node="outer-0"]')).toHaveAttribute('data-x',before!);
  await page.locator('#undo').click();
});

test('segment multi-selection highlights and translates endpoints', async ({ page }) => {
  const a=await contourPoint(page,'outer'), b=await contourPoint(page,'inner');
  await page.mouse.click(a.x,a.y); await page.keyboard.down('Shift');await page.mouse.click(b.x,b.y);await page.keyboard.up('Shift');
  await expect(page.locator('.selected-segment')).toHaveCount(2);
  const before=Number(await page.locator('[data-node="outer-0"]').getAttribute('data-x'));
  await page.keyboard.press('ArrowRight'); await expect(page.locator('[data-node="outer-0"]')).toHaveAttribute('data-x',String(before+1));
});

test('cursor ellipse matches tip and Shift constrains shape with stroke preview', async ({ page }) => {
  await page.locator('#brush-tool').click(); const b=(await page.locator('#canvas').boundingBox())!;
  await page.mouse.move(b.x+b.width*.5,b.y+b.height*.6); await expect(page.locator('#brush-cursor ellipse')).toBeVisible();
  const rx=Number(await page.locator('#brush-cursor ellipse').getAttribute('rx')); await wheelZoom(page); await page.mouse.move(b.x+b.width*.5,b.y+b.height*.6);
  expect(Number(await page.locator('#brush-cursor ellipse').getAttribute('rx'))).toBeGreaterThan(rx);
  await page.locator('#rectangle-tool').click(); await page.keyboard.down('Shift');
  await page.mouse.move(b.x+b.width*.4,b.y+b.height*.45);await page.mouse.down();await page.mouse.move(b.x+b.width*.65,b.y+b.height*.55);
  await expect(page.locator('#preview path')).toHaveAttribute('fill','none');await page.mouse.up();await page.keyboard.up('Shift');
  const pts=await page.locator('.node.selected').evaluateAll(ns=>ns.map(n=>[Number(n.getAttribute('data-x')),Number(n.getAttribute('data-y'))]));
  expect(Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0]))).toBeCloseTo(Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1])));
});

test('text run repeats glyphs and double tap activates another cell without changing outlines', async ({ page }) => {
  await page.locator('#add-glyph').click();await page.locator('#glyph-form [name=characters]').fill('A');await page.locator('#glyph-form button[type=submit]').click();
  await page.locator('#text-run').fill('oAo');await page.locator('#text-run').blur();
  await expect(page.locator('.neighbor-fill')).toHaveCount(2);
  // Active A is the middle cell; zoom out so the neighboring cell can be reached.
  await wheelZoom(page,112);await wheelZoom(page,112);
  const side=await page.locator('.sidebearing').first().getAttribute('x1'), c=(await page.locator('#canvas').boundingBox())!;
  await page.mouse.dblclick(c.x+Number(side)-30,c.y+c.height*.6);
  await expect(page.locator('.glyph-card[aria-current=true] small')).toHaveText('o');await expect(page.locator('.node')).toHaveCount(8);
  await expect(page.locator('#text-run')).toHaveValue('oAo');
});

test('knife preserves overlapping contour not crossed by cut, simplification reduces brush nodes', async ({ page }) => {
  const result=await page.evaluate(async()=>{
    const g=await import('/src/geometry.ts');
    const a=g.shape('rectangle',{x:0,y:0},{x:200,y:200})[0],b=g.shape('rectangle',{x:150,y:0},{x:350,y:200})[0];
    const cut=g.knife([a,b],new Set(),{x:50,y:-10},{x:50,y:210},true);
    const points=Array.from({length:80},(_,i)=>({x:i*6,y:Math.sin(i/12)*80}));
    const raw=g.brush(points,{size:36,ratio:.45,angle:35,simplify:0}),simple=g.brush(points,{size:36,ratio:.45,angle:35,simplify:1});
    return {kept:cut.includes(b),count:cut.length,raw:raw.reduce((s,c)=>s+c.nodes.length,0),simple:simple.reduce((s,c)=>s+c.nodes.length,0),simpleContours:simple.length,filled:points.every(p=>g.contains(simple,p))};
  });
  expect(result.kept).toBe(true);expect(result.count).toBe(3);expect(result.simple).toBeLessThan(result.raw/2);expect(result.filled).toBe(true);expect(result.simpleContours).toBe(1);
});

test('node smooth toggle persists in UFOZ and keeps opposite handle aligned', async ({ page }) => {
  const n=page.locator('[data-node="outer-0"]'), b=(await n.boundingBox())!;
  await page.mouse.dblclick(b.x+4,b.y+4); await expect(n).toHaveClass(/smooth/);await page.keyboard.press('Escape');
  const h=(await page.locator('[data-handle="outer-0-outgoing"]').boundingBox())!;
  await page.mouse.move(h.x+4,h.y+4);await page.mouse.down();await page.mouse.move(h.x+24,h.y+24);await page.mouse.up();
  const points=await page.evaluate(()=>{
    const n=document.querySelector<SVGGraphicsElement>('[data-node="outer-0"]')!, box=n.getBBox();
    return ['incoming','outgoing'].map(part=>{const h=document.querySelector(`[data-handle="outer-0-${part}"]`)!;return [Number(h.getAttribute('cx'))-(box.x+box.width/2),Number(h.getAttribute('cy'))-(box.y+box.height/2)];});
  });
  // Integer-rounded handles may deviate from the ideal tangent by a pixel.
  expect(Math.abs(points[0][0]*points[1][1]-points[0][1]*points[1][0]) / Math.hypot(...points[1])).toBeLessThan(1.5);
  const smooth=await page.evaluate(async()=>{ const {loadWorkspace}=await import('/src/project.ts'),{exportUFO,importUFO}=await import('/src/ufo.ts');const w=await loadWorkspace(),p=w.projects.find(p=>p.id===w.last)!;const read=await importUFO(await exportUFO(p));return read.glyphs[0].contours[0].nodes[0].smooth; });
  expect(smooth).toBe(true);
});

test('right modifier plus nudge moves by ten and selected coincident node is drawn last', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native multi-contact injection uses the Chromium CDP API.');
  await page.evaluate(async()=>{
    const {loadWorkspace,saveDraft}=await import('/src/project.ts');const w=await loadWorkspace(),p=w.projects.find(p=>p.id===w.last)!;const copy=structuredClone(p.glyphs[0].contours[0]);copy.id='overlap';copy.nodes.forEach(n=>n.id='overlap-'+n.id);p.glyphs[0].contours.push(copy);await saveDraft(p);
  });await page.reload();await expect(page.locator('.node')).toHaveCount(12);
  const n=page.locator('[data-node="outer-0"]'), b=(await n.boundingBox())!;await page.mouse.click(b.x+4,b.y+4);
  await expect(page.locator('.node').last()).toHaveAttribute('data-node','outer-0');
  const m=(await page.locator('#modifier').boundingBox())!;expect(m.x).toBeGreaterThan(900);
  const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:m.x+20,y:m.y+20,id:1}]});
  await page.locator('[data-nudge="1,0"]').click();await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(n).toHaveAttribute('data-x','310');await expect(page.locator('[data-node="overlap-outer-0"]')).toHaveAttribute('data-x','300');
});

test('baseline labels are unboxed numbers and text input sits above toolbar', async ({ page }) => {
  expect(await page.locator('.baseline-value').allTextContents()).toEqual(['0','300','600']);
  await expect(page.locator('#guides')).not.toContainText('Baseline');
  await expect(page.locator('#guides')).not.toContainText('ADVW');
  const toolbar=(await page.locator('.toolbar').boundingBox())!;
  const baseline=page.locator('.baseline-value').first();const b=(await baseline.boundingBox())!;
  expect(b.y).toBeGreaterThan(toolbar.y+toolbar.height);
  const input=(await page.locator('#text-run').boundingBox())!;expect(input.y).toBeGreaterThanOrEqual(toolbar.y+toolbar.height);
  await expect(page.locator('#text-run')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(page.locator('#help, .zoom, #glyph-settings')).toHaveCount(0);
});

test('contour and select-all highlight nodes handles and segments consistently', async ({ page }) => {
  const p=await contourPoint(page);await page.mouse.dblclick(p.x,p.y);
  await expect(page.locator('.node.selected')).toHaveCount(4);
  await expect(page.locator('.handle.selected')).toHaveCount(8);
  await expect(page.locator('.selected-segment')).toHaveCount(4);
  await page.keyboard.press('Meta+a');
  await expect(page.locator('.node.selected')).toHaveCount(8);
  await expect(page.locator('.handle.selected')).toHaveCount(16);
  await expect(page.locator('.selected-segment')).toHaveCount(8);
  const before=Number(await page.locator('[data-handle="outer-0-outgoing"]').getAttribute('cx'));
  await page.keyboard.press('ArrowRight');
  expect(Number(await page.locator('[data-handle="outer-0-outgoing"]').getAttribute('cx'))).toBeGreaterThan(before);
  const h=(await page.locator('[data-handle="outer-0-outgoing"]').boundingBox())!;
  const nodeX=Number(await page.locator('[data-node="inner-0"]').getAttribute('data-x'));
  await page.mouse.move(h.x+4,h.y+4);await page.mouse.down();await page.mouse.move(h.x+24,h.y+4);await page.mouse.up();
  await expect(page.locator('.node.selected')).toHaveCount(8);await expect(page.locator('.handle.selected')).toHaveCount(16);
  expect(Number(await page.locator('[data-node="inner-0"]').getAttribute('data-x'))).toBeGreaterThan(nodeX);
  await page.keyboard.press('Escape');await expect(page.locator('.handle.selected, .node.selected, .selected-segment')).toHaveCount(0);
});

test('inline glyph properties validate and persist, other glyphs have fill only', async ({ page }) => {
  await page.locator('#glyph-properties [name=name]').fill('renamed');
  await page.locator('#glyph-properties [name=width]').fill('720');
  await page.locator('#glyph-properties input:focus').blur();
  await expect(page.locator('.glyph-card[aria-current=true] small')).toHaveText('renamed');
  await expect(page.getByLabel('RSB', {exact:true})).toHaveValue('195');
  await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');
  await page.reload();await expect(page.locator('#glyph-properties [name=width]')).toHaveValue('720');
  await page.locator('#glyph-properties [name=unicodes]').fill('XYZ');await page.locator('#glyph-properties input:focus').blur();
  await expect(page.locator('#glyph-properties-error')).not.toBeEmpty();
  await page.locator('#text-run').fill('ooo');await page.locator('#text-run').blur();
  await expect(page.locator('.neighbor-fill')).toHaveCount(2);
  await expect(page.locator('.neighbor-fill').first()).toHaveCSS('stroke','none');
  await expect(page.locator('.node')).toHaveCount(8);
});
