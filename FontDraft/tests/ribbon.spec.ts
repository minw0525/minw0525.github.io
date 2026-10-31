import {test,expect} from './fixtures';

test('reversing selected contour preserves shape, swaps winding, and undoes',async({page})=>{
 const outer=page.locator('.outline[data-contour=outer]'),inner=page.locator('.outline[data-contour=inner]');
 const before=await outer.getAttribute('d'),other=await inner.getAttribute('d');
 const measurement=()=>outer.evaluate((p:SVGPathElement)=>({length:p.getTotalLength(),box:[p.getBBox().x,p.getBBox().y,p.getBBox().width,p.getBBox().height]}));
 const geometry=await measurement();
 const marker=page.locator('.node[data-start=outer-0]');
 await expect(marker).toHaveAttribute('transform',/^rotate\(0 /);
 const filled=()=>page.locator('.glyph-fill').evaluate((p:SVGPathElement)=>{const b=p.getBBox();return p.isPointInFill(new DOMPoint(b.x+b.width/2,b.y+b.height/2));});
 expect(await filled()).toBe(false);
 {const b=(await page.locator('.node[data-node=outer-0]').boundingBox())!;await page.mouse.click(b.x+b.width/2,b.y+b.height/2);}await page.locator('#app-menus > details > summary').filter({hasText:'컨투어'}).click();await page.getByRole('button',{name:'방향 반전',exact:true}).click();
 await expect(marker).toHaveCount(1);await expect(marker).toHaveAttribute('data-x','300');await expect(marker).toHaveAttribute('data-y','575');await expect(marker).toHaveAttribute('transform',/^rotate\(-?180 /);
 const after=await measurement();expect(after.length).toBeCloseTo(geometry.length,2);for(let i=0;i<4;i++)expect(after.box[i]).toBeCloseTo(geometry.box[i],3);
 await expect(inner).toHaveAttribute('d',other!);expect(await filled()).toBe(true);
 await page.locator('#app-menus > details > summary').filter({hasText:'컨투어'}).click();await page.getByRole('button',{name:'방향 반전',exact:true}).click();await expect(outer).toHaveAttribute('d',before!);expect(await filled()).toBe(false);
 await page.locator('#undo').click();expect(await filled()).toBe(true);await page.locator('#undo').click();await expect(outer).toHaveAttribute('d',before!);
});

test('open cubic reversal preserves endpoints and handles, then restores on undo',async({page})=>{
 await page.evaluate(async()=>{const {createProject,saveDraft}=await import('/src/project.ts');const p=createProject('Open');p.glyphs[0].contours=[{id:'open',closed:false,nodes:[{id:'a',x:100,y:100,outgoing:{x:150,y:300}},{id:'b',x:400,y:400,incoming:{x:300,y:100}}]}];await saveDraft(p);});await page.reload();
 const path=page.locator('.outline[data-contour=open]'),before=await path.getAttribute('d');
 {const b=(await page.locator('.node[data-node=a]').boundingBox())!;await page.mouse.click(b.x+b.width/2,b.y+b.height/2);}await page.locator('#app-menus > details > summary').filter({hasText:'컨투어'}).click();await page.getByRole('button',{name:'방향 반전',exact:true}).click();
 const nodes=await page.locator('.node').evaluateAll(n=>n.map(e=>e.getAttribute('data-node')));expect(nodes).toEqual(['b','a']);await expect(page.locator('[data-handle]')).toHaveCount(2);
 await page.locator('#undo').click();await expect(path).toHaveAttribute('d',before!);
});

test('start direction follows cubic tangent, including collapsed handles and segments',async({page})=>{
 const directions=await page.evaluate(async()=>{
  const {contourStartDirection}=await import('/src/model.ts');
  const start={id:'a',x:0,y:0},end={id:'b',x:100,y:0};
  return [
   {nodes:[{...start,outgoing:{x:0,y:50}},end]},
   {nodes:[{...start,outgoing:{x:0,y:0}},{...end,incoming:{x:25,y:-25}}]},
   {nodes:[start,{...start,id:'duplicate'},end]},
  ].map(c=>contourStartDirection({id:'c',closed:false,...c}));
 });
 expect(directions).toEqual([{x:0,y:50},{x:25,y:-25},{x:100,y:0}]);
});
