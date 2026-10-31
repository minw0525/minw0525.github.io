import { brush, erase, cleanStrokeContours } from './geometry';
import type { StrokePoint, Tip } from './geometry';
import type { Contour } from './model';
import { roundNodes } from './model';
import { loadWasmUnion } from './wasm-union';

export type GeometryJob = { id: number; tool: 'brush' | 'eraser'; points: StrokePoint[]; tip: Tip; contours: Contour[]; selected: string[] };
export type GeometryResult = { id: number; contours?: Contour[]; backend?: string; milliseconds?: number; error?: string };
// A failed WASM fetch still leaves geometry off the UI thread.
const ready = loadWasmUnion().catch(() => undefined);
self.onmessage = async ({ data: job }: MessageEvent<GeometryJob>) => {
  try {
    const union = await ready, start = performance.now();
    let contours = job.tool === 'brush' ? brush(job.points, job.tip, union) : erase(job.contours, new Set(job.selected), job.points, job.tip, union);
    const originalIds = new Set(job.contours.map(c => c.id));
    // Preserve untouched eraser contours and their node identities.
    roundNodes(contours);
    contours = cleanStrokeContours(contours, job.tip.simplify ?? 3, originalIds);
    self.postMessage({ id: job.id, contours, backend: union ? 'wasm' : 'js', milliseconds: performance.now() - start } satisfies GeometryResult);
  } catch (error) { self.postMessage({ id: job.id, error: String(error) } satisfies GeometryResult); }
};
