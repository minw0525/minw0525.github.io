import { test, expect } from './fixtures';
test.use({ hasTouch: true });
const currentMaster = page => page.locator('.master-entry:has([data-layer][aria-pressed=true])').getAttribute('data-master');
const selectMaster = (page, id) => page.locator(`.master-entry[data-master="${id}"] [data-layer=foreground]`).click();

test('Mask proof follows active layer edits and isolated histories',async({page})=>{
 await page.locator('#canvas').dispatchEvent('wheel',{deltaY:-100,clientX:400,clientY:300});
 const left=await page.locator('.sidebearing').first().getAttribute('x1');
 const before=await page.locator('#proof-fill').getAttribute('d');
 await page.locator('#app-menus > details > summary').filter({hasText:'폰트'}).click();await page.locator('.menu-popup summary').filter({hasText:'배경'}).click();await page.getByRole('button',{name:'전경을 배경으로 복사',exact:true}).click();await expect(page.locator('#layer-mask')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.outline')).toHaveCount(2);await expect(page.locator('.sidebearing').first()).toHaveAttribute('x1',left!);
 await page.locator('#canvas').focus();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.press('ArrowRight');
 const changed=await page.locator('.outline').first().getAttribute('d');
 await expect(page.locator('#proof-fill')).not.toHaveAttribute('d',before!);
 await page.locator('#layer-foreground').click();await expect(page.locator('.outline').first()).not.toHaveAttribute('d',changed!);
 await page.locator('#layer-mask').click();await expect(page.locator('.outline').first()).toHaveAttribute('d',changed!);
 await page.locator('#undo').click();await expect(page.locator('.outline').first()).not.toHaveAttribute('d',changed!);
 await page.locator('#undo').click();await expect(page.locator('.outline')).toHaveCount(0);
 await expect(page.locator('#proof-fill')).toHaveAttribute('d','');
 await page.locator('#layer-foreground').click();await expect(page.locator('.outline')).toHaveCount(2);
 await expect(page.locator('#proof-fill')).toHaveAttribute('d',before!);
 await page.locator('#mask-visible').click();await expect(page.locator('.mask-reference')).toHaveAttribute('d','');
});

test('master duplication is font-wide and glyph widths, baselines, masks survive UFOZ',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {createProject,createGlyph,addMaster,drawing,masterMetrics}=await import('/src/project.ts');const {exportUFO,importUFO}=await import('/src/ufo.ts');const {unzipSync,strFromU8}=await import('/node_modules/.vite/deps/fflate.js');
  const p=createProject('Masters',true), a=createGlyph('A',[65]);p.glyphs.push(a);p.glyphs[0].mask={contours:structuredClone(p.glyphs[0].contours),annotations:[{id:'note',x:1,y:2,text:'mask'}]};
  const master=addMaster(p,'Bold',true);master.ascender=850;drawing(p,p.glyphs[0]).width=700;drawing(p,a).width=900;drawing(p,p.glyphs[0]).contours[0].nodes[0].x+=20;
  p.editMask=true;p.maskVisible=false;
  const bytes=await exportUFO(p), restored=await importUFO(bytes), files=unzipSync(bytes);
  return {count:restored.masters?.length,widths:restored.glyphs.map(g=>drawing(restored,g).width),defaultWidth:restored.glyphs[0].width,asc:masterMetrics(restored).ascender,mask:drawing(restored,restored.glyphs[0]).mask?.annotations?.[0].text,active:restored.activeMaster,expected:master.id,edit:restored.editMask,visible:restored.maskVisible,layers:strFromU8(files['FontDraft.ufo/layercontents.plist']),originalX:p.glyphs[0].contours[0].nodes[0].x,newX:drawing(restored,restored.glyphs[0]).contours[0].nodes[0].x};
 });expect(result.count).toBe(1);expect(result.widths).toEqual([700,900]);expect(result.defaultWidth).toBe(600);expect(result.asc).toBe(850);expect(result.mask).toBe('mask');expect(result.active).toBe(result.expected);expect(result.edit).toBe(true);expect(result.visible).toBe(false);expect(result.layers).toContain('public.background');expect(result.newX).toBe(result.originalX+20);
});

test('master UI switching, blank creation, duplication, rename and deletion',async({page})=>{
 await page.locator('#master-duplicate').click();await expect(page.locator('.master-entry')).toHaveCount(2);await expect(page.locator('.outline')).toHaveCount(2);
 await page.locator('#layer-foreground .master-name').dblclick();
 await page.locator('#master-name').fill('Bold');await page.locator('#master-name').press('Tab');
 const bold=await currentMaster(page);
 await page.locator('#canvas').focus();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.press('ArrowRight');
 const changed=await page.locator('.outline').first().getAttribute('d');
 await selectMaster(page, 'default');await expect(page.locator('.outline').first()).not.toHaveAttribute('d',changed!);
 await selectMaster(page, bold);await expect(page.locator('.outline').first()).toHaveAttribute('d',changed!);
 await page.locator('#undo').click();await expect(page.locator('.outline').first()).not.toHaveAttribute('d',changed!);
 await page.locator('#master-add').click();await expect(page.locator('.outline')).toHaveCount(0);
 page.once('dialog',d=>d.accept());await page.locator('#master-delete').click();await expect(page.locator('.master-entry')).toHaveCount(2);
 await page.reload();await expect(page.locator('.master-entry')).toHaveCount(2);
 await selectMaster(page, bold);await expect(page.locator('#layer-foreground .master-name')).toHaveText('Bold');
});

test('master metrics and advances are independent; default deletion promotes a complete master',async({page})=>{
 await page.locator('#master-duplicate').click();const id=await currentMaster(page);
 await page.locator('#glyph-properties [name=width]').fill('720');await page.locator('#glyph-properties [name=width]').press('Tab');
 await page.locator('#project-menu').click();await page.locator('#project-form [name=ascender]').fill('900');await page.locator('#project-form button[type=submit]').click();
 await selectMaster(page, 'default');await expect(page.locator('#glyph-properties [name=width]')).toHaveValue('600');
 await page.locator('#project-menu').click();await expect(page.locator('#project-form [name=ascender]')).toHaveValue('600');await page.locator('[data-close=project-dialog]').click();
 await selectMaster(page, id);await expect(page.locator('#glyph-properties [name=width]')).toHaveValue('720');
 await selectMaster(page, 'default');page.once('dialog',d=>d.accept());await page.locator('#master-delete').click();
 await expect(page.locator('.master-entry')).toHaveCount(1);await expect(page.locator('#glyph-properties [name=width]')).toHaveValue('720');await expect(page.locator('#master-delete')).toBeDisabled();
 await page.locator('#project-menu').click();await expect(page.locator('#project-form [name=ascender]')).toHaveValue('900');
});

test('image output uses current master foreground even during Mask editing',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {createProject,addMaster,drawing}=await import('/src/project.ts');const {textImage}=await import('/src/image-export.ts');
  const p=createProject('Images',true),base=textImage(p,'o').svg;addMaster(p,'Empty',false);drawing(p,p.glyphs[0]).mask={contours:p.glyphs[0].contours};p.editMask=true;
  const image=textImage(p,'o').svg;return {base,image};
 });expect(result.base).toContain('M');expect(result.image).toContain('d=""');
});

test('background-only standard UFO opens; inconsistent master metadata is rejected',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {createProject}=await import('/src/project.ts'),{exportUFO,importUFO}=await import('/src/ufo.ts'),{unzipSync,zipSync,strToU8,strFromU8}=await import('/node_modules/.vite/deps/fflate.js');
  const p=createProject('Mask',true);p.glyphs[0].mask={contours:structuredClone(p.glyphs[0].contours)};const files=unzipSync(await exportUFO(p));
  const bad={...files};bad['FontDraft.ufo/lib.plist']=strToU8(strFromU8(files['FontDraft.ufo/lib.plist']).replace('<string>default</string>','<string>missing-master</string>'));
  let rejected=false;try{await importUFO(zipSync(bad));}catch{rejected=true;}
  delete files['FontDraft.ufo/lib.plist'];const restored=await importUFO(zipSync(files));return {rejected,mask:restored.glyphs[0].mask?.contours.length};
 });expect(result.rejected).toBe(true);expect(result.mask).toBe(2);
});

test('brush Worker edits Mask only and persists active layer after reload',async({page})=>{
 const proof=await page.locator('#proof-fill').getAttribute('d');
 await page.locator('#layer-mask').click();await page.locator('#brush-tool').click();
 const b=(await page.locator('#canvas').boundingBox())!;
 await page.mouse.move(b.x+80,b.y+90);await page.mouse.down();await page.mouse.move(b.x+220,b.y+150,{steps:20});await page.mouse.up();
 await expect(page.locator('.outline')).toHaveCount(1);await expect(page.locator('#canvas')).toHaveAttribute('data-geometry-pending','0');
 await expect(page.locator('#proof-fill')).not.toHaveAttribute('d',proof!);
 const maskProof=await page.locator('#proof-fill').getAttribute('d');await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');
 await page.reload();await expect(page.locator('#layer-mask')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.outline')).toHaveCount(1);
 await expect(page.locator('#proof-fill')).toHaveAttribute('d',maskProof!);
 await page.locator('#layer-foreground').click();await expect(page.locator('.outline')).toHaveCount(2);
 await expect(page.locator('#proof-fill')).toHaveAttribute('d',proof!);
});

test('inline master names support double tap, commit, cancel and duplicate rejection', async ({page}) => {
 await expect(page.locator('#master-name')).toHaveCount(0);
 const name = page.locator('#layer-foreground .master-name');
 await name.tap();await name.tap();
 await expect(page.locator('#master-name')).toBeFocused();
 await page.locator('#master-name').fill('Thin');await page.locator('#master-name').press('Enter');
 await expect(name).toHaveText('Thin');await expect(page.locator('#master-name')).toHaveCount(0);
 await name.dblclick();await page.locator('#master-name').fill('Discard');await page.locator('#master-name').press('Escape');
 await expect(name).toHaveText('Thin');
 await name.dblclick();await page.locator('#master-name').fill('Light');await page.locator('#canvas').click({position:{x:30,y:30}});
 await expect(name).toHaveText('Light');
 await page.locator('#master-add').click();await name.dblclick();
 await page.locator('#master-name').fill('Light');await page.locator('#master-name').press('Enter');
 await expect(name).toHaveText('Master');await expect(page.locator('#master-error')).toContainText('중복');
});

test('master eyes overlay references without switching or altering the active drawing', async ({page}, info) => {
 await page.locator('#master-duplicate').click();const bold = await currentMaster(page);
 await selectMaster(page, 'default');
 const proof = await page.locator('#proof-fill').getAttribute('d');
 const eye = page.locator(`[data-master-visible="${bold}"]`);
 await expect(eye).toHaveAttribute('aria-pressed','false');
 await eye.click();
 await expect(eye).toHaveAttribute('aria-pressed','true');
 expect(await currentMaster(page)).toBe('default');
 await expect(page.locator('.master-reference')).toHaveCount(1);
 await expect(page.locator('.node')).toHaveCount(8);
 await expect(page.locator('#proof-fill')).toHaveAttribute('d',proof!);
 await expect(page.locator('[data-master-visible="default"]')).toBeDisabled();
 await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');await page.reload();
 await expect(page.locator('.master-reference')).toHaveCount(1);
 const restored = await page.evaluate(async () => {
   const {loadWorkspace} = await import('/src/project.ts');const {exportUFO,importUFO}=await import('/src/ufo.ts');
   const w=await loadWorkspace(),p=w.projects.find(p=>p.id===w.last)!;
   return (await importUFO(await exportUFO(p))).visibleMasters;
 });
 expect(restored).toEqual([bold]);
 await eye.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('master-eyes.png')});
 await selectMaster(page,bold);await expect(page.locator('.master-reference')).toHaveCount(0);
 await selectMaster(page,'default');await expect(page.locator('.master-reference')).toHaveCount(1);
 await eye.click();await expect(page.locator('.master-reference')).toHaveCount(0);
});
