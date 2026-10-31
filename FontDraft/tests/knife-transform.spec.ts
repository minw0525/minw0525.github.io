import { contourPoint } from './fixtures';
import { expect, test } from './fixtures';

test('corner cuts avoid duplicates and odd crossing counts split only complete intervals', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const g = await import('/src/geometry.ts');
    const rectangle = g.shape('rectangle', { x: 0, y: 0 }, { x: 100, y: 100 });
    const corners = g.knife(rectangle, new Set(), { x: -10, y: -10 }, { x: 110, y: 110 }, true);
    const u = [{ id: 'u', closed: true, nodes: [[0, 0], [300, 0], [300, 300], [200, 300], [200, 100], [100, 100], [100, 300], [0, 300]].map(([x, y], i) => ({ id: `u-${i}`, x, y })) }];
    const full = g.knife(u, new Set(), { x: -10, y: 200 }, { x: 310, y: 200 }, true);
    const partial = g.knife(u, new Set(), { x: -10, y: 200 }, { x: 250, y: 200 }, true);
    return { corners: corners.map(c => c.nodes.length).sort(), full: full.length, partial: partial.length, noPartialNode: !partial.some(c => c.nodes.some(n => Math.abs(n.x - 200) < 1e-6 && Math.abs(n.y - 200) < 1e-6)) };
  });
  expect(result).toEqual({ corners: [3, 3], full: 3, partial: 2, noPartialNode: true });
});

test('knife UI inserts points, freezes modifier during finite cut and undoes the cut', async ({ page }) => {
  await page.goto('/');
  const left = (await page.locator('[data-node="outer-3"]').boundingBox())!;
  const right = (await page.locator('[data-node="outer-1"]').boundingBox())!;
  const y = right.y - 30, start = right.x + 40, end = (left.x + right.x) / 2;
  const original = await page.locator('.glyph-fill').getAttribute('d');
  await page.getByRole('button', { name: '나이프', exact: true }).click();
  await page.mouse.move(start, y); await page.mouse.down(); await page.mouse.move(end, y); await page.mouse.up();
  await expect(page.locator('.node')).toHaveCount(10);
  await expect(page.locator('.outline')).toHaveCount(2);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await page.keyboard.down('Shift');
  await page.mouse.move(start, y); await page.mouse.down(); await page.mouse.move(end + 20, y);
  await page.keyboard.up('Shift');
  await expect(page.locator('#knife-tool')).toHaveAttribute('data-mode','split');
  await page.mouse.move(end, y); await page.mouse.up();
  await expect(page.locator('.outline')).toHaveCount(1);
  await expect(page.locator('#knife-tool')).toHaveAttribute('data-mode','insert');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await page.locator('.glyph-fill').getAttribute('d')).toBe(original);
});

test('knife node tap opens the contour and a repeated endpoint tap does nothing', async ({ page }) => {
  await page.goto('/');
  const p = (await page.locator('[data-node="outer-0"]').boundingBox())!;
  await page.getByRole('button', { name: '나이프', exact: true }).click();
  await page.mouse.click(p.x + 4, p.y + 4);
  await expect(page.locator('.node')).toHaveCount(9);
  const opened = await page.locator('.glyph-fill').getAttribute('d');
  await page.mouse.click(p.x + 4, p.y + 4);
  await expect(page.locator('.node')).toHaveCount(9);
  expect(await page.locator('.glyph-fill').getAttribute('d')).toBe(opened);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.locator('.node')).toHaveCount(8);
});

test('transform UI rotates only selected contour and validates scale and slant values', async ({ page }) => {
  await page.goto('/');
  const p = (await page.locator('[data-node="outer-0"]').boundingBox())!;
  const q = await contourPoint(page); await page.mouse.dblclick(q.x, q.y);
  const inner = await page.locator('[data-node^="inner"]').evaluateAll(nodes => nodes.map(n => n.outerHTML));
  await page.getByLabel('회전 각도').fill('90');
  await page.getByRole('button', { name: '왼쪽 회전', exact: true }).click();
  expect(Number(await page.locator('[data-node="outer-0"]').getAttribute('data-x'))).toBeCloseTo(25);
  expect(Number(await page.locator('[data-node="outer-0"]').getAttribute('data-y'))).toBeCloseTo(300);
  expect(await page.locator('[data-node^="inner"]').evaluateAll(nodes => nodes.map(n => n.outerHTML))).toEqual(inner);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await page.getByLabel('가로 배율').fill('50');
  await expect(page.getByLabel('세로 배율')).toHaveValue('50');
  await page.getByRole('button', { name: '크기 적용', exact: true }).click();
  expect(Number(await page.locator('[data-node="outer-0"]').getAttribute('data-y'))).toBeCloseTo(438);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  const before = await page.locator('.glyph-fill').getAttribute('d');
  await page.getByLabel('가로 기울기 각도').fill('90');
  await page.getByRole('button', { name: '오른쪽 기울이기', exact: true }).click();
  expect(await page.locator('.glyph-fill').getAttribute('d')).toBe(before);
  await page.getByLabel('가로 기울기 각도').fill('45');
  await page.getByRole('button', { name: '오른쪽 기울이기', exact: true }).click();
  expect(Number(await page.locator('[data-node="outer-0"]').getAttribute('data-x'))).toBeCloseTo(575);
});

test('pen pointer double tap toggles a smooth node', async ({ page, context }) => {
  await page.goto('/');
  const cdp = await context.newCDPSession(page);
  const p = (await page.locator('[data-node="outer-0"]').boundingBox())!;
  for (let clickCount = 1; clickCount <= 2; clickCount++) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x + 4, y: p.y + 4, button: 'left', buttons: 1, clickCount, pointerType: 'pen' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + 4, y: p.y + 4, button: 'left', buttons: 0, clickCount, pointerType: 'pen' });
  }
  await expect(page.locator('.node.selected')).toHaveCount(1);
  await expect(page.locator('[data-node="outer-0"]')).toHaveClass(/smooth/);
});

test('knife inserts multiple points without changing filled geometry, including two hits on one curve', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const g = await import('/src/geometry.ts'), m = await import('/src/model.ts');
    const ring = m.sample();
    const cut = g.knife(ring, new Set(), { x: 0, y: 350 }, { x: 600, y: 350 }, false);
    let differences = 0;
    for (let x = 3; x < 600; x += 17) for (let y = 3; y < 600; y += 19) if (g.contains(ring, { x, y }) !== g.contains(cut, { x, y })) differences++;
    const open = [{ id: 'arch', closed: false, nodes: [{ id: 'a', x: 0, y: 0, outgoing: { x: 0, y: 100 } }, { id: 'b', x: 100, y: 0, incoming: { x: 100, y: 100 } }] }];
    const two = g.knife(open, new Set(), { x: -10, y: 40 }, { x: 110, y: 40 }, false);
    const unchanged = g.knife(ring, new Set(), { x: 0, y: 575 }, { x: 600, y: 575 }, false);
    return { differences, count: cut.reduce((n, c) => n + c.nodes.length, 0), ids: cut.map(c => c.id), archNodes: two[0].nodes.length, tangentNodes: unchanged.reduce((n, c) => n + c.nodes.length, 0) };
  });
  expect(result).toEqual({ differences: 0, count: 12, ids: ['outer', 'inner'], archNodes: 4, tangentNodes: 8 });
});

test('knife finite slit joins outer and hole; full traversal splits donut into two closed pieces', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const g = await import('/src/geometry.ts'), m = await import('/src/model.ts');
    const ring = m.sample();
    const slit = g.knife(ring, new Set(), { x: 600, y: 320 }, { x: 300, y: 320 }, true);
    const full = g.knife(ring, new Set(), { x: 0, y: 320 }, { x: 600, y: 320 }, true);
    const incomplete = g.knife(ring, new Set(), { x: 600, y: 320 }, { x: 480, y: 320 }, true);
    const tangent = g.knife(ring, new Set(), { x: 0, y: 575 }, { x: 600, y: 575 }, true);
    let differences = 0;
    for (let x = 5; x < 600; x += 21) for (let y = 5; y < 600; y += 23) {
      const expected = g.contains(ring, { x, y });
      if (expected !== g.contains(slit, { x, y }) || expected !== g.contains(full, { x, y })) differences++;
    }
    return { slit: slit.length, full: full.length, closed: [...slit, ...full].every(c => c.closed), differences, incomplete: JSON.stringify(incomplete) === JSON.stringify(ring), tangent: JSON.stringify(tangent) === JSON.stringify(ring) };
  });
  expect(result).toEqual({ slit: 1, full: 2, closed: true, differences: 0, incomplete: true, tangent: true });
});

test('knife selection preserves unrelated contours and node tap opens paths without losing curves', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const g = await import('/src/geometry.ts'), m = await import('/src/model.ts');
    const ring = m.sample();
    const cut = g.knife(ring, new Set(['outer-0']), { x: 0, y: 350 }, { x: 600, y: 350 }, true);
    const broken = g.breakAtNode(ring, 'outer-0');
    const twice = g.breakAtNode(broken, 'outer-1');
    return { inner: cut.includes(ring[1]), closed: broken[0].closed, count: broken[0].nodes.length, sameEnds: broken[0].nodes[0].x === broken[0].nodes.at(-1).x && broken[0].nodes[0].y === broken[0].nodes.at(-1).y, noStartIn: !broken[0].nodes[0].incoming, noEndOut: !broken[0].nodes.at(-1).outgoing, twice: twice.length, endpointNoOp: JSON.stringify(g.breakAtNode(broken, 'outer-0')) === JSON.stringify(broken) };
  });
  expect(result).toEqual({ inner: true, closed: false, count: 5, sameEnds: true, noStartIn: true, noEndOut: true, twice: 3, endpointNoOp: true });
});

test('affine transforms keep unselected nodes intact and transform handles around the same pivot', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const m = await import('/src/model.ts');
    const c = [{ id: 'test', closed: false, nodes: [{ id: 'a', x: 10, y: 0, outgoing: { x: 20, y: 0 } }, { id: 'b', x: 0, y: 10 }] }];
    m.transformSelection(c, new Set(['a']), { kind: 'rotate', angle: 90 }, { x: 0, y: 0 });
    const rotated = structuredClone(c);
    m.transformSelection(c, new Set(['a']), { kind: 'scale', x: 2, y: 3 }, { x: 0, y: 0 });
    m.transformSelection(c, new Set(['a']), { kind: 'slant', angle: 45 }, { x: 0, y: 0 });
    return { rotated: rotated[0].nodes[0], final: c[0].nodes[0], untouched: c[0].nodes[1] };
  });
  expect(result.rotated.x).toBeCloseTo(0); expect(result.rotated.y).toBeCloseTo(10);
  expect(result.rotated.outgoing.y).toBeCloseTo(20);
  expect(result.final.x).toBeCloseTo(30); expect(result.final.y).toBeCloseTo(30);
  expect(result.final.outgoing.x).toBeCloseTo(60); expect(result.final.outgoing.y).toBeCloseTo(60);
  expect(result.untouched).toEqual({ id: 'b', x: 0, y: 10 });
});
