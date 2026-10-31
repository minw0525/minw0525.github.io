import { test, expect } from './fixtures';

test('dense strokes retain contours and report brush and eraser timings', async ({ page, browserName }, info) => {
  const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  const result = await page.evaluate(async () => {
    const { brush, erase, shape } = await import('/src/geometry.ts');
    const points = Array.from({ length: 600 }, (_, i) => ({ x: i, y: 150 + 65 * Math.sin(i / 65) + Math.sin(i * 1.7) * .5 }));
    const tip = { size: 36, ratio: .45, angle: 35, simplify: 3 };
    const box = shape('rectangle', { x: 0, y: 0 }, { x: 600, y: 300 });
    return ['brush', 'eraser'].map(name => {
      const times: number[] = []; let contours = 0, nodes = 0;
      for (let i = 0; i < 4; i++) {
        const start = performance.now();
        const out = name === 'brush' ? brush(points, tip) : erase(box, new Set(), points, tip);
        if (i) times.push(performance.now() - start);
        contours = out.length; nodes = out.reduce((sum, c) => sum + c.nodes.length, 0);
      }
      return { name, medianMs: Math.round(times.sort((a,b) => a-b)[1]), contours, nodes };
    });
  });
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    const counts = new Map<string, number>(), nodes = new Map(profile.nodes.map(n => [n.id, n.callFrame.functionName]));
    profile.samples?.forEach(id => { const name = nodes.get(id) || '(anonymous)'; counts.set(name, (counts.get(name) || 0) + 1); });
    console.log('CPU samples', JSON.stringify([...counts].sort((a,b) => b[1]-a[1]).slice(0, 12)));
    await cdp.detach();
  }
  console.log(JSON.stringify(result));
  await info.attach('timings', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.map(r => r.contours)).toEqual([1, 2]);
  for (const r of result) expect(r.nodes).toBeLessThan(100);
});

test('accelerated strokes preserve sampled boundaries, holes and sharp eraser corners', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { brush, erase, shape, contains } = await import('/src/geometry.ts');
    const { pathData } = await import('/src/model.ts');
    const points = Array.from({ length: 600 }, (_, i) => ({ x: i, y: 150 + 65 * Math.sin(i / 65) + Math.sin(i * 1.7) * .5 }));
    const tip = { size: 36, ratio: .45, angle: 35 };
    const sample = (contours) => contours.flatMap(c => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData(c, { x: 0, y: 0, scale: 1 }));
      const length = path.getTotalLength(), count = Math.ceil(length / .5);
      return Array.from({ length: count + 1 }, (_, i) => { const p = path.getPointAtLength(length * i / count); return { x: p.x, y: p.y }; });
    });
    const deviation = (a, b) => {
      const aa = sample(a), bb = sample(b); let maximum = 0;
      for (const [source, target] of [[aa, bb], [bb, aa]]) for (let i = 0; i < source.length; i += 4) {
        const p = source[i]; let best = Infinity;
        for (const q of target) best = Math.min(best, (p.x - q.x) ** 2 + (p.y - q.y) ** 2);
        maximum = Math.max(maximum, Math.sqrt(best));
      }
      return maximum;
    };
    const box = shape('rectangle', { x: 0, y: 0 }, { x: 600, y: 300 });
    const raw = brush(points, { ...tip, simplify: 0 }), fitted = brush(points, { ...tip, simplify: 3 });
    const rawCut = erase(box, new Set(), points, { ...tip, simplify: 0 }), fittedCut = erase(box, new Set(), points, { ...tip, simplify: 3 });
    const loop = brush(Array.from({ length: 600 }, (_, i) => ({ x: 110 * Math.cos(i * 2 * Math.PI / 599), y: 130 * Math.sin(i * 2 * Math.PI / 599) })), { ...tip, simplify: 3 });
    return { brushError: deviation(raw, fitted), eraserError: deviation(rawCut, fittedCut), hole: contains(loop, { x: 0, y: 0 }), loopContours: loop.length, corners: [[0,0],[600,0],[600,300],[0,300]].every(([x,y]) => fittedCut.some(c => c.nodes.some(n => n.x === x && n.y === y))) };
  });
  expect(result.brushError).toBeLessThan(3.5);
  expect(result.eraserError).toBeLessThan(6.5); // Cutter fitting plus result fitting.
  expect(result.hole).toBe(false); expect(result.loopContours).toBe(2); expect(result.corners).toBe(true);
});
