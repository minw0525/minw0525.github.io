import ClipperFactory from 'clipper2-wasm/dist/es/clipper2z.js';
import wasmURL from 'clipper2-wasm/dist/es/clipper2z.wasm?url';
import type { MainModule, PathsD } from 'clipper2-wasm/dist/clipper2z';
import type { SweepUnion } from './geometry';

export async function loadWasmUnion(): Promise<SweepUnion> {
  const response = await fetch(wasmURL);
  if (!response.ok) throw new Error('WASM could not be loaded');
  const clipper: MainModule = await ClipperFactory({ wasmBinary: await response.arrayBuffer() });
  return polygons => {
    const input = new clipper.PathsD(), empty = new clipper.PathsD();
    let output: PathsD | undefined;
    try {
      for (const polygon of polygons) for (const ring of polygon) {
        const path = clipper.MakePathD(ring.flat());
        try { input.push_back(path); } finally { path.delete(); }
      }
      // Normalized nib coordinates: six decimal places are well below a font unit.
      output = clipper.UnionD(input, empty, clipper.FillRule.NonZero, 6);
      const rings: [number, number][][] = [];
      for (let i = 0; i < output.size(); i++) {
        const path = output.get(i);
        try {
          const ring: [number, number][] = [];
          for (let j = 0; j < path.size(); j++) { const p = path.get(j); try { ring.push([p.x, p.y]); } finally { p.delete(); } }
          rings.push(ring);
        } finally { path.delete(); }
      }
      return rings;
    } finally { output?.delete(); empty.delete(); input.delete(); }
  };
}
