import type { Contour, Node } from './model';
import { newId } from './geometry';

export function freshContours(contours: Contour[]): Contour[] {
  return structuredClone(contours).map(c => ({ ...c, id: newId(), nodes: c.nodes.map(n => ({ ...n, id: newId() })) }));
}

// Partial selections copy contiguous runs without joining across unselected nodes.
export function copyContours(contours: Contour[], ids: Set<string>): Contour[] {
  return contours.flatMap(c => {
    if (c.nodes.every(n => ids.has(n.id))) return [structuredClone(c)];
    const nodes = [...c.nodes];
    if (c.closed) { const gap = nodes.findIndex(n => !ids.has(n.id)); nodes.push(...nodes.splice(0, gap + 1)); }
    const runs: Node[][] = []; let run: Node[] = [];
    for (const n of nodes) { if (ids.has(n.id)) run.push(structuredClone(n)); else if (run.length) { runs.push(run); run = []; } }
    if (run.length) runs.push(run);
    return runs.map(nodes => { delete nodes[0].incoming; delete nodes.at(-1)!.outgoing; return { id: newId(), closed: false, nodes }; });
  });
}

// Split each selected anchor into coincident incoming/outgoing anchors.
export function duplicateNodes(contours: Contour[], ids: Set<string>) {
  const duplicated = new Set<string>();
  const result = contours.map(c => {
    if (!c.nodes.some(n => ids.has(n.id))) return c;
    const copy = structuredClone(c);
    copy.nodes = copy.nodes.flatMap(n => {
      if (!ids.has(n.id)) return [n];
      const duplicate = { ...n, id: newId(), smooth: false };
      delete duplicate.incoming; delete n.outgoing; n.smooth = false;
      duplicated.add(duplicate.id);
      return [n, duplicate];
    });
    return copy;
  });
  return { contours: result, duplicated };
}

export function joinNodes(contours: Contour[], ids: Set<string>): Contour[] {
  const hits = contours.flatMap(c => c.nodes.flatMap((n, i) => ids.has(n.id) ? [{ c, n, i }] : []));
  if (hits.length !== 2 || hits.some(h => h.c.closed || (h.i !== 0 && h.i !== h.c.nodes.length - 1))) throw new Error('열린 경로의 끝점 두 개를 선택하세요.');
  const [a, b] = hits;
  if (a.c === b.c) return contours.map(c => {
    if (c !== a.c) return c;
    const copy = structuredClone(c), first = copy.nodes[0], last = copy.nodes.at(-1)!;
    if (first.x === last.x && first.y === last.y) { first.incoming = last.incoming; copy.nodes.pop(); }
    return { ...copy, closed: true };
  });
  const orient = (c: Contour, reverse: boolean) => { const nodes = structuredClone(c.nodes); if (reverse) { nodes.reverse(); for (const n of nodes) [n.incoming, n.outgoing] = [n.outgoing, n.incoming]; } return nodes; };
  const first = orient(a.c, a.i === 0), second = orient(b.c, b.i !== 0);
  if (first.at(-1)!.x === second[0].x && first.at(-1)!.y === second[0].y) { first.at(-1)!.outgoing = second.shift()!.outgoing; }
  return contours.flatMap(c => c === a.c ? [{ ...c, nodes: [...first, ...second] }] : c === b.c ? [] : [c]);
}

export function loopCorner(contour: Contour, id: string, extension = 24): Contour {
  const c = structuredClone(contour), i = c.nodes.findIndex(n => n.id === id);
  if (i < 0 || (!c.closed && (i === 0 || i === c.nodes.length - 1))) throw new Error('양쪽 선분이 있는 모서리를 선택하세요.');
  const n = c.nodes[i], prev = c.nodes[(i + c.nodes.length - 1) % c.nodes.length], next = c.nodes[(i + 1) % c.nodes.length];
  const p = n.incoming ?? prev.outgoing ?? prev, q = n.outgoing ?? next.incoming ?? next;
  const a = { x: n.x - p.x, y: n.y - p.y }, b = { x: n.x - q.x, y: n.y - q.y };
  const al = Math.hypot(a.x, a.y), bl = Math.hypot(b.x, b.y);
  if (!al || !bl || Math.abs(a.x * b.y - a.y * b.x) / (al * bl) < .01) throw new Error('직선이나 매끄러운 노드에는 루프를 만들 수 없습니다.');
  const tip = (v: typeof a, length: number): Node => ({ id: newId(), x: Math.round(n.x + extension * v.x / length), y: Math.round(n.y + extension * v.y / length) });
  const tips = [tip(a, al), tip(b, bl)];
  // Keep the original cubics intact; extensions follow their endpoint tangents.
  if (n.incoming || prev.outgoing || n.outgoing || next.incoming) c.nodes.splice(i, 1, { ...n, outgoing: undefined, smooth: false }, ...tips, { ...n, id: newId(), incoming: undefined, smooth: false });
  else { tips[0].id = n.id; c.nodes.splice(i, 1, ...tips); }
  return c;
}
