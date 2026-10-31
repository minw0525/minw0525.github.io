import { expect, test } from './fixtures';

test('nonzero winding, holes, selective erasure and unrelated contours', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    // Exercise the actual browser geometry module, not a separate test implementation.
    const g = await import('/src/geometry.ts');
    const m = await import('/src/model.ts');
    const ring = m.sample();
    const tip = { size: 50, ratio: 1, angle: 0 };
    const cut = [{ x: 400, y: 300 }, { x: 570, y: 300 }];
    const unrelated = g.shape('rectangle', { x: 700, y: 0 }, { x: 800, y: 100 });
    const open = { id: 'open', closed: false, nodes: [{ id: 'open-0', x: 0, y: 0 }, { id: 'open-1', x: 600, y: 600 }] };
    const original = [...ring, ...unrelated, open];
    const erased = g.erase(original, new Set(), cut, tip);
    const selected = g.erase(original, new Set(ring[0].nodes.map(n => n.id)), cut, tip);
    const same = structuredClone(ring);
    same[1].nodes.reverse().forEach(n => { [n.incoming, n.outgoing] = [n.outgoing, n.incoming]; });
    const nothing = g.erase(original, new Set(['open-0']), cut, tip);
    const holeOnly = g.erase(original, new Set(), [{ x: 300, y: 300 }], tip);
    const overlapA = g.shape('rectangle', { x: 0, y: 0 }, { x: 200, y: 200 });
    const overlapB = g.shape('rectangle', { x: 100, y: 0 }, { x: 300, y: 200 });
    const overlapResult = g.erase([...overlapA, ...overlapB], new Set(overlapA[0].nodes.map(n => n.id)), [{ x: 150, y: 100 }], tip);
    return {
      ringCenter: g.contains(ring, { x: 300, y: 300 }), sameCenter: g.contains(same, { x: 300, y: 300 }),
      cutRemoved: !g.contains(erased, { x: 500, y: 300 }), leftKept: g.contains(erased, { x: 100, y: 300 }),
      ringContours: erased.filter(c => ![open.id, unrelated[0].id].includes(c.id)).length,
      unrelatedKept: JSON.stringify(erased.find(c => c.id === unrelated[0].id)) === JSON.stringify(unrelated[0]),
      openKept: erased.includes(open), innerKept: selected.includes(ring[1]),
      openOnlyUnchanged: JSON.stringify(nothing) === JSON.stringify(original),
      holeOnlyUnchanged: JSON.stringify(holeOnly) === JSON.stringify(original),
      overlapKept: overlapResult.includes(overlapB[0]), overlapStillFilled: g.contains(overlapResult, { x: 150, y: 100 }),
    };
  });
  expect(results).toEqual({ ringCenter: false, sameCenter: true, cutRemoved: true, leftKept: true, ringContours: 1, unrelatedKept: true, openKept: true, innerKept: true, openOnlyUnchanged: true, holeOnlyUnchanged: true, overlapKept: true, overlapStillFilled: true });
});

test('brush has fixed elliptical cross section, joins fast samples, handles self crossings', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const g = await import('/src/geometry.ts');
    const tip = { size: 100, ratio: 0.2, angle: 0 };
    const dot = g.brush([{ x: 0, y: 0 }], tip);
    const turned = g.brush([{ x: 0, y: 0 }], { ...tip, angle: 90 });
    const line = g.brush([{ x: 0, y: 0 }, { x: 500, y: 0 }], tip);
    const cross = g.brush([{ x: 0, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }, { x: 200, y: 0 }], { size: 30, ratio: 1, angle: 0 });
    return [g.contains(dot, { x: 40, y: 0 }), g.contains(dot, { x: 0, y: 20 }), g.contains(turned, { x: 0, y: 40 }), g.contains(turned, { x: 20, y: 0 }), g.contains(line, { x: 250, y: 8 }), g.contains(line, { x: 250, y: 12 }), g.contains(cross, { x: 100, y: 100 }), cross.every(c => c.closed && c.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)))];
  });
  expect(result).toEqual([true, false, true, false, true, false, true, true]);
});
