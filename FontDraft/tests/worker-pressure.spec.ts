import { test, expect } from './fixtures';

test('WASM matches JS fill and worker runs pressure geometry off thread', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { brush, contains, outlineBounds } = await import('/src/geometry.ts');
    const { loadWasmUnion } = await import('/src/wasm-union.ts');
    const { GeometryClient } = await import('/src/geometry-client.ts');
    const union = await loadWasmUnion();
    const points = Array.from({length:600}, (_,i)=>({x:i*.7,y:Math.sin(i/60)*70,pressure:.1+.9*i/599}));
    const tip = {size:60,ratio:.6,angle:35,simplify:3,pressure:true};
    const js=brush(points,tip), wasm=brush(points,tip,union);
    let differences=0;
    for(let x=-30;x<450;x+=9)for(let y=-100;y<100;y+=9)if(contains(js,{x,y})!==contains(wasm,{x,y}))differences++;
    const times={js:[] as number[],wasm:[] as number[]};
    for(let i=0;i<4;i++)for(const name of ['js','wasm'] as const){const start=performance.now();brush(points,tip,name==='wasm'?union:undefined);if(i)times[name].push(performance.now()-start);}
    const client=new GeometryClient();let ticks=0;const timer=setInterval(()=>ticks++,1);
    const response=await client.run({tool:'brush',points,tip,contours:[],selected:[]});clearInterval(timer);client.stop();
    const thin=outlineBounds(brush([{x:0,y:0,pressure:0}],tip,union))!, thick=outlineBounds(brush([{x:0,y:0,pressure:1}],tip,union))!;
    return {differences,times,ticks,backend:response.backend,nodes:response.contours?.length,thin:thin.right-thin.left,thick:thick.right-thick.left};
  });
  console.log('Worker/WASM comparison',JSON.stringify(result));
  expect(result.differences).toBeLessThan(4);expect(result.backend).toBe('wasm');expect(result.nodes).toBeGreaterThan(0);expect(result.ticks).toBeGreaterThan(1);expect(result.thin/result.thick).toBeCloseTo(.15,2);
});

test('pressure changes along a straight stroke survive sample reduction and mouse stays fixed',async({page})=>{
  const result=await page.evaluate(async()=>{
    const {brush,contains,outlineBounds}=await import('/src/geometry.ts');const {loadWasmUnion}=await import('/src/wasm-union.ts');const union=await loadWasmUnion();
    const tip={size:100,ratio:1,angle:0,pressure:true,simplify:3};
    const points=Array.from({length:101},(_,i)=>({x:i*4,y:0,pressure:Math.sin(i*Math.PI/100)}));
    const c=brush(points,tip,union), fixed=brush(points.map(({x,y})=>({x,y})),tip,union);
    return {thin:contains(c,{x:15,y:40}),thick:contains(c,{x:200,y:40}),mouse:contains(fixed,{x:15,y:40}),bounds:outlineBounds(c)};
  });expect(result.thin).toBe(false);expect(result.thick).toBe(true);expect(result.mouse).toBe(true);
});

async function injectStroke(page, pressure=.5) {
  await page.evaluate((pressure)=>{
    const canvas=document.getElementById('canvas')!,b=canvas.getBoundingClientRect();
    const event=(type,x,p)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:77,pointerType:'pen',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:b.x+x,clientY:b.y+80,pressure:p}));
    // Synthetic pointers have no native capture; retain the app's event handlers.
    const capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};
    event('pointerdown',80,pressure);for(let i=1;i<30;i++)event('pointermove',80+i*5,pressure);event('pointerup',230,0);
    canvas.setPointerCapture=capture;
  },pressure);
}

test('pen pressure reaches document, queued strokes commit in order with separate undo',async({page})=>{
  await page.locator('#brush-tool').click();await expect(page.locator('#tip-pressure')).toBeChecked();
  await injectStroke(page,.1);await injectStroke(page,1);
  await expect(page.locator('#canvas')).toHaveAttribute('data-geometry-pending','0');
  await expect(page.locator('.outline')).toHaveCount(4);
  const heights=await page.locator('.outline').evaluateAll(paths=>paths.slice(2).map(p=>(p as SVGGraphicsElement).getBBox().height));
  expect(heights[1]).toBeGreaterThan(heights[0]*2);
  await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveCount(3);
  await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveCount(2);
  await page.locator('#redo').click();await expect(page.locator('.outline')).toHaveCount(3);
});

test('undo pending worker job rejects late results and next stroke recovers',async({page})=>{
  await page.route('**/clipper2z.wasm*',async route=>{await new Promise(r=>setTimeout(r,250));await route.continue();});
  await page.locator('#brush-tool').click();await injectStroke(page);
  await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveCount(2);
  await expect(page.locator('#canvas')).toHaveAttribute('data-geometry-pending','0');
  await page.waitForTimeout(400);await expect(page.locator('.outline')).toHaveCount(2);
  await injectStroke(page);await expect(page.locator('.outline')).toHaveCount(3);
});

test('WASM unavailable falls back inside worker, with valid geometry',async({page})=>{
  await page.route('**/clipper2z.wasm*',route=>route.request().resourceType() === 'fetch' ? route.abort() : route.continue());
  await page.locator('#brush-tool').click();await injectStroke(page);
  await expect(page.locator('.outline')).toHaveCount(3);
  await expect(page.locator('#canvas')).toHaveAttribute('data-geometry-backend','js');
});

test('short-edge cleanup reduces redundant nodes without changing sampled fill or untouched contours',async({page})=>{
  const result=await page.evaluate(async()=>{
    const {brush,cleanStrokeContours,contains}=await import('/src/geometry.ts'), {roundNodes,sample}=await import('/src/model.ts'), {loadWasmUnion}=await import('/src/wasm-union.ts');
    const union=await loadWasmUnion();let seed=12345;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    let removed=0,beforeZero=0,afterZero=0,diff=0,elapsed=0;
    const zero=cs=>cs.reduce((sum,c)=>sum+c.nodes.filter((n,i)=>n.x===c.nodes[(i+1)%c.nodes.length].x&&n.y===c.nodes[(i+1)%c.nodes.length].y).length,0);
    for(let k=0;k<40;k++){
      let x=0,y=0;const points=[];for(let i=0;i<50;i++){x+=random()*20-6;y+=random()*25-12;points.push({x,y});}
      const before=brush(points,{size:36,ratio:.45,angle:35,simplify:3},union);roundNodes(before);
      const start=performance.now(),after=cleanStrokeContours(before,3);elapsed+=performance.now()-start;
      removed+=before.reduce((s,c)=>s+c.nodes.length,0)-after.reduce((s,c)=>s+c.nodes.length,0);beforeZero+=zero(before);afterZero+=zero(after);
      for(let x=-10;x<450;x+=13)for(let y=-100;y<180;y+=13)if(contains(before,{x,y})!==contains(after,{x,y}))diff++;
    }
    const untouched=sample(),cleaned=cleanStrokeContours(untouched,3,new Set(untouched.map(c=>c.id)));
    return {removed,beforeZero,afterZero,diff,elapsed,preserved:JSON.stringify(untouched)===JSON.stringify(cleaned)};
  });console.log('Cleanup audit',JSON.stringify(result));expect(result.removed).toBeGreaterThan(0);expect(result.afterZero).toBe(0);expect(result.preserved).toBe(true);expect(result.diff).toBeLessThan(10);
});

test('worker eraser preserves donut winding and unrelated contour IDs',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {GeometryClient}=await import('/src/geometry-client.ts'),{sample}=await import('/src/model.ts'),{shape,contains}=await import('/src/geometry.ts');
  const ring=sample(), other=shape('rectangle',{x:700,y:0},{x:800,y:100}),client=new GeometryClient();
  const result=await client.run({tool:'eraser',points:[{x:400,y:300,pressure:1},{x:570,y:300,pressure:1}],tip:{size:50,ratio:1,angle:0,pressure:true},contours:[...ring,...other],selected:[]});client.stop();
  return {hole:contains(result.contours!,{x:300,y:300}),cut:contains(result.contours!,{x:500,y:300}),left:contains(result.contours!,{x:100,y:300}),untouched:JSON.stringify(result.contours!.find(c=>c.id===other[0].id))===JSON.stringify(other[0])};
 });expect(result).toEqual({hole:false,cut:false,left:true,untouched:true});
});

test('worker load failure leaves document unchanged and editor unlocked',async({page})=>{
 await page.route('**/geometry-worker.ts*',route=>route.abort());
 await page.locator('#brush-tool').click();await injectStroke(page);
 await expect(page.locator('#status')).toContainText('기존 윤곽선은 유지');
 await expect(page.locator('.outline')).toHaveCount(2);await expect(page.locator('#project-menu')).toBeEnabled();
});
