import { test, expect, contourPoint } from './fixtures';
import { readFileSync } from 'node:fs';

test('pen inserts on a segment and removes the node with a fitted curve and undo', async ({ page }) => {
  const q = await contourPoint(page);
  await page.locator('#pen-tool').click(); await page.mouse.click(q.x, q.y);
  await expect(page.locator('.node')).toHaveCount(9);
  const added = page.locator('.node.selected'), b = (await added.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('.node')).toHaveCount(8);
  await page.locator('#undo').click(); await expect(page.locator('.node')).toHaveCount(9);
  const error = await page.evaluate(async () => {
    const { insertNode, removeNodePreservingCurve } = await import('/src/geometry.ts');
    const { sample, pathData } = await import('/src/model.ts');
    const c = sample()[0], added = insertNode(c, { x: 460, y: 490 });
    const n = added.nodes.find(n => !c.nodes.some(old => old.id === n.id))!;
    const restored = removeNodePreservingCurve(added, n.id)!;
    const make = c => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', pathData(c, {x:0,y:0,scale:1})); return p; };
    const a = make(c), b = make(restored); let max = 0;
    for(let i=0;i<=100;i++){const p=a.getPointAtLength(a.getTotalLength()*i/100),q=b.getPointAtLength(b.getTotalLength()*i/100);max=Math.max(max,Math.hypot(p.x-q.x,p.y-q.y));}
    return max;
  });
  expect(error).toBeLessThan(.05);
});

test('tip handles control flattening and angle and size input stays separate; proof inversion is independent', async ({ page }, info) => {
  await page.locator('#brush-tool').click();
  const svg = page.locator('#tip-preview');
  const center = await svg.evaluate((e: SVGSVGElement) => { const p=new DOMPoint(0,0).matrixTransform(e.getScreenCTM()!);return {x:p.x,y:p.y}; });
  const grip = await page.locator('#tip-angle-handle').evaluate((e: SVGGraphicsElement)=>{const p=new DOMPoint(0,0).matrixTransform(e.getScreenCTM()!);return {x:p.x,y:p.y};});
  await page.mouse.move(grip.x,grip.y);await page.mouse.down();await page.mouse.move(center.x,center.y-60);await page.mouse.up();
  await expect(page.locator('#tip-angle-handle')).toHaveAttribute('aria-valuenow', '90');
  const ratio = await page.locator('#tip-ratio-handle').evaluate((e: SVGGraphicsElement)=>{const p=new DOMPoint(0,0).matrixTransform(e.getScreenCTM()!);return {x:p.x,y:p.y};});
  await page.mouse.move(ratio.x,ratio.y);await page.mouse.down();await page.mouse.move(center.x+40,center.y);await page.mouse.up();
  expect(Number(await page.locator('#tip-ratio-handle').getAttribute('aria-valuenow'))).toBeGreaterThan(45);
  await page.locator('#tip-size').fill('1000');
  await expect(page.locator('#tip-size-slider')).toHaveValue('1000');
  await expect(page.locator('#tip-ellipse')).toHaveAttribute('rx', '48');
  await page.locator('#tip-angle-handle').evaluate(el => { for (let i = 0; i < 56; i++) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); });
  await expect(page.locator('#angle-value')).toHaveText('146°');
  for (const id of ['angle-value', 'ratio-value']) {
    const rotation = await page.locator(`#${id}`).evaluate((el: SVGGraphicsElement) => { const m = el.getCTM()!; return Math.atan2(m.b, m.a) * 180 / Math.PI; });
    expect(Math.abs(rotation)).toBeLessThanOrEqual(90);
  }

  await page.locator('#proof-invert').click();await expect(page.locator('#proof-fill')).toHaveCSS('fill','rgb(255, 255, 255)');
  await expect(page.locator('#proof-panel')).toHaveCSS('background-color','rgb(17, 17, 17)');
  await expect(page.locator('#preview-mode')).toHaveAttribute('aria-pressed','false');
  await page.screenshot({path:info.outputPath('tip-proof.png')});
});

test('preview accepts pen pointer without click and suppresses the duplicate click', async ({page})=>{
  const button = page.locator('#preview-mode');
  await button.dispatchEvent('pointerdown',{pointerId:9,pointerType:'pen',button:0});
  await button.dispatchEvent('pointerup',{pointerId:9,pointerType:'pen',button:0});
  await expect(button).toHaveAttribute('aria-pressed','true');
  await button.dispatchEvent('click',{detail:1});await expect(button).toHaveAttribute('aria-pressed','true');
  await button.dispatchEvent('pointerdown',{pointerId:10,pointerType:'pen',button:0});
  await button.dispatchEvent('pointerup',{pointerId:10,pointerType:'pen',button:0});
  await expect(button).toHaveAttribute('aria-pressed','false');
});

test('exports a complete string as SVG and PNG and reports missing characters',async({page})=>{
  await page.locator('#project-menu').click();await page.locator('#export-image').click();
  await page.locator('#image-text').fill('ooo');
  const svgDownload=page.waitForEvent('download');await page.locator('#image-download').click();
  const svg=readFileSync((await (await svgDownload).path())!,'utf8');
  expect((svg.match(/<path /g)||[]).length).toBe(3);
  await page.locator('#image-format').selectOption('png');
  const pngDownload=page.waitForEvent('download');await page.locator('#image-download').click();
  const png=readFileSync((await (await pngDownload).path())!);
  expect(png.subarray(1,4).toString()).toBe('PNG');expect(png.readUInt32BE(20)).toBe(512);expect(png.readUInt32BE(16)).toBeGreaterThan(1000);
  await page.locator('#image-text').fill('없는문자');await page.locator('#image-download').click();
  await expect(page.locator('#image-error')).toContainText('프로젝트에 없는 문자');
  const pixels=await page.evaluate(async()=>{
    const {textImage,pngImage}=await import('/src/image-export.ts');const {createProject}=await import('/src/project.ts');
    const r=textImage(createProject('Image',true),'oo\no'); const blob=await pngImage(r.svg,r.width,r.height);
    const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);const data=ctx.getImageData(0,0,r.width,r.height).data;
    let filled=0;for(let i=3;i<data.length;i+=4)if(data[i])filled++;
    return filled;
  });expect(pixels).toBeGreaterThan(1000);
});
