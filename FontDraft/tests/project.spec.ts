import { seedDemo } from './fixtures';
import { expect, test, type Page } from './fixtures';
import { writeFileSync } from 'node:fs';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

async function ready(page: Page) { await page.goto('/'); await expect(page.locator('.node')).toHaveCount(8); await expect(page.locator('#save-status')).toHaveText('기기에 저장됨'); }
async function addGlyph(page: Page, name: string, code: string) {
  await page.locator('#add-glyph').click();
  await page.locator('#glyph-form [name=characters]').fill(String.fromCodePoint(parseInt(code.replace('U+', '').split(' ')[0], 16)));
  await page.locator('#glyph-form button[type=submit]').click();
}
async function rectangle(page: Page) {
  await page.locator('#rectangle-tool').click();
  const b = (await page.locator('#canvas').boundingBox())!;
  await page.mouse.move(b.x + b.width * .4, b.y + b.height * .35); await page.mouse.down();
  await page.mouse.move(b.x + b.width * .65, b.y + b.height * .7); await page.mouse.up();
}

test('glyph switching keeps geometry, per-glyph undo and local reload', async ({ page }) => {
  await ready(page);
  await addGlyph(page, '가', 'U+AC00');
  await expect(page.locator('.node')).toHaveCount(0);
  await rectangle(page); await expect(page.locator('.node')).toHaveCount(4);
  const points = await page.locator('.node').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-x'), n.getAttribute('data-y')]));
  await page.locator('.glyph-card').filter({hasText:/^o$/}).click();
  await expect(page.locator('.node')).toHaveCount(8); await expect(page.locator('#undo')).toBeDisabled();
  await page.locator('.glyph-card').filter({hasText:/^uniAC00$/}).click();
  await page.locator('#undo').click(); await expect(page.locator('.node')).toHaveCount(0);
  await page.locator('#redo').click(); await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');
  await page.reload(); await expect(page.locator('.node')).toHaveCount(4);
  expect(await page.locator('.node').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-x'), n.getAttribute('data-y')]))).toEqual(points);
  await expect(page.locator('#glyph-metrics')).toContainText('LSB');
});

test('new project keeps previous project; metadata and duplicate glyph validation', async ({ page }) => {
  await ready(page); await page.locator('#project-menu').click(); await page.locator('#new-project').click();
  await page.locator('#project-form [name=name]').fill('테스트 & 스케치');
  await page.locator('#project-form button[type=submit]').click();
  await expect(page.locator('.node')).toHaveCount(0); await expect(page.locator('#glyph-properties [name=width]')).toHaveValue('600');
  await page.locator('#add-glyph').click(); await page.locator('#glyph-form [name=characters]').fill('AA');
  await page.locator('#glyph-form button[type=submit]').click(); await expect(page.locator('.glyph-card')).toHaveCount(1);
  await page.locator('#project-menu').click(); await page.locator('#project-list .project-open').filter({ hasText: '글리프 스케치' }).click();
  await page.locator('#project-dialog [data-close]').click(); await expect(page.locator('.node')).toHaveCount(8);
});

test('UFOZ download reopens in a fresh browser session', async ({ page, browser }, testInfo) => {
  await ready(page); await addGlyph(page, '가', 'AC00 0041'); await rectangle(page);
  const points = await page.locator('.node').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-x'), n.getAttribute('data-y')]));
  const downloadPromise = page.waitForEvent('download'); await page.locator('#save-file').click();
  const download = await downloadPromise, path = testInfo.outputPath('roundtrip.ufoz'); await download.saveAs(path);
  expect(download.suggestedFilename().normalize('NFC')).toBe('글리프 스케치.ufoz');
  const fresh = await browser.newContext(); const opened = await fresh.newPage(); await seedDemo(opened); await ready(opened);
  await opened.locator('#project-menu').click(); await opened.locator('#file-input').setInputFiles(path);
  await expect(opened.locator('#project-dialog')).not.toBeVisible(); await expect(opened.locator('#file-dialog')).not.toBeVisible();
  await expect(opened.locator('.glyph-card')).toHaveCount(2);
  await opened.locator('.glyph-card').filter({hasText:/^uniAC00$/}).click();
  await expect(opened.locator('.node')).toHaveCount(4);
  expect(await opened.locator('.node').evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-x'), n.getAttribute('data-y')]))).toEqual(points);
  await expect(opened.locator('#glyph-properties [name=width]')).toHaveValue('600'); await fresh.close();
});

test('standard GLIF preserves cyclic cubic handles, open curves, empty glyph and winding', async ({ page }, testInfo) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { createProject, createGlyph, roundProject } = await import('/src/project.ts');
    const { exportUFO, importUFO } = await import('/src/ufo.ts');
    const { contains } = await import('/src/geometry.ts');
    const p = createProject('한글 & <Sketch>', true), open = createGlyph('open', [0x1f600]), empty = createGlyph('space', [32]);
    open.contours = [{ id: 'open"contour', closed: false, nodes: [{ id: 'point"1', x: -12.125, y: 5, outgoing: { x: 30, y: 51 } }, { id: 'point2', x: 80, y: 90, incoming: { x: 71.4, y: -10 } }, { id: 'point3', x: 110, y: 40 }] }];
    p.glyphs.push(open, empty);
    const bytes = await exportUFO(p), restored = await importUFO(bytes);
    const strip = (g) => g.map(({ id, ...rest }) => rest);
    return { original: strip(roundProject(structuredClone(p)).glyphs), restored: strip(restored.glyphs), name: restored.name, hole: contains(restored.glyphs[0].contours, { x: 300, y: 300 }), bytes: Array.from(bytes) };
  });
  expect(result.restored).toEqual(result.original); expect(result.name).toBe('한글 & <Sketch>'); expect(result.hole).toBe(false);
  writeFileSync(testInfo.outputPath('standard.ufoz'), Buffer.from(result.bytes));
});

test('unsupported data and invalid archives fail without replacing current geometry', async ({ page }) => {
  await ready(page);
  const base = await page.evaluate(async () => {
    const { createProject } = await import('/src/project.ts'); const { exportUFO } = await import('/src/ufo.ts');
    return Array.from(await exportUFO(createProject('Import', true)));
  });
  const originals = unzipSync(Uint8Array.from(base));
  for (const [path, replace, message] of [
    ['FontDraft.ufo/glyphs/glyph00000.glif', (s: string) => s.replace('</outline>', '<component base="A"/></outline>'), 'component'],
    ['FontDraft.ufo/glyphs/glyph00000.glif', (s: string) => s.replace('type="curve"', 'type="qcurve"'), 'qcurve'],
    ['FontDraft.ufo/fontinfo.plist', (s: string) => s.replace('</dict>', '<key>copyright</key><string>Keep me</string></dict>'), 'copyright'],
    ['FontDraft.ufo/layercontents.plist', (s: string) => s.replace('</plist>', ''), '잘못된 XML'],
  ] as const) {
    const files = { ...originals, [path]: strToU8(replace(strFromU8(originals[path]))) };
    await page.locator('#project-menu').click();
    await page.locator('#file-input').setInputFiles({ name: 'unsupported.ufoz', mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)) });
    await expect(page.locator('#file-message')).toContainText(message);
    await page.locator('#file-close').click(); await expect(page.locator('.node')).toHaveCount(8);
    await expect(page.locator('#project-menu')).toHaveText('글리프 스케치');
  }
});

test('autosave failure is visible and UFOZ export still works', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('storage unavailable'); } }); });
  await page.goto('/'); await expect(page.locator('#save-status')).toContainText('복원 실패');
  await rectangle(page); await expect(page.locator('#save-status')).toContainText('자동저장 실패');
  const download = page.waitForEvent('download'); await page.locator('#save-file').click();
  expect((await download).suggestedFilename()).toMatch(/\.ufoz$/);
});
