import { test, expect } from './fixtures';

test('node duplication splits handles in place and preserves contour identity and geometry', async ({page}) => {
 const result = await page.evaluate(async () => {
  const {duplicateNodes}=await import('/src/contour-commands.ts');
  const {sample}=await import('/src/model.ts');const {contains}=await import('/src/geometry.ts');
  const cs=sample(), original=JSON.stringify(cs);
  const r=duplicateNodes(cs,new Set(['outer-0','outer-1','outer-3']));
  let differences=0;
  for(let x=50;x<550;x+=17)for(let y=0;y<600;y+=17)if(contains(cs,{x,y})!==contains(r.contours,{x,y}))differences++;
  const open={id:'open',closed:false,nodes:[{id:'a',x:0,y:0},{id:'b',x:100,y:50}]};
  const ends=duplicateNodes([open],new Set(['a','b'])).contours[0];
  return {original:original===JSON.stringify(cs),differences,ids:r.contours.map(c=>c.id),nodes:r.contours[0].nodes,duplicates:[...r.duplicated],untouched:r.contours[1]===cs[1],ends};
 });
 expect(result.original).toBe(true);expect(result.differences).toBe(0);expect(result.untouched).toBe(true);
 expect(result.ids).toEqual(['outer','inner']);expect(result.nodes).toHaveLength(7);
 expect(new Set(result.nodes.map(n=>n.id)).size).toBe(7);
 for(const id of ['outer-0','outer-1','outer-3']) {
  const i=result.nodes.findIndex(n=>n.id===id),a=result.nodes[i],b=result.nodes[i+1];
  expect(b.x).toBe(a.x);expect(b.y).toBe(a.y);expect(a.outgoing).toBeUndefined();expect(b.incoming).toBeUndefined();
  expect(a.incoming).toBeDefined();expect(b.outgoing).toBeDefined();expect(result.duplicates).toContain(b.id);
 }
 expect(result.ends.closed).toBe(false);expect(result.ends.nodes).toHaveLength(4);
});

test('menu duplicates only selected anchors and supports move, undo, redo and persistence', async ({page}) => {
 const node=page.locator('[data-node="outer-0"]'),box=(await node.boundingBox())!;
 const x=await node.getAttribute('data-x'),y=await node.getAttribute('data-y');
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await page.locator('#app-menus > details > summary').filter({hasText:'컨투어'}).click();
 await page.getByRole('button',{name:'노드 복제',exact:true}).click();
 await expect(page.locator('.outline')).toHaveCount(2);await expect(page.locator('.node')).toHaveCount(9);
 const selected=page.locator('.node.selected');await expect(selected).toHaveCount(1);
 const id=await selected.getAttribute('data-node');expect(id).not.toBe('outer-0');
 await expect(selected).toHaveAttribute('data-x',x!);await expect(selected).toHaveAttribute('data-y',y!);
 await expect(page.locator('.handle.selected')).toHaveCount(0);
 await page.locator('#canvas').focus();await page.keyboard.press('ArrowRight');
 await expect(node).toHaveAttribute('data-x',x!);await expect(selected).toHaveAttribute('data-x',String(Number(x)+1));
 await page.locator('#undo').click();await expect(page.locator(`[data-node="${id}"]`)).toHaveAttribute('data-x',x!);
 await page.locator('#undo').click();await expect(page.locator('.node')).toHaveCount(8);
 await expect(page.locator('[data-handle="outer-0-outgoing"]')).toHaveCount(1);
 await page.locator('#redo').click();await expect(page.locator('.node')).toHaveCount(9);
 await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');await page.reload();
 await expect(page.locator(`[data-node="${id}"]`)).toHaveCount(1);await expect(page.locator('.outline')).toHaveCount(2);
});
