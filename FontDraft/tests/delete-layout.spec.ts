import {test,expect,contourPoint} from './fixtures';

test('Delete removes a selected contour and preserves input editing and undo',async({page})=>{
 const q=await contourPoint(page);await page.mouse.dblclick(q.x,q.y);await page.keyboard.press('Backspace');
 await expect(page.locator('.outline')).toHaveCount(1);await expect(page.locator('[data-contour="inner"]')).toHaveCount(1);
 await page.locator('#undo').click();await expect(page.locator('.node')).toHaveCount(8);
 await page.locator('#text-run').focus();await page.keyboard.press('Delete');await expect(page.locator('.node')).toHaveCount(8);
 await expect(page.locator('header .toolbar')).toHaveCount(1);await expect(page.locator('#glyph-select,.canvas-heading')).toHaveCount(0);
 // The category menu now occupies one dedicated row above the editor.
 expect((await page.locator('#canvas').boundingBox())!.height + (await page.locator('#app-menus').boundingBox())!.height).toBeGreaterThan(500);
});

test('Delete removes a handle or opens the selected edge without deleting endpoints',async({page})=>{
 const h=(await page.locator('[data-handle="outer-0-outgoing"]').boundingBox())!;await page.mouse.click(h.x+h.width/2,h.y+h.height/2);await page.keyboard.press('Delete');
 await expect(page.locator('[data-handle="outer-0-outgoing"]')).toHaveCount(0);await expect(page.locator('.node')).toHaveCount(8);
 await page.locator('#undo').click();await page.keyboard.press('Escape');
 const q=await contourPoint(page);await page.mouse.click(q.x,q.y);await page.keyboard.press('Delete');
 await expect(page.locator('.node')).toHaveCount(8);expect(await page.locator('[data-contour="outer"]').getAttribute('d')).not.toMatch(/Z$/);
 await page.locator('#undo').click();expect(await page.locator('[data-contour="outer"]').getAttribute('d')).toMatch(/Z$/);
});

test('node deletion reconnects and multiple edge deletion separates open pieces',async({page})=>{
 const result=await page.evaluate(async()=>{const {shape,deleteSelection}=await import('/src/geometry.ts');const c=shape('rectangle',{x:0,y:0},{x:100,y:100})[0],untouched=shape('ellipse',{x:200,y:0},{x:300,y:100})[0];const one=deleteSelection([c,untouched],new Set([c.nodes[1].id]),new Set(),new Set());const cuts=deleteSelection([c],new Set(),new Set(),new Set([c.nodes[0].id,c.nodes[2].id]));return {nodes:one[0].nodes.length,kept:one[1]===untouched,cuts:cuts.map(c=>({closed:c.closed,count:c.nodes.length}))};});
 expect(result).toEqual({nodes:3,kept:true,cuts:[{closed:false,count:2},{closed:false,count:2}]});
});

test('directional rotation and both shear axes use the chosen pivot and undo',async({page})=>{
 const q=await contourPoint(page);await page.mouse.dblclick(q.x,q.y);const n=page.locator('[data-node="outer-0"]'),right=page.locator('[data-node="outer-1"]');
 await page.getByLabel('회전 각도',{exact:true}).fill('90');await page.getByRole('button',{name:'오른쪽 회전',exact:true}).click();await expect(n).toHaveAttribute('data-x','575');await page.locator('#undo').click();
 await page.getByLabel('가로 기울기 각도',{exact:true}).fill('45');await page.getByRole('button',{name:'왼쪽 기울이기',exact:true}).click();await expect(n).toHaveAttribute('data-x','25');await page.locator('#undo').click();
 await page.getByLabel('세로 기울기 각도',{exact:true}).fill('45');await page.getByRole('button',{name:'위로 기울이기',exact:true}).click();await expect(right).toHaveAttribute('data-y','525');await page.locator('#undo').click();
 await page.getByRole('button',{name:'아래로 기울이기',exact:true}).click();await expect(right).toHaveAttribute('data-y','75');await page.locator('#undo').click();await expect(right).toHaveAttribute('data-y','300');
});

test('proof scales to ascender plus 100 and descender minus 100, manifest requests standalone',async({page})=>{
 const check=async()=>{const h=await page.locator('#proof-viewport').evaluate(e=>e.clientHeight),box=(await page.locator('#proof-fill').boundingBox())!;expect(box.height).toBeCloseTo(550*h/800,1);};
 await check();await page.locator('#proof-resize').focus();await page.keyboard.press('ArrowUp');await expect.poll(async()=>Number(await page.locator('#proof-canvas').getAttribute('height'))).toBe(await page.locator('#proof-viewport').evaluate(e=>e.clientHeight));await check();
 const manifest=await (await page.request.get('/manifest.webmanifest')).json();expect(manifest.display).toBe('standalone');await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content','yes');
});

test('Delete button removes the selection and supports undo',async({page})=>{
 const button=page.getByRole('button',{name:'Delete',exact:true});
 await expect(button).toBeDisabled();
 const q=await contourPoint(page);await page.mouse.dblclick(q.x,q.y);
 await expect(button).toBeEnabled();await button.click();
 await expect(page.locator('[data-contour="outer"]')).toHaveCount(0);
 await expect(page.locator('[data-contour="inner"]')).toHaveCount(1);
 await expect(button).toBeDisabled();
 await page.locator('#undo').click();await expect(page.locator('.node')).toHaveCount(8);
});
