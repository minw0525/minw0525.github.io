import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.evaluate(async () => {
    const { loadWorkspace, deleteDraft } = await import('/src/project.ts');
    const w = await loadWorkspace(), current = w.projects.find(p => p.id === w.last)!;
    for (const p of w.projects) if (p.id !== current.id) await deleteDraft(p.id, current);
  });
  await page.reload();
});

async function seedTwo(page) {
  await page.evaluate(async () => {
    const { createProject, saveDraft, loadWorkspace } = await import('/src/project.ts');
    const w = await loadWorkspace(); const current = w.projects.find(p => p.id === w.last)!;
    await saveDraft(createProject('Second')); await saveDraft(current);
  });
  await page.reload(); await page.locator('#project-menu').click();
}

test('saved projects list opens projects and deletes inactive project persistently', async ({ page }, info) => {
  await seedTwo(page);
  await expect(page.locator('#project-list li')).toHaveCount(2);
  await page.locator('.project-open').filter({ hasText: 'Second' }).click();
  await expect(page.locator('#project-form [name=name]')).toHaveValue('Second');
  await page.locator('.project-open').filter({ hasText: '글리프 스케치' }).click();
  await page.screenshot({ path: info.outputPath('project-list.png') });
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Second 삭제', exact: true }).click();
  await expect(page.locator('#project-list li')).toHaveCount(2);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Second 삭제', exact: true }).click();
  await expect(page.locator('#project-list li')).toHaveCount(1);
  await expect(page.locator('#project-menu')).toHaveText('글리프 스케치');
  await page.reload(); await page.locator('#project-menu').click();
  await expect(page.locator('#project-list li')).toHaveCount(1);
  await expect(page.locator('.project-open')).toContainText('글리프 스케치');
});

test('deleting current project switches to survivor and deleting last creates a blank project', async ({ page }) => {
  await seedTwo(page);
  const removed = await page.locator('.project-open[aria-current=true]').getAttribute('data-open-project');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '글리프 스케치 삭제', exact: true }).click();
  await expect(page.locator('#project-menu')).toHaveText('Second');
  await expect(page.locator('#project-list li')).toHaveCount(1);
  await page.reload(); await page.locator('#project-menu').click();
  await expect(page.locator('#project-menu')).toHaveText('Second');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Second 삭제', exact: true }).click();
  await expect(page.locator('#project-menu')).toHaveText('Unititled');
  await expect(page.locator('#project-list li')).toHaveCount(1);
  await expect(page.locator('.node')).toHaveCount(0);
  await expect(page.locator('#save-status')).toHaveText('기기에 저장됨');
  await page.reload();
  const workspace = await page.evaluate(async () => (await import('/src/project.ts')).loadWorkspace());
  expect(workspace.projects).toHaveLength(1);
  expect(workspace.projects[0].id).not.toBe(removed);
  expect(workspace.last).toBe(workspace.projects[0].id);
  expect(workspace.projects[0].name).toBe('Unititled');
});

test('failed deletion leaves saved document and current selection intact', async ({ page }) => {
  await page.locator('#project-menu').click();
  await page.evaluate(() => {
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function(key) {
      const request = remove.call(this, key); this.transaction.abort(); return request;
    };
  });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '글리프 스케치 삭제', exact: true }).click();
  await expect(page.locator('#project-error')).toContainText('삭제하지 못했습니다');
  await expect(page.locator('#project-list li')).toHaveCount(1);
  await expect(page.locator('#project-menu')).toHaveText('글리프 스케치');
  await page.reload(); await expect(page.locator('.node')).toHaveCount(8);
});
