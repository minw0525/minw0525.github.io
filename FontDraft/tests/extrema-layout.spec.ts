import { test, expect } from './fixtures';

test('extrema splits at x and y extrema while retaining curves, IDs and open status', async ({page}) => {
 const result=await page.evaluate(async()=>{
  const {addExtrema}=await import('/src/geometry.ts'),{roundNodes}=await import('/src/model.ts');
  const c={id:'curve',closed:false,nodes:[{id:'a',x:0,y:0,outgoing:{x:0,y:100}},{id:'b',x:100,y:0,incoming:{x:100,y:100}}]};
  const original=JSON.stringify(c),out=addExtrema(c);roundNodes([out]);
  const vertical={id:'v',closed:false,nodes:[{id:'c',x:0,y:0,outgoing:{x:100,y:0}},{id:'d',x:0,y:100,incoming:{x:100,y:100}}]};
  const v=addExtrema(vertical);
  return {out,v,unchanged:JSON.stringify(c)===original,repeat:addExtrema(out).nodes.length};
 });
 expect(result.unchanged).toBe(true);expect(result.out.closed).toBe(false);expect(result.out.nodes).toHaveLength(3);
 expect(result.out.nodes[0]).toMatchObject({id:'a',outgoing:{x:0,y:50}});
 expect(result.out.nodes[1]).toMatchObject({x:50,y:75,smooth:true,incoming:{x:25,y:75},outgoing:{x:75,y:75}});
 expect(result.out.nodes[2]).toMatchObject({id:'b',incoming:{x:100,y:50}});
 expect(result.v.nodes[1]).toMatchObject({x:75,y:50});expect(result.repeat).toBe(3);
});

test('extrema menu targets selection and supports undo; sidebar toggle and side preference stay synchronized',async({page},info)=>{
 await page.evaluate(async()=>{
  const {loadWorkspace,saveDraft}=await import('/src/project.ts');const w=await loadWorkspace(),p=w.projects.find(p=>p.id===w.last)!;
  p.glyphs[0].contours=[{id:'curve',closed:false,nodes:[{id:'a',x:0,y:0,outgoing:{x:0,y:100}},{id:'b',x:100,y:0,incoming:{x:100,y:100}}]}];await saveDraft(p);
 });await page.reload();
 await page.locator('#app-menus > details > summary').filter({hasText:'컨투어'}).click();await page.getByRole('button',{name:'극점 추가',exact:true}).click();
 await expect(page.locator('.node')).toHaveCount(3);await page.locator('#undo').click();await expect(page.locator('.node')).toHaveCount(2);
 await page.locator('#sidebar-toggle').click();await expect(page.locator('.sidebar')).toBeHidden();
 await page.locator('#app-menus > details > summary').filter({hasText:'보기'}).click();
 await expect(page.getByRole('button',{name:'사이드 패널',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.getByRole('button',{name:'사이드 패널',exact:true}).click();await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-pressed','true');
 await page.locator('#app-menus > details > summary').filter({hasText:'보기'}).click();await page.getByRole('button',{name:'사이드패널 왼쪽 배치',exact:true}).click();
 await expect(page.locator('#app')).toHaveClass(/sidebar-left/);
 const side=(await page.locator('.sidebar').boundingBox())!,canvas=(await page.locator('#canvas').boundingBox())!;
 expect(side.x+side.width).toBeLessThanOrEqual(canvas.x);
 await page.screenshot({path:info.outputPath('left-sidebar.png')});await page.reload();await expect(page.locator('#app')).toHaveClass(/sidebar-left/);
});

test('extrema keeps unselected contours untouched and handles two roots and existing endpoints',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {addExtrema}=await import('/src/geometry.ts');
  const c={id:'s',closed:false,nodes:[{id:'a',x:0,y:0,outgoing:{x:30,y:100}},{id:'b',x:100,y:0,incoming:{x:70,y:-100}}]};
  const out=addExtrema(c),again=addExtrema(out);
  const line={id:'line',closed:true,nodes:[{id:'l0',x:0,y:0},{id:'l1',x:100,y:0},{id:'l2',x:100,y:100}]};
  return {nodes:out.nodes,repeat:again.nodes.length,lineUnchanged:addExtrema(line)===line};
 });
 expect(result.nodes).toHaveLength(4);expect(result.nodes[1].y).toBeGreaterThan(0);expect(result.nodes[2].y).toBeLessThan(0);
 expect(result.repeat).toBe(4);expect(result.lineUnchanged).toBe(true);
 await page.evaluate(async()=>{
  const {loadWorkspace,saveDraft}=await import('/src/project.ts');const w=await loadWorkspace(),p=w.projects.find(p=>p.id===w.last)!;
  p.glyphs[0].contours=['first','second'].map((id,i)=>({id,closed:false,nodes:[{id:id+'a',x:i*200,y:100,outgoing:{x:i*200,y:200}},{id:id+'b',x:i*200+100,y:100,incoming:{x:i*200+100,y:200}}]}));await saveDraft(p);
 });await page.reload();await expect(page.locator('.node')).toHaveCount(4);
 const other=await page.locator('[data-contour="second"]').getAttribute('d'),b=(await page.locator('[data-node="firsta"]').boundingBox())!;
 await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
 await page.locator('#app-menus > details > summary').filter({hasText:'컨투어'}).click();await page.getByRole('button',{name:'극점 추가',exact:true}).click();
 await expect(page.locator('.node')).toHaveCount(5);await expect(page.locator('[data-contour="second"]')).toHaveAttribute('d',other!);
});
