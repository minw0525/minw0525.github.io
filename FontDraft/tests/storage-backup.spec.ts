import { test, expect } from './fixtures';

test('native backup preserves masters, masks and annotations and imports without overwriting', async ({ page }) => {
  const backup = await page.evaluate(async () => {
    const { createProject, addMaster } = await import('/src/project.ts');
    const { projectBackup } = await import('/src/backup.ts');
    const p = createProject('Native', true);
    p.glyphs[0].annotations = [{ id: 'note', x: 13, y: 47, text: '메모' }];
    p.glyphs[0].mask = { contours: structuredClone(p.glyphs[0].contours) };
    addMaster(p, 'Bold', true); p.editMask = true;
    return { text: projectBackup([p]), project: p };
  });
  await page.locator('#backup-input').setInputFiles({ name: 'native.fontdraft.json', mimeType: 'application/json', buffer: Buffer.from(backup.text) });
  await expect(page.locator('#project-menu')).toHaveText('Native');
  await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');
  await page.reload();
  const saved = await page.evaluate(async () => (await import('/src/project.ts')).loadWorkspace());
  const restored = saved.projects.find(p => p.name === 'Native')!;
  expect(restored.id).not.toBe(backup.project.id);
  expect({ ...restored, id: backup.project.id }).toEqual(backup.project);
  await page.locator('#app-menus > details > summary').filter({ hasText: /^파일$/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 프로젝트 백업…', exact: true }).click();
  const result = await download;
  expect(result.suggestedFilename()).toBe('FontDraft-projects.fontdraft.json');
  const stream = await result.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const file = JSON.parse(Buffer.concat(chunks).toString());
  expect(file.projects).toHaveLength(saved.projects.length);
  expect(file.projects.find(p => p.id === restored.id)).toEqual(restored);
});

test('invalid and newer backups are rejected before any project is written', async ({ page }) => {
  const count = await page.evaluate(async () => (await (await import('/src/project.ts')).loadWorkspace()).projects.length);
  for (const data of [{ format: 'fontdraft', version: 2, projects: [] }, { format: 'fontdraft', version: 1, projects: [{ id: 'bad' }] }]) {
    await page.locator('#backup-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await expect(page.locator('#file-message')).toContainText('백업 열기 실패');
    await page.locator('#file-close').click();
  }
  expect(await page.evaluate(async () => (await (await import('/src/project.ts')).loadWorkspace()).projects.length)).toBe(count);
});

test('queued saves coalesce and deletion remains ordered without resurrecting documents', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createProject, saveDraft, deleteDraft, loadWorkspace } = await import('/src/project.ts');
    const p = createProject('Queued'), next = createProject('Survivor');
    let puts = 0; const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) { if (this.name === 'projects') puts++; return put.apply(this, args); };
    try {
      const jobs: Promise<void>[] = [];
      for (let i = 0; i < 40; i++) { p.name = `Revision ${i}`; jobs.push(saveDraft(p)); }
      jobs.push(saveDraft(next), deleteDraft(p.id, next));
      await Promise.all(jobs);
      return { puts, workspace: await loadWorkspace(), deleted: p.id, next: next.id };
    } finally { IDBObjectStore.prototype.put = put; }
  });
  expect(result.puts).toBeLessThan(10);
  expect(result.workspace.projects.some(p => p.id === result.deleted)).toBe(false);
  expect(result.workspace.last).toBe(result.next);
});

test('failed transaction preserves last saved contents and later saves recover', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createProject, saveDraft, loadWorkspace } = await import('/src/project.ts');
    const p = createProject('Original'); await saveDraft(p);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) { const request = put.apply(this, args); if (this.name === 'settings') this.transaction.abort(); return request; };
    let failed = false;
    try { p.name = 'Unsaved'; await saveDraft(p); } catch { failed = true; }
    finally { IDBObjectStore.prototype.put = put; }
    const afterFailure = (await loadWorkspace()).projects.find(x => x.id === p.id)!.name;
    p.name = 'Recovered'; await saveDraft(p);
    return { failed, afterFailure, afterRecovery: (await loadWorkspace()).projects.find(x => x.id === p.id)!.name };
  });
  expect(result).toEqual({ failed: true, afterFailure: 'Original', afterRecovery: 'Recovered' });
});

test('denied persistence still saves and reports usage in project manager', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { value: { persisted: async () => false, persist: async () => false, estimate: async () => ({ usage: 1048576, quota: 10485760 }) } });
  });
  await page.reload(); await page.locator('#project-menu').click();
  await expect(page.locator('#storage-status')).toHaveText('영구 저장 미허용 · 사용 1.0 MB / 한도 10.0 MB');
  await page.screenshot({ path: info.outputPath('storage-status.png') });
  await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');
});

test('persistent storage grant is shown and large project saves preserve latest revision', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { value: { persisted: async () => false, persist: async () => true, estimate: async () => ({ usage: 0, quota: 10485760 }) } });
  });
  await page.reload();
  // The mock reports a grant only for persist(); inspect the startup result before refreshing it.
  await expect(page.locator('#storage-status')).toContainText('영구 저장 허용');
  const result = await page.evaluate(async () => {
    const { createProject, createGlyph, saveDraft, loadWorkspace } = await import('/src/project.ts');
    const p = createProject('Large');
    p.glyphs = Array.from({ length: 500 }, (_, i) => {
      const g = createGlyph(`g${i}`, [0x1000 + i]);
      g.contours = [{ id: `c${i}`, closed: true, nodes: Array.from({ length: 100 }, (_, n) => ({ id: `n${n}`, x: n * 5, y: n * 3, incoming: { x: n * 5 - 2, y: n * 3 }, outgoing: { x: n * 5 + 2, y: n * 3 } })) }];
      return g;
    }); p.activeGlyph = p.glyphs[0].id;
    const start = performance.now(), first = saveDraft(p), snapshotMs = performance.now() - start;
    await first; const totalMs = performance.now() - start;
    const restored = (await loadWorkspace()).projects.find(x => x.id === p.id)!;
    return { snapshotMs, totalMs, glyphs: restored.glyphs.length, nodes: restored.glyphs.reduce((n, g) => n + g.contours[0].nodes.length, 0) };
  });
  expect(result.glyphs).toBe(500); expect(result.nodes).toBe(50000);
  await info.attach('save-timing', { body: JSON.stringify(result), contentType: 'application/json' });
  console.log('Large project save:', result);
});

test('failed batch import rolls back all records and leaves the current project open', async ({ page }) => {
  const text = await page.evaluate(async () => {
    const { createProject } = await import('/src/project.ts');
    const { projectBackup } = await import('/src/backup.ts');
    const put = IDBObjectStore.prototype.put; let count = 0;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'projects' && ++count === 2) throw new DOMException('Full', 'QuotaExceededError');
      return put.apply(this, args);
    };
    return projectBackup([createProject('Batch-A'), createProject('Batch-B')]);
  });
  await page.locator('#backup-input').setInputFiles({ name: 'batch.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('#file-message')).toContainText('백업 열기 실패');
  await expect(page.locator('#project-menu')).toHaveText('글리프 스케치');
  await page.reload();
  const projects = await page.evaluate(async () => (await (await import('/src/project.ts')).loadWorkspace()).projects);
  expect(projects.some(p => p.name.startsWith('Batch-'))).toBe(false);
});
