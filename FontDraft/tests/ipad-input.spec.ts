import {test,expect} from './fixtures';

test('finger tools are opt-in while two fingers pan and zoom only the canvas',async({page,context,browserName})=>{
 test.skip(browserName !== 'chromium','Native multi-touch injection uses Chrome CDP');
 const cdp=await context.newCDPSession(page), b=(await page.locator('#canvas').boundingBox())!;
 const x=b.x+b.width*.45,y=b.y+b.height*.5;
 await expect(page.locator('#finger-tools')).not.toBeChecked();await page.locator('#rectangle-tool').click();
 const stroke=async()=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+65,y:y+75,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 await stroke();await expect(page.locator('.outline')).toHaveCount(2);
 await page.locator('#finger-tools').check();await stroke();await expect(page.locator('.outline')).toHaveCount(3);
 await page.locator('#undo').click();await page.locator('#finger-tools').uncheck();await page.locator('#select-tool').click();
 const coordinates=await page.locator('.node').evaluateAll(ns=>ns.map(n=>[n.getAttribute('data-x'),n.getAttribute('data-y')]));
 const start=await page.locator('[data-node="outer-0"]').evaluate((n: SVGGraphicsElement) => n.getBBox().x);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-50,y,id:1},{x:x+50,y,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-10,y:y+20,id:1},{x:x+90,y:y+20,id:2}]});
 expect(await page.locator('[data-node="outer-0"]').evaluate((n: SVGGraphicsElement) => n.getBBox().x)).toBeCloseTo(start+40,0);
 const width=(await page.locator('.glyph-fill').boundingBox())!.width;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-50,y:y+20,id:1},{x:x+130,y:y+20,id:2}]});
 expect((await page.locator('.glyph-fill').boundingBox())!.width).toBeGreaterThan(width);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 expect(await page.locator('.node').evaluateAll(ns=>ns.map(n=>[n.getAttribute('data-x'),n.getAttribute('data-y')]))).toEqual(coordinates);
 expect(await page.evaluate(()=>[visualViewport!.scale,scrollX,scrollY])).toEqual([1,0,0]);
});

test('Shift touch can coexist with finger editing and direction buttons',async({page,context,browserName})=>{
 test.skip(browserName !== 'chromium','Native multi-touch injection uses Chrome CDP');
 await page.locator('#finger-tools').check();await page.locator('#modifier').scrollIntoViewIfNeeded();
 const cdp=await context.newCDPSession(page), m=(await page.locator('#modifier').boundingBox())!, n=(await page.locator('[data-node="outer-0"]').boundingBox())!;
 const mod={x:m.x+m.width/2,y:m.y+m.height/2,id:1}, node={x:n.x+n.width/2,y:n.y+n.height/2,id:2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[mod]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[mod,node]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[mod,{...node,x:node.x+20}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{...node,x:node.x+20}]});
 const before=Number(await page.locator('[data-node="outer-0"]').getAttribute('data-x'));expect(before).toBeGreaterThan(300);
 await expect(page.locator('#modifier')).toHaveAttribute('aria-pressed','true');
 const arrow=(await page.getByLabel('오른쪽으로 1 이동',{exact:true}).boundingBox())!;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[mod,{x:arrow.x+26,y:arrow.y+26,id:3}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:arrow.x+26,y:arrow.y+26,id:3}]});
 await expect(page.locator('[data-node="outer-0"]')).toHaveAttribute('data-x',String(before+10));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 expect(await page.evaluate(()=>getSelection()?.toString())).toBe('');
});

test('smooth creation, integer edits and contained chrome',async({page,browserName})=>{
 if(browserName==='webkit'){
  await page.locator('#pen-tool').click();const c=(await page.locator('#canvas').boundingBox())!;
  await page.touchscreen.tap(c.x+50,c.y+50);await expect(page.locator('.node')).toHaveCount(8);
  await page.locator('#finger-tools').check();await page.touchscreen.tap(c.x+50,c.y+50);await expect(page.locator('.node')).toHaveCount(9);
  await page.keyboard.press('Escape');await page.locator('#finger-tools').uncheck();
 }
 await page.locator('#ellipse-tool').click();const b=(await page.locator('#canvas').boundingBox())!;
 await page.mouse.move(b.x+70.3,b.y+65.7);await page.mouse.down();await page.mouse.move(b.x+193.8,b.y+179.2);await page.mouse.up();
 await expect(page.locator('.node.selected.smooth')).toHaveCount(4);
 expect(await page.locator('.node.selected').evaluateAll(ns=>ns.every(n=>Number.isInteger(Number(n.getAttribute('data-x')))&&Number.isInteger(Number(n.getAttribute('data-y')))))).toBe(true);
 await page.locator('#select-tool').click();await page.locator('#scale-x').fill('33');await page.locator('#apply-scale').click();
 expect(await page.locator('.node.selected').evaluateAll(ns=>ns.every(n=>Number.isInteger(Number(n.getAttribute('data-x')))&&Number.isInteger(Number(n.getAttribute('data-y')))))).toBe(true);
 await expect(page.locator('footer, .inspector-note, #glyph-properties button')).toHaveCount(0);
 await expect(page.locator('.editor-chrome #text-run')).toHaveCount(1);await expect(page.locator('header .toolbar')).toHaveCount(1);
 const chrome=(await page.locator('.editor-chrome').boundingBox())!,canvas=(await page.locator('#canvas').boundingBox())!;expect(canvas.y).toBeGreaterThanOrEqual(chrome.y+chrome.height);
 await page.locator('#glyph-properties [name=name]').fill('renamed');await page.locator('#glyph-properties [name=name]').blur();await expect(page.locator('.glyph-card[aria-current=true] small')).toHaveText('renamed');
 await page.locator('#glyph-properties [name=unicodes]').fill('0041');await page.locator('#glyph-properties [name=unicodes]').blur();await expect(page.locator('#text-run')).toHaveValue('A');await expect(page.locator('.node')).toHaveCount(12);
});
