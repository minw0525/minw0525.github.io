import paper from 'paper';
import polygonClipping from 'polygon-clipping';
import type { Polygon } from 'polygon-clipping';
import type { Contour, Node, Point } from './model';
import { roundNodes } from './model';

// Paper is a temporary geometry workspace, never the document model.
const scope = new paper.PaperScope();
scope.setup(new scope.Size(1, 1));
scope.view.autoUpdate = false;
let serial = 0;
const idPrefix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
export const newId = () => `c${idPrefix}-${++serial}`;
export type Tip = { size: number; ratio: number; angle: number; simplify?: number; pressure?: boolean };
export type StrokePoint = Point & { pressure?: number };
export type SweepUnion = (polygons: Polygon[]) => [number, number][][];
export const pressureScale = (p: StrokePoint, tip: Tip) => tip.pressure && p.pressure !== undefined ? .15 + .85 * Math.max(0, Math.min(1, p.pressure)) : 1;

function toPath(c: Contour): paper.Path {
  const path = new scope.Path({ insert: false, closed: c.closed });
  path.addSegments(c.nodes.map(n => new scope.Segment(
    [n.x, n.y],
    n.incoming ? [n.incoming.x - n.x, n.incoming.y - n.y] : [0, 0],
    n.outgoing ? [n.outgoing.x - n.x, n.outgoing.y - n.y] : [0, 0],
  )));
  return path;
}
function fromItem(item: paper.PathItem): Contour[] {
  const paths = item instanceof scope.Path ? [item] : (item as paper.CompoundPath).children as paper.Path[];
  return paths.filter(p => p.segments.length >= 2 && Math.abs(p.area) > 1e-8).map(path => {
    const id = newId();
    return { id, closed: path.closed, nodes: path.segments.map((s, i): Node => ({
      id: `${id}-${i}`, x: s.point.x, y: s.point.y,
      ...(s.handleIn.length > 1e-8 && s.handleOut.length > 1e-8 && s.handleIn.dot(s.handleOut) < 0 && Math.abs(s.handleIn.cross(s.handleOut)) / (s.handleIn.length * s.handleOut.length) < 1e-6 ? { smooth: true } : {}),
      ...(s.handleIn.length > 1e-10 ? { incoming: { x: s.point.x + s.handleIn.x, y: s.point.y + s.handleIn.y } } : {}),
      ...(s.handleOut.length > 1e-10 ? { outgoing: { x: s.point.x + s.handleOut.x, y: s.point.y + s.handleOut.y } } : {}),
    })) };
  });
}

export function shape(kind: 'rectangle' | 'ellipse', a: Point, b: Point): Contour[] {
  if (Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01) return [];
  const rectangle = new scope.Rectangle(new scope.Point(Math.min(a.x, b.x), Math.min(a.y, b.y)), new scope.Size(Math.abs(b.x - a.x), Math.abs(b.y - a.y)));
  const path = kind === 'rectangle' ? new scope.Path.Rectangle({ rectangle, insert: false }) : new scope.Path.Ellipse({ rectangle, insert: false });
  path.clockwise = false; // Same direction as our sample's outer contour in glyph coordinates.
  return fromItem(path);
}

export function tipTransform(tip: Tip) {
  const angle = tip.angle * Math.PI / 180, rx = tip.size / 2, ry = rx * tip.ratio;
  const a = Math.cos(angle) * rx, b = Math.sin(angle) * rx;
  const c = -Math.sin(angle) * ry, d = Math.cos(angle) * ry;
  return { a, b, c, d, inverse: (p: Point): Point => ({ x: (d * p.x - c * p.y) / (a * d - b * c), y: (-b * p.x + a * p.y) / (a * d - b * c) }) };
}

// Reduce redundant pen samples before constructing and unioning swept tip polygons.
// Reserve this error from the final outline fitting budget.
function reduceStroke(points: StrokePoint[], tolerance: number, tip: Tip): StrokePoint[] {
  if (points.length < 3 || tolerance <= 0) return points;
  const keep = new Set([0, points.length - 1]), pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop()!, a = points[first], b = points[last];
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
    let worst = tolerance * tolerance, split = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i], t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
      const positionError = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
      const radiusError = Math.abs(pressureScale(p, tip) - (pressureScale(a, tip) * (1 - t) + pressureScale(b, tip) * t)) * tip.size / 2;
      const error = (positionError + radiusError) ** 2;
      if (error > worst) { worst = error; split = i; }
    }
    if (split >= 0) { keep.add(split); pending.push([first, split], [split, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i]);
}

function strokeItem(points: StrokePoint[], tip: Tip, union?: SweepUnion): paper.PathItem {
  const tolerance = tip.simplify ?? 3;
  const inputTolerance = Math.min(.75, tolerance / 4, tip.size * tip.ratio / 16);
  points = reduceStroke(points, inputTolerance, tip);
  const m = tipTransform(tip);
  const normalized = points.map(p => { const n = m.inverse(p); return new scope.Point(n.x, n.y); });
  let result: paper.PathItem;
  if (normalized.length === 1) result = new scope.Path.Circle({ center: normalized[0], radius: pressureScale(points[0], tip), insert: false });
  else {
    // Every neighboring sweep shares exactly the same polygonal pen tip at the joint.
    // Independent flattened semicircles can leave tiny holes at their shared seams.
    const tipPoints = Array.from({ length: 64 }, (_, i) => new scope.Point(Math.cos(i * Math.PI / 32), Math.sin(i * Math.PI / 32)));
    const rings = normalized.map((p, i) => tipPoints.map(t => [p.x + t.x * pressureScale(points[i], tip), p.y + t.y * pressureScale(points[i], tip)] as [number, number]));
    const polygons: Polygon[] = [];
    for (let i = 1; i < rings.length; i++) {
      const points = [...rings[i - 1], ...rings[i]].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const lower: [number, number][] = [], upper: [number, number][] = [];
      for (const p of points) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p); }
      for (const p of points.slice().reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p); }
      polygons.push([[...lower.slice(0, -1), ...upper.slice(0, -1)]]);
    }
    const ringsOut = union ? union(polygons) : polygonClipping.union(polygons[0], ...polygons.slice(1)).flatMap(polygon => polygon.map(ring => ring.slice(0, -1)));
    result = new scope.CompoundPath({ children: ringsOut.map(ring => new scope.Path({ segments: ring, closed: true, insert: false })), insert: false, fillRule: 'nonzero' });
  }
  result.transform(new scope.Matrix(m.a, m.b, m.c, m.d, 0, 0));
  result.reorient(true, false);
  return simplifyItem(result, tolerance - inputTolerance);

}

export function brush(points: StrokePoint[], tip: Tip, union?: SweepUnion): Contour[] {
  if (!points.length) return [];
  return fromItem(strokeItem(points, tip, union));
}

export function erase(contours: Contour[], selected: Set<string>, points: StrokePoint[], tip: Tip, union?: SweepUnion): Contour[] {
  if (!points.length) return contours;
  const eligible = contours.filter(c => c.closed && c.nodes.length >= 2 && (!selected.size || c.nodes.some(n => selected.has(n.id))));
  if (!eligible.length) return contours;
  const cutter = strokeItem(points, tip, union);
  const entries = eligible.map(c => ({ contour: c, path: toPath(c) }));
  const remaining = new Set(entries);
  const replacements = new Map<string, Contour[]>();
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(first);
    const group = [first];
    // Connected/interior boundaries must be evaluated together to preserve nonzero holes.
    for (let i = 0; i < group.length; i++) for (const candidate of remaining) {
      const a = group[i].path, b = candidate.path;
      if (a.bounds.intersects(b.bounds) && (a.getIntersections(b).length || a.contains(b.firstSegment.point) || b.contains(a.firstSegment.point))) {
        remaining.delete(candidate); group.push(candidate);
      }
    }
    if (!group.some(e => e.path.bounds.intersects(cutter.bounds))) continue;
    const input = new scope.CompoundPath({ children: group.map(e => e.path), insert: false, fillRule: 'nonzero' });
    const overlap = input.intersect(cutter, { insert: false });
    if (Math.abs((overlap as paper.Path | paper.CompoundPath).area) < 1e-8) continue; // No visible area removed: preserve all original nodes and IDs.
    const root = group.reduce((a, b) => Math.abs(a.path.area) >= Math.abs(b.path.area) ? a : b);
    const result = input.subtract(cutter, { insert: false });
    result.reorient(true, root.path.clockwise);
    replacements.set(first.contour.id, fromItem(simplifyItem(result, tip.simplify ?? 3)));
    for (const entry of group.slice(1)) replacements.set(entry.contour.id, []);
  }
  return contours.flatMap(c => replacements.get(c.id) ?? [c]);
}

// Used by geometry regression tests to compare the visible result, independent of node count.
export function contains(contours: Contour[], point: Point): boolean {
  const item = new scope.CompoundPath({ children: contours.filter(c => c.closed).map(toPath), insert: false, fillRule: 'nonzero' });
  return item.contains(new scope.Point(point.x, point.y));
}

function readPath(path: paper.Path, id: string, ids = new Map<paper.Segment, string>()): Contour {
  return { id, closed: path.closed, nodes: path.segments.map(s => ({
    id: ids.get(s) ?? `${id}-${newId()}`, x: s.point.x, y: s.point.y,
    ...(s.handleIn.length > 1e-10 ? { incoming: { x: s.point.x + s.handleIn.x, y: s.point.y + s.handleIn.y } } : {}),
    ...(s.handleOut.length > 1e-10 ? { outgoing: { x: s.point.x + s.handleOut.x, y: s.point.y + s.handleOut.y } } : {}),
  })) };
}
function divideLocations(path: paper.Path, line: paper.Path, endpoints?: paper.Point[]): boolean {
  const locations = path.getIntersections(line).filter(l => !endpoints || endpoints.some(p => p.getDistance(l.point) < 1e-6)).map(l => ({ index: l.index, time: l.time }))
    .filter(l => l.time > 1e-8 && l.time < 1 - 1e-8)
    .sort((a, b) => b.index - a.index || b.time - a.time);
  let index = -1, end = 1;
  let changed = false;
  for (const l of locations) {
    if (l.index !== index) { index = l.index; end = 1; }
    if (Math.abs(l.time - end) < 1e-8) continue;
    path.curves[index].divideAtTime(l.time / end); end = l.time; changed = true;
  }
  return changed;
}
function knifeLine(a: Point, b: Point) { return new scope.Path({ segments: [[a.x, a.y], [b.x, b.y]], insert: false }); }
function targets(contours: Contour[], selected: Set<string>) { return contours.filter(c => !selected.size || c.nodes.some(n => selected.has(n.id))); }

export function knifeIntersections(contours: Contour[], selected: Set<string>, a: Point, b: Point): Point[] {
  const line = knifeLine(a, b);
  const result: Point[] = [];
  for (const c of targets(contours, selected)) for (const l of toPath(c).getIntersections(line)) {
    const p = { x: l.point.x, y: l.point.y };
    if (!result.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6)) result.push(p);
  }
  return result;
}

export function knife(contours: Contour[], selected: Set<string>, a: Point, b: Point, split: boolean): Contour[] {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-8) return contours;
  const line = knifeLine(a, b), eligible = targets(contours, selected);
  if (!split) return contours.map(c => {
    if (!eligible.includes(c)) return c;
    const path = toPath(c), ids = new Map(path.segments.map((s, i) => [s, c.nodes[i].id]));
    return divideLocations(path, line) ? readPath(path, c.id, ids) : c;
  });

  const remaining = new Set(eligible.filter(c => c.closed && c.nodes.length >= 2).map(c => ({ c, path: toPath(c) })));
  const replacements = new Map<string, Contour[]>();
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(first);
    const group = [first];
    for (let i = 0; i < group.length; i++) for (const e of remaining) {
      const p = group[i].path, q = e.path;
      if (p.clockwise !== q.clockwise && p.bounds.intersects(q.bounds) && !p.getIntersections(q).length && (p.contains(q.firstSegment.point) || q.contains(p.firstSegment.point))) { remaining.delete(e); group.push(e); }
    }
    const compound = new scope.CompoundPath({ children: group.map(e => e.path), fillRule: 'nonzero', insert: false });
    // Normalize redundant overlapping boundaries before adding cut edges.
    const normalized = compound.unite(new scope.Path({ insert: false }), { insert: false });
    const root = group.reduce((x, y) => Math.abs(x.path.area) >= Math.abs(y.path.area) ? x : y);
    normalized.reorient(true, root.path.clockwise);
    const hits = normalized.getIntersections(line).filter(l => l.isCrossing() && !l.hasOverlap()).map(l => l.point)
      .sort((p, q) => p.subtract(a).dot(new scope.Point(b.x - a.x, b.y - a.y)) - q.subtract(a).dot(new scope.Point(b.x - a.x, b.y - a.y)))
      .filter((p, i, all) => !i || p.getDistance(all[i - 1]) > 1e-6);
    const pairs: [paper.Point, paper.Point][] = [];
    for (let i = 1; i < hits.length; i++) {
      if (normalized.contains(hits[i - 1].add(hits[i]).divide(2))) pairs.push([hits[i - 1], hits[i]]);
    }
    if (!pairs.length) continue;
    const paths = normalized instanceof scope.Path ? [normalized] : (normalized as paper.CompoundPath).children as paper.Path[];
    type Link = { node: Node; next: Link };
    const links: Link[] = [];
    for (const p of paths) {
      divideLocations(p, line, pairs.flat());
      const nodes = readPath(p, newId()).nodes;
      const cycle = nodes.map(node => ({ node } as Link));
      cycle.forEach((link, i) => link.next = cycle[(i + 1) % cycle.length]);
      links.push(...cycle);
    }
    // Each cut contributes two opposite straight edges. Swapping boundary successors
    // splits a cycle or joins outer/hole cycles without extending the finite cut.
    for (const [p, q] of pairs) {
      const x = links.find(l => p.getDistance([l.node.x, l.node.y]) < 1e-5);
      const y = links.find(l => q.getDistance([l.node.x, l.node.y]) < 1e-5);
      if (!x || !y || x === y) throw new Error('Knife crossing could not be matched to a boundary node');
      const xx: Link = { node: { ...structuredClone(x.node), id: newId(), incoming: undefined }, next: x.next };
      const yy: Link = { node: { ...structuredClone(y.node), id: newId(), incoming: undefined }, next: y.next };
      x.node.outgoing = undefined; y.node.outgoing = undefined;
      x.next = yy; y.next = xx; links.push(xx, yy);
    }
    const visited = new Set<Link>(), result: Contour[] = [];
    for (const start of links) {
      if (visited.has(start)) continue;
      const nodes: Node[] = []; let current = start;
      do { visited.add(current); nodes.push(current.node); current = current.next; } while (current !== start && !visited.has(current));
      if (current !== start) throw new Error('Knife boundary did not close');
      result.push({ id: newId(), closed: true, nodes });
    }
    replacements.set(first.c.id, result);
    group.slice(1).forEach(e => replacements.set(e.c.id, []));
  }
  return contours.flatMap(c => replacements.get(c.id) ?? [c]);
}

export function breakAtNode(contours: Contour[], nodeId: string): Contour[] {
  return contours.flatMap(c => {
    const i = c.nodes.findIndex(n => n.id === nodeId);
    if (i < 0 || (!c.closed && (i === 0 || i === c.nodes.length - 1))) return [c];
    const nodes = structuredClone(c.nodes);
    const start = { ...structuredClone(nodes[i]), incoming: undefined };
    const end = { ...structuredClone(nodes[i]), id: newId(), outgoing: undefined };
    if (c.closed) return [{ ...c, closed: false, nodes: [start, ...nodes.slice(i + 1), ...nodes.slice(0, i), end] }];
    return [{ ...c, nodes: [...nodes.slice(0, i), end] }, { id: newId(), closed: false, nodes: [start, ...nodes.slice(i + 1)] }];
  });
}

// Union normalizes selected contours; subtraction uses selected contours as cutters.
export function combine(contours: Contour[], selected: Set<string>, operation: 'unite' | 'subtract' = 'unite'): Contour[] {
  const closed = contours.filter(c => c.closed && c.nodes.length >= 2);
  const cutters = closed.filter(c => c.nodes.some(n => selected.has(n.id)));
  const subtract = operation === 'subtract';
  if (cutters.length < (subtract ? 1 : 2)) return contours;
  const eligible = subtract ? closed.filter(c => !cutters.includes(c)) : cutters;
  const cutter = subtract ? new scope.CompoundPath({ children: cutters.map(toPath), insert: false, fillRule: 'nonzero' }) : null;
  const remaining = new Set(eligible.map(c => ({ c, path: toPath(c) })));
  const replacements = new Map<string, Contour[]>();
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(first);
    const group = [first];
    for (let i = 0; i < group.length; i++) for (const candidate of remaining) {
      const a = group[i].path, b = candidate.path;
      if (a.bounds.intersects(b.bounds) && (a.getIntersections(b).length || a.contains(b.firstSegment.point) || b.contains(a.firstSegment.point))) {
        remaining.delete(candidate); group.push(candidate);
      }
    }
    if (!cutter && group.length < 2) continue;
    const input = new scope.CompoundPath({ children: group.map(e => e.path), insert: false, fillRule: 'nonzero' });
    if (cutter && Math.abs((input.intersect(cutter, { insert: false }) as paper.Path | paper.CompoundPath).area) < 1e-8) continue;
    const root = group.reduce((a, b) => Math.abs(a.path.area) >= Math.abs(b.path.area) ? a : b);
    const result = cutter ? input.subtract(cutter, { insert: false }) : input.unite(new scope.Path({ insert: false }), { insert: false });
    result.reorient(true, root.path.clockwise);
    replacements.set(first.c.id, fromItem(result));
    for (const entry of group.slice(1)) replacements.set(entry.c.id, []);
  }
  if (subtract && replacements.size) for (const c of cutters) replacements.set(c.id, []);
  return contours.flatMap(c => replacements.get(c.id) ?? [c]);
}

export function outlineBounds(contours: Contour[]) {
  const paths = contours.filter(c => c.nodes.length).map(toPath);
  if (!paths.length) return null;
  let bounds = paths[0].bounds.clone();
  for (const p of paths.slice(1)) bounds = bounds.unite(p.bounds);
  return { left: bounds.left, right: bounds.right, bottom: bounds.top, top: bounds.bottom };
}
export function segmentHit(contours: Contour[], point: Point, tolerance: number) {
  let best: { contour: Contour; node: Node; part: 'segment' } | null = null;
  for (const contour of contours) {
    const location = toPath(contour).getNearestLocation(new scope.Point(point));
    if (location && location.distance < tolerance) { tolerance = location.distance; best = { contour, node: contour.nodes[location.index], part: 'segment' }; }
  }
  return best;
}

function simplifyItem(item: paper.PathItem, tolerance: number): paper.PathItem {
  if (tolerance <= 0) return item;
  const paths = item instanceof scope.Path ? [item] : (item as paper.CompoundPath).children as paper.Path[];
  const withinTolerance = (a: paper.Path, b: paper.Path) => {
    for (const [source, target] of [[a, b], [b, a]]) {
      const count = Math.min(2048, Math.max(24, Math.ceil(source.length / Math.max(tolerance / 2, .5))));
      for (let i = 0; i <= count; i++) {
        const p = source.getPointAt(source.length * i / count);
        if (p && target.getNearestPoint(p).getDistance(p) > tolerance) return false;
      }
      for (const segment of source.segments) if (target.getNearestPoint(segment.point).getDistance(segment.point) > tolerance) return false;
    }
    return true;
  };
  const fitSpan = (span: paper.Path) => {
    if (span.segments.length <= 2) return span;
    const count = Math.min(4096, Math.max(8, Math.ceil(span.length / Math.max(tolerance / 2, .5))));
    const points = Array.from({ length: count + 1 }, (_, i) => span.getPointAt(span.length * i / count) ?? span.lastSegment.point);
    // Paper implements Schneider's recursive cubic fitting with squared-distance error.
    // Retry only the failing span; a corner must not restore the entire dense contour.
    for (const fraction of [1, .5, .25]) {
      const candidate = new scope.Path({ segments: points, insert: false });
      candidate.simplify((tolerance * fraction) ** 2);
      if (candidate.segments.length < span.segments.length && withinTolerance(span, candidate)) return candidate;
    }
    return span;
  };
  const reduced = paths.map(path => {
    if (path.segments.length <= 8) return path.clone({ insert: false });
    const segments = path.segments, n = segments.length, anchors = new Set<number>();
    for (let i = 0; i < n; i++) {
      const p = segments[(i + n - 1) % n], node = segments[i], next = segments[(i + 1) % n];
      const incoming = node.handleIn.length ? node.handleIn.negate() : node.point.subtract(p.point);
      const outgoing = node.handleOut.length ? node.handleOut : next.point.subtract(node.point);
      if (incoming.length && outgoing.length && incoming.normalize().dot(outgoing.normalize()) < .5) anchors.add(i);
    }
    if (!anchors.size) {
      const xs = segments.map(s => s.point.x);
      anchors.add(xs.indexOf(Math.min(...xs))); anchors.add(xs.indexOf(Math.max(...xs)));
    }
    if (anchors.size === 1) anchors.add(([...anchors][0] + Math.floor(n / 2)) % n);
    const indices = [...anchors].sort((a, b) => a - b), joined: paper.Segment[] = [];
    for (let i = 0; i < indices.length; i++) {
      const start = indices[i], end = indices[(i + 1) % indices.length], count = (end - start + n) % n;
      const span = new scope.Path({ segments: Array.from({ length: count + 1 }, (_, j) => segments[(start + j) % n].clone()), insert: false });
      span.firstSegment.handleIn = new scope.Point(0, 0); span.lastSegment.handleOut = new scope.Point(0, 0);
      const fitted = fitSpan(span);
      if (joined.length) joined.at(-1)!.handleOut = fitted.firstSegment.handleOut.clone();
      joined.push(...fitted.segments.slice(joined.length ? 1 : 0).map(s => s.clone()));
    }
    joined[0].handleIn = joined.at(-1)!.handleIn.clone(); joined.pop();
    const candidate = new scope.Path({ segments: joined, closed: true, insert: false });
    if (candidate.segments.length >= segments.length || candidate.segments.length < 2 || candidate.clockwise !== path.clockwise || candidate.getIntersections().some(l => l.isCrossing())) return path.clone({ insert: false });
    return candidate;
  });
  // Validate relationships too: separate boundaries must not cross or lose containment.
  for (let i = 0; i < reduced.length; i++) for (let j = i + 1; j < reduced.length; j++) {
    if (paths[i].getIntersections(paths[j]).some(l => l.isCrossing())) continue;
    if (reduced[i].getIntersections(reduced[j]).some(l => l.isCrossing()) || paths[i].contains(paths[j].firstSegment.point) !== reduced[i].contains(reduced[j].firstSegment.point) || paths[j].contains(paths[i].firstSegment.point) !== reduced[j].contains(reduced[i].firstSegment.point)) {
      reduced[i] = paths[i].clone({ insert: false }); reduced[j] = paths[j].clone({ insert: false });
    }
  }
  return new scope.CompoundPath({ children: reduced, insert: false, fillRule: 'nonzero' });
}

// Delete explicit anchors, handles, or edges without changing unrelated contours.
export function deleteSelection(contours: Contour[], nodes: Set<string>, handles: Set<string>, edges: Set<string>): Contour[] {
  return contours.flatMap(original => {
    if (!original.nodes.some(n => nodes.has(n.id) || edges.has(n.id) || handles.has(`${n.id}:incoming`) || handles.has(`${n.id}:outgoing`))) return [original];
    const c = structuredClone(original); c.nodes = c.nodes.filter(n => !nodes.has(n.id));
    if (c.nodes.length < 2) return [];
    for (const n of c.nodes) for (const part of ['incoming', 'outgoing'] as const) if (handles.has(`${n.id}:${part}`)) { delete n[part]; delete n.smooth; }
    const cuts = new Set<number>();
    for (let i = 0; i < c.nodes.length - (c.closed ? 0 : 1); i++) {
      const oldIndex = original.nodes.findIndex(n => n.id === c.nodes[i].id);
      if (edges.has(c.nodes[i].id) && original.nodes[(oldIndex + 1) % original.nodes.length].id === c.nodes[(i + 1) % c.nodes.length].id) cuts.add(i);
    }
    const result: Contour[] = [];
    if (!cuts.size) result.push(c);
    else {
      const start = c.closed ? ([...cuts][0] + 1) % c.nodes.length : 0;
      let run: Node[] = [];
      for (let j = 0; j < c.nodes.length; j++) {
        const i = (start + j) % c.nodes.length; run.push(c.nodes[i]);
        if (cuts.has(i) || j === c.nodes.length - 1) {
          if (run.length >= 2) result.push({ id: result.length ? newId() : c.id, closed: false, nodes: run });
          run = [];
        }
      }
    }
    for (const path of result) if (!path.closed) { delete path.nodes[0].incoming; delete path.nodes.at(-1)!.outgoing; }
    return result;
  });
}

export function insertNode(contour: Contour, point: Point): Contour {
  const path = toPath(contour), location = path.getNearestLocation(new scope.Point(point));
  if (!location || location.time < 1e-5 || location.time > 1 - 1e-5) return contour;
  const ids = new Map(path.segments.map((s, i) => [s, contour.nodes[i].id]));
  path.curves[location.index].divideAtTime(location.time);
  const result = readPath(path, contour.id, ids);
  for (const n of result.nodes) {
    const original = contour.nodes.find(old => old.id === n.id);
    if (original?.smooth || (!original && n.incoming && n.outgoing)) n.smooth = true;
  }
  return result;
}

// Fit the two incident cubics to one cubic with fixed endpoints and tangent directions.
export function removeNodePreservingCurve(contour: Contour, id: string): Contour | null {
  const index = contour.nodes.findIndex(n => n.id === id);
  if (index < 0) return contour;
  if (contour.nodes.length <= 2) return null;
  const result = structuredClone(contour), nodes = result.nodes, n = nodes[index];
  if (!contour.closed && (index === 0 || index === nodes.length - 1)) {
    nodes.splice(index, 1); delete nodes[0].incoming; delete nodes.at(-1)!.outgoing; return result;
  }
  const prevIndex = (index + nodes.length - 1) % nodes.length, nextIndex = (index + 1) % nodes.length;
  const a = nodes[prevIndex], b = nodes[nextIndex], path = toPath(contour);
  const first = path.curves[prevIndex], second = path.curves[index];
  if (a.outgoing || n.incoming || n.outgoing || b.incoming) {
    const start = new scope.Point(a), end = new scope.Point(b);
    const d1 = new scope.Point(a.outgoing ?? n).subtract(start).normalize();
    const d2 = new scope.Point(b.incoming ?? n).subtract(end).normalize();
    const left = n.incoming ? Math.hypot(n.x - n.incoming.x, n.y - n.incoming.y) : 0;
    const right = n.outgoing ? Math.hypot(n.x - n.outgoing.x, n.y - n.outgoing.y) : 0;
    const split = Math.max(.01, Math.min(.99, left && right ? left / (left + right) : first.length / (first.length + second.length)));
    let aa = 0, ab = 0, bb = 0, ax = 0, bx = 0;
    for (let i = 1; i < 64; i++) {
      const t = i / 64, u = 1 - t;
      const p = t <= split ? first.getPointAtTime(t / split) : second.getPointAtTime((t - split) / (1 - split));
      const v1 = d1.multiply(3 * u * u * t), v2 = d2.multiply(3 * u * t * t);
      const residual = p.subtract(start.multiply(u * u * u + 3 * u * u * t)).subtract(end.multiply(t * t * t + 3 * u * t * t));
      aa += v1.dot(v1); ab += v1.dot(v2); bb += v2.dot(v2); ax += v1.dot(residual); bx += v2.dot(residual);
    }
    const det = aa * bb - ab * ab, fallback = start.getDistance(end) / 3;
    const l1 = det > 1e-10 ? Math.max(0, (ax * bb - bx * ab) / det) : fallback;
    const l2 = det > 1e-10 ? Math.max(0, (bx * aa - ax * ab) / det) : fallback;
    a.outgoing = { x: a.x + d1.x * l1, y: a.y + d1.y * l1 };
    b.incoming = { x: b.x + d2.x * l2, y: b.y + d2.y * l2 };
  }
  nodes.splice(index, 1); return result;
}

// Unmerged tangent sweeps are inexpensive enough for the live SVG preview.
export function strokePreviewPath(samples: StrokePoint[], tip: Tip): string {
  const points = reduceStroke(samples, .3, tip), m = tipTransform(tip);
  const circles = points.map(p => ({ ...m.inverse(p), r: pressureScale(p, tip) }));
  let d = circles.map(p => `M${p.x-p.r},${p.y}a${p.r},${p.r} 0 1 0 ${2*p.r},0a${p.r},${p.r} 0 1 0 ${-2*p.r},0Z`).join('');
  for (let i=1;i<circles.length;i++) {
    const a=circles[i-1], b=circles[i], dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx,dy);
    if (length <= Math.abs(a.r-b.r)) continue;
    const angle=Math.atan2(dy,dx), offset=Math.acos((a.r-b.r)/length);
    const c=Math.cos(angle+offset), s=Math.sin(angle+offset), e=Math.cos(angle-offset), f=Math.sin(angle-offset);
    d+=`M${a.x+a.r*c},${a.y+a.r*s}L${b.x+b.r*c},${b.y+b.r*s}L${b.x+b.r*e},${b.y+b.r*f}L${a.x+a.r*e},${a.y+a.r*f}Z`;
  }
  return d;
}

// Only newly generated outlines are cleaned. A short edge alone is not proof
// that its anchors are redundant: retain it unless the fitted curve and topology agree.
export function cleanStrokeContours(contours: Contour[], tolerance: number, preserve = new Set<string>()): Contour[] {
  if (tolerance <= 0) return contours;
  const budget = Math.min(.75, tolerance / 4);
  return contours.map((original, contourIndex) => {
    if (preserve.has(original.id)) return original;
    let result = original;
    const reference = toPath(original);
    const neighbors = contours.filter((_, i) => i !== contourIndex).map(toPath);
    let i = 0;
    while (result.nodes.length > 3 && i < result.nodes.length) {
      const path = toPath(result), curve = path.curves[i];
      if (!curve || curve.length > 3) { i++; continue; }
      const next = (i + 1) % result.nodes.length;
      const candidates: (() => Contour)[] = [];
      // A collapsed edge needs no refit: keep the incoming curve of its first
      // anchor and the outgoing curve of its second anchor, exactly as drawn.
      if (result.nodes[i].x === result.nodes[next].x && result.nodes[i].y === result.nodes[next].y && curve.length <= budget) {
        const merged = structuredClone(result);
        merged.nodes[i].outgoing = merged.nodes[next].outgoing;
        merged.nodes[i].smooth = false;
        merged.nodes.splice(next, 1); candidates.push(() => merged);
      }
      candidates.push(() => removeNodePreservingCurve(result, result.nodes[next].id)!);
      // Either endpoint may carry the corner; try retaining the other one too.
      candidates.push(() => removeNodePreservingCurve(result, result.nodes[i].id)!);
      let accepted: Contour | undefined;
      for (const createCandidate of candidates) {
        const candidate = createCandidate();
        roundNodes([candidate]);
        const fitted = toPath(candidate);
        let valid = fitted.clockwise === reference.clockwise && !fitted.getIntersections().some(l => l.isCrossing());
        // Compare against the original, so repeated removals cannot accumulate error.
        if (valid) for (const [a,b] of [[reference,fitted],[fitted,reference]]) {
          const count = Math.min(2048, Math.max(32, Math.ceil(a.length / .75)));
          for (let j = 0; j <= count; j++) {
            const p = a.getPointAt(a.length * j / count);
            if (p && b.getNearestPoint(p).getDistance(p) > budget) { valid = false; break; }
          }
          if (!valid) break;
        }
        if (valid) for (const neighbor of neighbors) {
          if (fitted.getIntersections(neighbor).some(l => l.isCrossing()) || reference.contains(neighbor.firstSegment.point) !== fitted.contains(neighbor.firstSegment.point) || neighbor.contains(reference.firstSegment.point) !== neighbor.contains(fitted.firstSegment.point)) { valid = false; break; }
        }
        if (valid) { accepted = candidate; break; }
      }
      if (accepted) result = accepted; else i++;
    }
    return result;
  });
}

// Extend the incident edges of each split arc, then close it without a union band.
export function makeOverlap(contours: Contour[], selected: Set<string>): Contour[] {
  const hits = contours.flatMap(c => c.nodes.flatMap((n, i) => selected.has(n.id) ? [{ c, n, i }] : []));
  if (hits.length !== 2 || hits[0].c !== hits[1].c || !hits[0].c.closed) throw new Error('같은 닫힌 컨투어의 노드 두 개를 선택하세요.');
  const [a, b] = hits, c = a.c, count = c.nodes.length;
  if ((a.i + 1) % count === b.i || (b.i + 1) % count === a.i) throw new Error('서로 이웃하지 않는 노드 두 개를 선택하세요.');
  const original = toPath(c), pa = new scope.Point(a.n), pb = new scope.Point(b.n);
  if (pa.getDistance(pb) < 2) throw new Error('서로 떨어진 노드 두 개를 선택하세요.');
  const line = new scope.Path.Line({ from: pa, to: pb, insert: false });
  if (original.getIntersections(line).some(l => l.point.getDistance(pa) > .01 && l.point.getDistance(pb) > .01) || !original.contains(pa.add(pb).divide(2))) throw new Error('두 노드를 잇는 선이 도형 내부를 지나야 합니다.');
  const arc = (start: number, end: number): Contour => {
    const nodes: Node[] = []; for (let i = start; ; i = (i + 1) % count) { const n = structuredClone(c.nodes[i]); if (i === start || i === end) n.id = newId(); nodes.push(n); if (i === end) break; }
    const first = nodes[0], second = nodes[1], last = nodes.at(-1)!, previous = nodes.at(-2)!;
    const extend = (node: Node, controls: (Point | undefined)[]) => {
      const control = controls.find(p => p && Math.hypot(p.x - node.x, p.y - node.y) > 1e-8);
      if (!control) throw new Error('길이가 없는 선분은 연장할 수 없습니다.');
      const length = Math.hypot(node.x - control.x, node.y - control.y);
      return { id: newId(), x: node.x + 24 * (node.x - control.x) / length, y: node.y + 24 * (node.y - control.y) / length };
    };
    const firstTip = extend(first, [first.outgoing, second.incoming, second]);
    const lastTip = extend(last, [last.incoming, previous.outgoing, previous]);
    delete first.incoming; delete last.outgoing;
    if (first.outgoing || second.incoming) { first.smooth = false; nodes.unshift(firstTip); }
    else nodes[0] = firstTip;
    if (last.incoming || previous.outgoing) { last.smooth = false; nodes.push(lastTip); }
    else nodes[nodes.length - 1] = lastTip;
    // Straight anchors on the new closing edge are redundant, not new corners.
    let changed = true;
    while (changed && nodes.length > 3) {
      changed = false;
      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[(i + nodes.length - 1) % nodes.length], n = nodes[i], q = nodes[(i + 1) % nodes.length];
        if (p.outgoing || n.incoming || n.outgoing || q.incoming) continue;
        const ax = n.x - p.x, ay = n.y - p.y, bx = q.x - n.x, by = q.y - n.y;
        if (Math.abs(ax * by - ay * bx) < 1e-8 && ax * bx + ay * by >= 0) { nodes.splice(i, 1); changed = true; break; }
      }
    }
    return { id: newId(), closed: true, nodes };
  };
  const results = [arc(a.i, b.i), arc(b.i, a.i)];
  const [first, second] = results.map(toPath), common = first.intersect(second, { insert: false });
  const area = (p: paper.PathItem) => Math.abs((p as paper.Path | paper.CompoundPath).area);
  const union = first.unite(second, { insert: false });
  if (first.getIntersections().length || second.getIntersections().length || area(common) < 1 || area(original.subtract(union, { insert: false })) + area(union.subtract(original, { insert: false })) > .01) throw new Error('이 두 모서리를 연장하면 외곽이 달라집니다. 안쪽 모서리 두 개를 선택하세요.');
  if (contours.some(other => other !== c && other.closed && area(common.intersect(toPath(other), { insert: false })) > .01)) throw new Error('겹침 영역이 다른 컨투어와 만납니다. 다른 노드 조합을 선택하세요.');
  roundNodes(results);
  return contours.flatMap(item => item === c ? results : [item]);
}
