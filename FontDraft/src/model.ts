export type Point = { x: number; y: number };
export type Node = Point & { id: string; smooth?: boolean; incoming?: Point; outgoing?: Point };
export type Contour = { id: string; nodes: Node[]; closed: boolean };
export type View = { x: number; y: number; scale: number };
export type Hit = { node: Node; contour: Contour; part: 'node' | 'incoming' | 'outgoing' | 'segment' };

export const screenPoint = (p: Point, v: View): Point => ({ x: v.x + p.x * v.scale, y: v.y - p.y * v.scale });
export const glyphPoint = (p: Point, v: View): Point => ({ x: (p.x - v.x) / v.scale, y: (v.y - p.y) / v.scale });
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function sample(): Contour[] {
  function ellipse(id: string, rx: number, ry: number, reverse = false): Contour {
    const k = 0.5522847498307936;
    const nodes: Node[] = [
      { id: `${id}-0`, x: 300, y: 300 + ry, incoming: { x: 300 - rx * k, y: 300 + ry }, outgoing: { x: 300 + rx * k, y: 300 + ry } },
      { id: `${id}-1`, x: 300 + rx, y: 300, incoming: { x: 300 + rx, y: 300 + ry * k }, outgoing: { x: 300 + rx, y: 300 - ry * k } },
      { id: `${id}-2`, x: 300, y: 300 - ry, incoming: { x: 300 + rx * k, y: 300 - ry }, outgoing: { x: 300 - rx * k, y: 300 - ry } },
      { id: `${id}-3`, x: 300 - rx, y: 300, incoming: { x: 300 - rx, y: 300 - ry * k }, outgoing: { x: 300 - rx, y: 300 + ry * k } },
    ];
    return { id, closed: true, nodes: reverse ? nodes.reverse().map(n => ({ ...n, incoming: n.outgoing, outgoing: n.incoming })) : nodes };
  }
  return [ellipse('outer', 225, 275), ellipse('inner', 130, 195, true)];
}

export function hitTest(contours: Contour[], selected: Set<string>, p: Point, view: View, parts: ('node' | 'incoming' | 'outgoing')[] = ['node', 'incoming', 'outgoing']): Hit | null {
  let best: Hit | null = null;
  let radius = 14;
  // Nodes win exact ties with handles. Hit areas are measured in CSS pixels.
  for (const part of parts) {
    for (const contour of contours) for (const node of contour.nodes) {
      const point = part === 'node' ? node : node[part];
      if (!point) continue;
      const d = distance(screenPoint(point, view), p);
      if (d < radius) { radius = d; best = { node, contour, part }; }
    }
  }
  return best;
}

export function pathData(contour: Contour, view: View): string {
  const p = (point: Point) => { const s = screenPoint(point, view); return `${s.x},${s.y}`; };
  const nodes = contour.nodes;
  if (!nodes.length) return '';
  let d = `M${p(nodes[0])}`;
  const count = contour.closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < count; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    d += a.outgoing || b.incoming ? ` C${p(a.outgoing ?? a)} ${p(b.incoming ?? b)} ${p(b)}` : ` L${p(b)}`;
  }
  return d + (contour.closed ? ' Z' : '');
}

export function translate(contours: Contour[], ids: Set<string>, dx: number, dy: number) {
  for (const contour of contours) for (const node of contour.nodes) {
    if (!ids.has(node.id)) continue;
    node.x += dx; node.y += dy;
    for (const key of ['incoming', 'outgoing'] as const) {
      const handle = node[key];
      if (handle) { handle.x += dx; handle.y += dy; }
    }
  }
}

export type Transform = { kind: 'rotate'; angle: number } | { kind: 'scale'; x: number; y: number } | { kind: 'slant'; angle: number; axis?: 'x' | 'y' };
export function transformSelection(contours: Contour[], ids: Set<string>, transform: Transform, pivot?: Point): void {
  const nodes = contours.flatMap(c => c.nodes).filter(n => ids.has(n.id));
  if (!nodes.length) return;
  const center = pivot ?? { x: (Math.min(...nodes.map(n => n.x)) + Math.max(...nodes.map(n => n.x))) / 2, y: (Math.min(...nodes.map(n => n.y)) + Math.max(...nodes.map(n => n.y))) / 2 };
  const angle = transform.kind !== 'scale' ? transform.angle * Math.PI / 180 : 0;
  const apply = (p: Point) => {
    const x = p.x - center.x, y = p.y - center.y;
    if (transform.kind === 'rotate') { p.x = center.x + x * Math.cos(angle) - y * Math.sin(angle); p.y = center.y + x * Math.sin(angle) + y * Math.cos(angle); }
    else if (transform.kind === 'scale') { p.x = center.x + x * transform.x; p.y = center.y + y * transform.y; }
    else if (transform.axis === 'y') p.y = center.y + y + Math.tan(angle) * x;
    else p.x = center.x + x + Math.tan(angle) * y;
  };
  for (const n of nodes) { apply(n); if (n.incoming) apply(n.incoming); if (n.outgoing) apply(n.outgoing); }
}

export function toggleSmooth(contour: Contour, node: Node) {
  if (node.smooth) { delete node.smooth; return; }
  const i = contour.nodes.indexOf(node), count = contour.nodes.length;
  const prev = i > 0 || contour.closed ? contour.nodes[(i + count - 1) % count] : null;
  const next = i + 1 < count || contour.closed ? contour.nodes[(i + 1) % count] : null;
  if (!prev || !next) return;
  let dx = (node.outgoing?.x ?? next.x) - (node.incoming?.x ?? prev.x);
  let dy = (node.outgoing?.y ?? next.y) - (node.incoming?.y ?? prev.y);
  const length = Math.hypot(dx, dy); if (!length) return;
  dx /= length; dy /= length;
  const a = node.incoming ? distance(node, node.incoming) : distance(node, prev) / 3;
  const b = node.outgoing ? distance(node, node.outgoing) : distance(node, next) / 3;
  node.incoming = { x: node.x - dx * a, y: node.y - dy * a };
  node.outgoing = { x: node.x + dx * b, y: node.y + dy * b }; node.smooth = true;
}
export function moveHandle(node: Node, part: 'incoming' | 'outgoing', dx: number, dy: number, mirror = true) {
  const handle = node[part]; if (!handle) return;
  handle.x += dx; handle.y += dy;
  const opposite = node[part === 'incoming' ? 'outgoing' : 'incoming'];
  const length = distance(node, handle);
  if (mirror && node.smooth && opposite && length > 1e-8) {
    const ratio = distance(node, opposite) / length;
    opposite.x = node.x - (handle.x - node.x) * ratio; opposite.y = node.y - (handle.y - node.y) * ratio;
  }
}

// Font coordinates use the integer grid, including existing off-curve points.
export function roundNodes(contours: Contour[]) {
  for (const c of contours) for (const n of c.nodes) {
    for (const p of [n, n.incoming, n.outgoing]) if (p) { p.x = Math.round(p.x); p.y = Math.round(p.y); }
  }
}


// Option editing keeps attached points fixed; round after projecting to the axis.
export function moveOnAxis(node: Node, part: 'node' | 'incoming' | 'outgoing', dx: number, dy: number) {
  const point = part === 'node' ? node : node[part];
  if (!point) return;
  let axis: Point | undefined;
  if (part !== 'node') axis = { x: point.x - node.x, y: point.y - node.y };
  else if (node.smooth) {
    if (node.incoming && node.outgoing) axis = { x: node.outgoing.x - node.incoming.x, y: node.outgoing.y - node.incoming.y };
    else {
      const handle = node.incoming ?? node.outgoing;
      if (handle) axis = { x: handle.x - node.x, y: handle.y - node.y };
    }
  }
  if (axis) {
    const length2 = axis.x ** 2 + axis.y ** 2;
    if (!length2) return;
    let t = (dx * axis.x + dy * axis.y) / length2;
    if (part !== 'node') t = Math.max(-1, t); // Do not flip the handle through its node.
    dx = t * axis.x; dy = t * axis.y;
  }
  point.x = Math.round(point.x + dx); point.y = Math.round(point.y + dy);
}

// Closed contours retain their designated start; open paths exchange endpoints.
export function reverseContour(contour: Contour): void {
  contour.nodes.reverse();
  if (contour.closed && contour.nodes.length) contour.nodes.unshift(contour.nodes.pop()!);
  for (const node of contour.nodes) [node.incoming, node.outgoing] = [node.outgoing, node.incoming];
}

export function contourStartDirection(contour: Contour): Point {
  const start = contour.nodes[0];
  if (!start) return { x: 1, y: 0 };
  for (let i = 0; i < contour.nodes.length - (contour.closed ? 0 : 1); i++) {
    const node = contour.nodes[i], next = contour.nodes[(i + 1) % contour.nodes.length];
    // The first non-coincident control gives the cubic's departing tangent.
    for (const p of [node.outgoing, next.incoming, next]) if (p && distance(start, p) > 1e-8) return { x: p.x - start.x, y: p.y - start.y };
  }
  return { x: 1, y: 0 };
}

export function lineToCurve(contour: Contour, startId: string): boolean {
  const index = contour.nodes.findIndex(n => n.id === startId);
  if (index < 0 || (!contour.closed && index === contour.nodes.length - 1)) return false;
  const a = contour.nodes[index], b = contour.nodes[(index + 1) % contour.nodes.length];
  if (a.outgoing || b.incoming || distance(a, b) < 1e-8) return false;
  a.outgoing = { x: Math.round((2 * a.x + b.x) / 3), y: Math.round((2 * a.y + b.y) / 3) };
  b.incoming = { x: Math.round((a.x + 2 * b.x) / 3), y: Math.round((a.y + 2 * b.y) / 3) };
  return true;
}
