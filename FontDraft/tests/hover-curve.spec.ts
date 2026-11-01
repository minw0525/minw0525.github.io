import {test,expect,type Page} from './fixtures';
async function lineFixture(page:Page) {
 await page.evaluate(async()=>{const {createProject,saveDraft}=await import('/src/project.ts');const p=createProject('Line');p.glyphs[0].contours=[{id:'line',closed:false,nodes:[{id:'a',x:100,y:400},{id:'b',x:500,y:400}]}];await saveDraft(p);});await page.reload();await expect(page.locator('[data-contour=line]')).toHaveCount(1);
 return page.locator('[data-contour=line]').evaluate((p:SVGPathElement)=>{const q=p.getPointAtLength(p.getTotalLength()/2),r=p.ownerSVGElement!.getBoundingClientRect();return {x:q.x+r.left,y:q.y+r.top};});
}
test('Opt click converts a straight segment to editable cubic, preserves shape and undo',async({page})=>{
 const q=await lineFixture(page),path=page.locator('[data-contour=line]'),before=await path.getAttribute('d');
 await page.locator('#option-modifier').click();await page.mouse.click(q.x,q.y+7);await expect(page.locator('[data-handle]')).toHaveCount(2);expect(await path.getAttribute('d')).toContain('C');
 const points=await page.locator('[data-handle]').evaluateAll(h=>h.map(e=>e.getAttribute('cy')));expect(points[0]).toBe(points[1]);
 await page.locator('#undo').click();await expect(path).toHaveAttribute('d',before!);await expect(page.locator('[data-handle]')).toHaveCount(0);
 await page.locator('#option-modifier').click();await page.mouse.click(q.x,q.y);await expect(page.locator('[data-handle]')).toHaveCount(0);
 await page.keyboard.down('Alt');await page.mouse.click(q.x,q.y);await page.keyboard.up('Alt');await expect(page.locator('[data-handle]')).toHaveCount(2);
});
test('pen proximity hint matches insertion and removal; jitter does not cancel a tap',async({page})=>{
 const q=await lineFixture(page);await page.locator('#pen-tool').click();
 await page.mouse.move(q.x,q.y+14);await expect(page.locator('.cursor-hint')).toHaveText('+');
 await page.mouse.down();await page.mouse.move(q.x+3,q.y+17);await page.mouse.up();await expect(page.locator('.node')).toHaveCount(3);await expect(page.locator('.node.selected')).toHaveAttribute('data-y','400');
 const n=(await page.locator('.node.selected').boundingBox())!;await page.mouse.move(n.x+n.width/2,n.y+n.height/2);await expect(page.locator('.cursor-hint')).toHaveText('−');await page.mouse.click(n.x+n.width/2,n.y+n.height/2);await expect(page.locator('.node')).toHaveCount(2);
 await page.mouse.move(q.x,q.y+24);await expect(page.locator('.cursor-hint')).toHaveCount(0);
 await page.locator('#canvas').dispatchEvent('wheel',{deltaY:-200,clientX:q.x,clientY:q.y});await page.mouse.move(q.x,q.y+14);await expect(page.locator('.cursor-hint')).toHaveText('+');
});
test('pen hover displays all tool cursors without drawing; brush tips stay unchanged',async({page})=>{
 const q=await lineFixture(page),canvas=page.locator('#canvas');
 for(const tool of ['select','pen','rectangle','ellipse','knife','overlap','annotation','pan']) {
  await page.locator(`#${tool}-tool`).click();await canvas.dispatchEvent('pointermove',{pointerId:77,pointerType:'pen',buttons:0,pressure:0,clientX:q.x,clientY:q.y+60});
  await expect(page.locator('.tool-cursor')).toHaveAttribute('data-tool',tool);await expect(page.locator('.node')).toHaveCount(2);
 }
 for(const tool of ['brush','eraser']) {await page.locator(`#${tool}-tool`).click();await canvas.dispatchEvent('pointermove',{pointerId:77,pointerType:'pen',buttons:0,pressure:0,clientX:q.x,clientY:q.y+60});await expect(page.locator('#brush-cursor ellipse')).toHaveCount(1);await expect(page.locator('.tool-cursor')).toHaveAttribute('data-tool',tool);await expect(page.locator('.cursor-icon')).toHaveCount(1);}
 await canvas.dispatchEvent('pointerleave',{pointerId:77,pointerType:'pen'});await expect(page.locator('#brush-cursor')).toBeEmpty();await expect(page.locator('.node')).toHaveCount(2);
});
test('extended overlaps preserve winding and silhouette under rotation and reversal',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {makeOverlap}=await import('/src/geometry.ts');const {reverseContour}=await import('/src/model.ts');
  const c={id:'step',closed:true,nodes:[[0,0],[100,0],[100,25],[150,25],[150,75],[100,75],[100,100],[0,100]].map(([x,y],i)=>({id:'s'+i,x,y}))};
  const variants=[c,structuredClone(c),structuredClone(c)];reverseContour(variants[1]);for(const n of variants[2].nodes)[n.x,n.y]=[-n.y,n.x];
  const area=(nodes:typeof c.nodes)=>nodes.reduce((sum,n,i)=>{const q=nodes[(i+1)%nodes.length];return sum+n.x*q.y-q.x*n.y;},0);
  return variants.map(c=>{const before=JSON.stringify(c),parts=makeOverlap([c],new Set(['s2','s5']));return {nodes:parts.map(c=>c.nodes.length),sameDirection:parts.every(p=>Math.sign(area(p.nodes))===Math.sign(area(c.nodes))),unchanged:before===JSON.stringify(c)};});
 });
 for(const r of result){expect(r.nodes).toEqual([4,4]);expect(r.sameDirection).toBe(true);expect(r.unchanged).toBe(true);}
});

test('curved overlap edges retain control points with unique node IDs; invalid cuts leave input intact',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {makeOverlap}=await import('/src/geometry.ts');
  const c={id:'step',closed:true,nodes:[[0,0],[100,0],[100,25],[150,25],[150,75],[100,75],[100,100],[0,100]].map(([x,y],i)=>({id:'s'+i,x,y}))};
  c.nodes[2].outgoing={x:125,y:25};c.nodes[3].incoming={x:140,y:35};
  const before=JSON.stringify(c),parts=makeOverlap([c],new Set(['s2','s5'])),nodes=parts.flatMap(c=>c.nodes);
  let rejected=false;try{makeOverlap([c],new Set(['s0','s6']));}catch{rejected=true;}
  return {unique:new Set(nodes.map(n=>n.id)).size===nodes.length,handles:nodes.flatMap(n=>[n.incoming,n.outgoing].filter(Boolean)),rejected,unchanged:before===JSON.stringify(c)};
 });
 expect(result.unique).toBe(true);expect(result.handles).toEqual(expect.arrayContaining([{x:125,y:25},{x:140,y:35}]));expect(result.rejected).toBe(true);expect(result.unchanged).toBe(true);
});
