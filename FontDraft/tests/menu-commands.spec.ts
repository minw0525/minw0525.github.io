import { test, expect, type Page } from './fixtures';
async function menu(page: Page, category: string, action: string, group?: string) {
 await page.locator('#app-menus > details > summary').filter({hasText:category}).click();
 if(group) await page.locator('.menu-popup summary').filter({hasText:group}).click();
 await page.getByRole('button',{name:action,exact:true}).click();
}
test('menus restore side transform controls, clipboard and start point undo',async({page})=>{
 await expect(page.locator('#transform-panel #flip-horizontal')).toHaveCount(1);
 {const b=(await page.locator('.node[data-node=outer-1]').boundingBox())!;await page.mouse.click(b.x+b.width/2,b.y+b.height/2);}
 await menu(page,'컨투어','시작점 설정');await expect(page.locator('path.node[data-start=outer-1]')).toHaveCount(1);
 await page.locator('#undo').click();await expect(page.locator('path.node[data-start=outer-0]')).toHaveCount(1);
 await menu(page,'편집','전체 선택');await menu(page,'편집','선택 반전');await expect(page.locator('.node.selected,.handle.selected,.selected-segment')).toHaveCount(0);await menu(page,'편집','전체 선택');await menu(page,'편집','복사');await menu(page,'편집','붙여넣기');
 await expect(page.locator('.outline')).toHaveCount(4);await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveCount(2);
 await menu(page,'보기','핸들');await expect(page.locator('.handle').first()).toBeHidden();
 await menu(page,'보기','핸들');await expect(page.locator('.handle').first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.locator('#app-menus > details > summary').last().click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 await page.keyboard.press('Escape');await expect(page.locator('.menu-popup').last()).toBeHidden();
});
test('mask append and swap retain both layers with atomic undo',async({page})=>{
 await menu(page,'폰트','전경을 배경으로 복사','배경');await expect(page.locator('#layer-mask')).toHaveAttribute('aria-pressed','true');
 await menu(page,'폰트','전경으로 붙여넣기','배경');await expect(page.locator('.outline')).toHaveCount(4);
 await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveCount(2);
 await menu(page,'폰트','배경 비우기','배경');await expect(page.locator('.outline')).toHaveCount(0);
 await page.locator('#layer-foreground').click();await menu(page,'폰트','전경과 배경 전환','배경');await expect(page.locator('.outline')).toHaveCount(0);
 await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveCount(2);
 await page.locator('#layer-mask').click();await expect(page.locator('.outline')).toHaveCount(0);
 await page.locator('#layer-foreground').click();await page.locator('#redo').click();await expect(page.locator('.outline')).toHaveCount(0);
 await page.locator('#layer-mask').click();await expect(page.locator('.outline')).toHaveCount(2);
});
test('loop corners fill outside triangle; overlaps preserve area and unrelated contour',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {loopCorner,joinNodes}=await import('/src/contour-commands.ts');const {makeOverlap,breakAtNode}=await import('/src/geometry.ts');const {pathData}=await import('/src/model.ts');
  const c={id:'box',closed:true,nodes:[{id:'a',x:0,y:0},{id:'b',x:100,y:0},{id:'c',x:100,y:100},{id:'d',x:0,y:100}]};
  const loop=loopCorner(c,'b');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',pathData(loop,{x:0,y:0,scale:1}));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.append(path);document.body.append(svg);
  const outside=path.isPointInFill(new DOMPoint(104,4));
  const untouched={...structuredClone(c),id:'untouched',nodes:c.nodes.map(n=>({...n,id:n.id+'x',x:n.x+300}))};
  const stepped={id:'step',closed:true,nodes:[[0,0],[100,0],[100,25],[150,25],[150,75],[100,75],[100,100],[0,100]].map(([x,y],i)=>({id:'s'+i,x,y}))};
  const parts=makeOverlap([stepped,untouched],new Set(['s2','s5']));
  const sample=(cs:typeof parts,x:number,y:number)=>{path.setAttribute('d',cs.map(c=>pathData(c,{x:0,y:0,scale:1})).join(' '));return path.isPointInFill(new DOMPoint(x,-y));};
  let mismatch=0;for(let x=-10;x<=160;x+=2)for(let y=-10;y<=110;y+=2)if(sample([stepped],x,y)!==sample(parts.slice(0,2),x,y))mismatch++;
  const broken=breakAtNode([c],'b'),joined=joinNodes(broken,new Set([broken[0].nodes[0].id,broken[0].nodes.at(-1)!.id]));
  return {outside,mismatch,count:parts.length,pieceNodes:parts.slice(0,2).map(c=>c.nodes.length),lefts:parts.slice(0,2).map(c=>Math.min(...c.nodes.map(n=>n.x))).sort((a,b)=>a-b),untouched:JSON.stringify(parts.at(-1))===JSON.stringify(untouched),loop:loop.nodes,closed:joined[0].closed};
 });
 expect(result.outside).toBe(true);expect(result.mismatch).toBe(0);expect(result.count).toBe(3);expect(result.pieceNodes).toEqual([4,4]);expect(result.lefts).toEqual([0,76]);expect(result.untouched).toBe(true);expect(result.closed).toBe(true);
 expect(result.loop.some(n=>n.x===124&&n.y===0)).toBe(true);
});
test('free transform scales selected geometry and undoes in one step',async({page})=>{
 await menu(page,'편집','전체 선택');const before=await page.locator('.outline').first().getAttribute('d');
 await menu(page,'편집','자유변형');await expect(page.locator('[data-transform-handle]')).toHaveCount(9);
 const box=(await page.locator('[data-transform-handle="2"]').boundingBox())!;
 await page.mouse.move(box.x+6,box.y+6);await page.mouse.down();await page.mouse.move(box.x+36,box.y+16,{steps:5});await page.mouse.up();
 expect(await page.locator('.outline').first().getAttribute('d')).not.toBe(before);
 await page.locator('#undo').click();await expect(page.locator('.outline').first()).toHaveAttribute('d',before!);
 await page.keyboard.press('Escape');await expect(page.locator('[data-transform-handle]')).toHaveCount(0);
});
test('overlap tool taps corners and drags two nodes with one undo',async({page})=>{
 await page.evaluate(async()=>{const {createProject,saveDraft}=await import('/src/project.ts');const p=createProject('Rectangle');p.glyphs[0].contours=[{id:'rect',closed:true,nodes:[{id:'a',x:100,y:100},{id:'b',x:500,y:100},{id:'c',x:500,y:250},{id:'d',x:650,y:250},{id:'e',x:650,y:450},{id:'f',x:500,y:450},{id:'g',x:500,y:600},{id:'h',x:100,y:600}]}];await saveDraft(p);});await page.reload();
 await expect(page.locator('.outline[data-contour=rect]')).toHaveCount(1);const before=await page.locator('.outline').getAttribute('d');await page.locator('#overlap-tool').click();
 const node=async(id:string)=>{const b=(await page.locator(`[data-node=${id}]`).boundingBox())!;return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const b=await node('b');await page.mouse.click(b.x,b.y);await expect(page.locator('.node')).toHaveCount(9);
 await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveAttribute('d',before!);
 const a=await node('c'),c=await node('f');await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(c.x,c.y,{steps:5});await page.mouse.up();await expect(page.locator('.outline')).toHaveCount(2);await page.screenshot({path:test.info().outputPath('extended-overlap.png')});
 await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveAttribute('d',before!);
});
test('glyph duplication preserves every master and mask without duplicate Unicode',async({page})=>{
 await menu(page,'폰트','전경을 배경으로 복사','배경');await page.locator('#layer-foreground').click();await page.locator('#master-duplicate').click();
 await menu(page,'폰트','글리프 복제');await expect(page.locator('#glyph-properties [name=name]')).toHaveValue('o.copy');await expect(page.locator('#glyph-properties [name=unicodes]')).toHaveValue('');await expect(page.locator('.outline')).toHaveCount(2);
 await page.locator('#layer-mask').click();await expect(page.locator('.outline')).toHaveCount(2);
 await page.reload();await expect(page.locator('#glyph-properties [name=name]')).toHaveValue('o.copy');await expect(page.locator('.outline')).toHaveCount(2);
 page.once('dialog',d=>d.accept());await menu(page,'폰트','글리프 삭제');await expect(page.locator('#glyph-properties [name=name]')).toHaveValue('o');await expect(page.locator('.master-entry')).toHaveCount(2);
});
test('swap undo refuses to overwrite subsequent edits in the opposite layer',async({page})=>{
 await menu(page,'폰트','전경과 배경 전환','배경');await expect(page.locator('.outline')).toHaveCount(0);
 await page.locator('#layer-mask').click();await menu(page,'편집','전체 선택');await page.locator('[data-nudge="1,0"]').click();
 await page.locator('#layer-foreground').click();await page.locator('#undo').click();await expect(page.locator('#status')).toContainText('반대 레이어');await expect(page.locator('.outline')).toHaveCount(0);
 await page.locator('#layer-mask').click();await page.locator('#undo').click();await page.locator('#layer-foreground').click();await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveCount(2);
});
