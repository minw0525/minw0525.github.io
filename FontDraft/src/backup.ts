import type { Project, Layer, Drawing, Metrics } from './project';
import { roundProject } from './project';
import { newId } from './geometry';

export function projectBackup(projects: Project[]): string {
  return JSON.stringify({ format: 'fontdraft', version: 1, projects });
}
export function readBackup(text: string): Project[] {
  const file = JSON.parse(text);
  const check: (ok: unknown) => asserts ok = ok => { if (!ok) throw new Error('프로젝트 데이터 형식이 올바르지 않습니다.'); };
  const object = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  const id = (v: unknown) => typeof v === 'string' && /^[\w-]+$/.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v);
  const string = (v: unknown) => typeof v === 'string';
  const point = (v: { x: number; y: number }) => object(v) && Number.isFinite(v.x) && Number.isFinite(v.y);
  const unique = (items: { id: string }[]) => items.every(v => object(v) && id(v.id)) && new Set(items.map(v => v.id)).size === items.length;
  const metrics = (m: Metrics) => object(m) && [m.ascender, m.descender, m.xHeight, m.capHeight].every(Number.isFinite) && m.ascender > m.descender;
  function layer(l: Layer) {
    check(object(l) && Array.isArray(l.contours) && unique(l.contours));
    const nodeIds = new Set<string>();
    for (const c of l.contours) {
      check(typeof c.closed === 'boolean' && Array.isArray(c.nodes) && unique(c.nodes));
      for (const n of c.nodes) {
        check(point(n) && !nodeIds.has(n.id)); nodeIds.add(n.id);
        check(n.smooth === undefined || typeof n.smooth === 'boolean');
        for (const h of [n.incoming, n.outgoing]) check(h === undefined || point(h));
      }
    }
    if (l.annotations !== undefined) {
      check(Array.isArray(l.annotations) && unique(l.annotations));
      check(l.annotations.every(n => point(n) && string(n.text)));
    }
  }
  function drawing(d: Drawing) { check(object(d) && Number.isFinite(d.width)); layer(d); if (d.mask !== undefined) layer(d.mask); }
  check(object(file) && file.format === 'fontdraft');
  if (file.version !== 1) throw new Error('지원하지 않는 백업 버전입니다.');
  check(Array.isArray(file.projects) && file.projects.length > 0);
  for (const p of file.projects as Project[]) {
    check(object(p) && id(p.id) && string(p.name) && string(p.style) && Number.isFinite(p.upm) && p.upm > 0 && metrics(p));
    check(Array.isArray(p.glyphs) && p.glyphs.length > 0 && unique(p.glyphs));
    for (const g of p.glyphs) {
      check(string(g.name) && Array.isArray(g.unicodes) && g.unicodes.every(u => Number.isInteger(u) && u >= 0 && u <= 0x10ffff && !(u >= 0xd800 && u <= 0xdfff)));
      drawing(g);
    }
    check(p.glyphs.some(g => g.id === p.activeGlyph));
    if (p.masters !== undefined) {
      check(Array.isArray(p.masters) && unique(p.masters));
      for (const m of p.masters) {
        check(m.id !== 'default' && string(m.name) && metrics(m) && object(m.glyphs));
        for (const [key, d] of Object.entries(m.glyphs)) { check(p.glyphs.some(g => g.id === key)); drawing(d); }
      }
    }
    const masters = new Set(['default', ...(p.masters ?? []).map(m => m.id)]);
    check(p.activeMaster === undefined || masters.has(p.activeMaster));
    check(p.visibleMasters === undefined || (Array.isArray(p.visibleMasters) && p.visibleMasters.every(m => masters.has(m))));
    check(p.defaultMasterName === undefined || string(p.defaultMasterName));
    for (const v of [p.editMask, p.maskVisible]) check(v === undefined || typeof v === 'boolean');
  }
  return (file.projects as Project[]).map(p => roundProject({ ...p, id: newId() }));
}
