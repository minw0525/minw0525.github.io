import { test as base, type Page } from '@playwright/test';
export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';
export async function seedDemo(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.querySelector<HTMLElement>('#app')!.inert && document.querySelector('#save-status')?.textContent === '기기에 저장됨');
  await page.evaluate(async () => { const { createProject, saveDraft } = await import('/src/project.ts'); await saveDraft(createProject('글리프 스케치', true)); });
  await page.reload();
  await page.waitForFunction(() => !document.querySelector<HTMLElement>('#app')!.inert && document.querySelector('#save-status')?.textContent === '기기에 저장됨');
}
export const test = base.extend({ page: async ({ page }, use) => { await seedDemo(page); await use(page); } });
export async function contourPoint(page: Page, id = 'outer') {
  return page.locator(`[data-contour="${id}"]`).evaluate((el: SVGPathElement) => {
    const p = el.getPointAtLength(el.getTotalLength() * .125), r = el.ownerSVGElement!.getBoundingClientRect();
    return { x: p.x + r.left, y: p.y + r.top };
  });
}

export async function wheelZoom(page: Page, deltaY = -112) {
  const box = (await page.locator('#canvas').boundingBox())!;
  await page.locator('#canvas').dispatchEvent('wheel', { deltaY, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });
}
