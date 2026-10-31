import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import type { Project, Glyph } from './project';
import { roundProject, drawing, defaultMaster } from './project';
import type { Contour, Node, Point } from './model';
import { newId } from './geometry';

type Value = string | number | boolean | Value[] | { [key: string]: Value };
type Dict = { [key: string]: Value };
const annotationsKey = 'org.fontdraft.annotations';
const versionKey = 'org.fontdraft.formatVersion';
const mastersKey = 'org.fontdraft.masters';
export const escapeXML = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
function fail(reason: string): never { throw new Error(reason); }
function number(value: string | null | Value, label: string): number {
  if (value === null || (typeof value === 'string' && !value.trim()) || (typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(Number(value))) fail(`${label}: 올바른 숫자가 아닙니다.`);
  return Number(value);
}
function xml(text: string, root: string): Element {
  if (/<!ENTITY/i.test(text)) fail('XML 엔티티 선언은 지원하지 않습니다.');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.tagName !== root) fail(`${root}: 잘못된 XML입니다.`);
  return doc.documentElement;
}
function encode(value: Value): string {
  if (typeof value === 'string') return `<string>${escapeXML(value)}</string>`;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('저장할 수 없는 숫자입니다.'); return `<${Number.isInteger(value) ? 'integer' : 'real'}>${value}</${Number.isInteger(value) ? 'integer' : 'real'}>`; }
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (Array.isArray(value)) return `<array>${value.map(encode).join('')}</array>`;
  return `<dict>${Object.entries(value).map(([k, v]) => `<key>${escapeXML(k)}</key>${encode(v)}`).join('')}</dict>`;
}
function plist(value: Value): string { return `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">${encode(value)}</plist>`; }
function decode(e: Element): Value {
  if (e.tagName === 'string') return e.textContent ?? '';
  if (e.tagName === 'integer' || e.tagName === 'real') return number(e.textContent, 'plist 숫자');
  if (e.tagName === 'true' || e.tagName === 'false') return e.tagName === 'true';
  if (e.tagName === 'array') return [...e.children].map(decode);
  if (e.tagName === 'dict') {
    const result: Dict = Object.create(null), children = [...e.children];
    if (children.length % 2) fail('잘못된 plist 딕셔너리입니다.');
    for (let i = 0; i < children.length; i += 2) {
      const key = children[i].textContent ?? '';
      if (children[i].tagName !== 'key' || Object.hasOwn(result, key)) fail('중복되거나 잘못된 plist 키입니다.');
      result[key] = decode(children[i + 1]);
    }
    return result;
  }
  return fail(`지원하지 않는 plist 형식: ${e.tagName}`);
}
function readPlist(text: string): Value {
  const root = xml(text, 'plist');
  if (root.children.length !== 1) fail('plist는 하나의 값을 가져야 합니다.');
  return decode(root.children[0]);
}
function dict(value: Value): Dict { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('딕셔너리 형식이 필요합니다.'); return value as Dict; }
function allowedKeys(value: Dict, allowed: string[], label: string) {
  const unknown = Object.keys(value).filter(k => !allowed.includes(k));
  if (unknown.length) fail(`${label} 미지원 항목: ${unknown.join(', ')}. 데이터 보존을 위해 열기를 중단했습니다.`);
}
function attributes(e: Element, allowed: string[]) {
  for (const a of e.attributes) if (!allowed.includes(a.name)) fail(`${e.tagName}의 ${a.name} 속성은 아직 지원하지 않습니다.`);
}
function textValue(value: Value | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.trim()) fail('이름은 비어 있지 않은 문자열이어야 합니다.');
  return value;
}

export function glyphXML(glyph: Glyph): string {
  const point = (p: Point, type?: string, id?: string, smooth?: boolean) => `<point x="${p.x}" y="${p.y}"${type ? ` type="${type}"` : ''}${smooth ? ' smooth="yes"' : ''}${id ? ` identifier="${escapeXML(id)}"` : ''}/>`;
  const outline = glyph.contours.map(c => {
    if (!c.nodes.length) return '';
    const nodes = c.nodes;
    const first = nodes[0], last = nodes.at(-1)!;
    let points = point(first, !c.closed ? 'move' : last.outgoing || first.incoming ? 'curve' : 'line', first.id, first.smooth);
    for (let i = 1; i < nodes.length + (c.closed ? 1 : 0); i++) {
      const a = nodes[i - 1], b = nodes[i % nodes.length], curved = !!(a.outgoing || b.incoming);
      if (curved) points += point(a.outgoing ?? a) + point(b.incoming ?? b);
      if (i < nodes.length) points += point(b, curved ? 'curve' : 'line', b.id, b.smooth);
    }
    return `<contour identifier="${escapeXML(c.id)}">${points}</contour>`;
  }).join('');
  const lib = glyph.annotations?.length ? `<lib>${encode({ [annotationsKey]: { version: 1, items: glyph.annotations.map(a => ({ ...a })) } })}</lib>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<glyph name="${escapeXML(glyph.name)}" format="2"><advance width="${glyph.width}"/>${glyph.unicodes.map(u => `<unicode hex="${u.toString(16).toUpperCase().padStart(4, '0')}"/>`).join('')}<outline>${outline}</outline>${lib}</glyph>`;
}

function readGlyph(text: string, name: string): Glyph {
  const root = xml(text, 'glyph'); attributes(root, ['name', 'format', 'formatMinor']);
  if (root.getAttribute('format') !== '2' || number(root.getAttribute('formatMinor') ?? '0', 'GLIF 버전') !== 0) fail(`${name}: GLIF 2.0만 지원합니다.`);
  const ids = new Set<string>();
  const identifier = (e: Element) => {
    const id = e.getAttribute('identifier') ?? newId();
    if (!/^[\x20-\x7e]{1,100}$/.test(id) || ids.has(id)) fail(`${name}: 중복되거나 잘못된 식별자입니다.`);
    ids.add(id); return id;
  };
  const glyph: Glyph = { id: newId(), name, unicodes: [], width: 0, contours: [] };
  let advance = false, outline = false, hasLib = false;
  for (const child of root.children) {
    if (child.tagName === 'advance') {
      attributes(child, ['width']); if (advance) fail(`${name}: advance 중복`); advance = true;
      glyph.width = number(child.getAttribute('width') ?? '0', '글자 폭');
    } else if (child.tagName === 'unicode') {
      attributes(child, ['hex']); const hex = child.getAttribute('hex') ?? '';
      if (!/^[0-9a-f]{1,6}$/i.test(hex)) fail(`${name}: 문자 코드 오류`);
      const u = parseInt(hex, 16);
      if (u > 0x10ffff || (u >= 0xd800 && u <= 0xdfff)) fail(`${name}: 문자 코드 범위 오류`);
      if (!glyph.unicodes.includes(u)) glyph.unicodes.push(u);
    } else if (child.tagName === 'lib') {
      if (hasLib || child.children.length !== 1) fail(`${name}: 잘못된 lib`);
      hasLib = true; attributes(child, []);
      const lib = dict(decode(child.children[0])); allowedKeys(lib, [annotationsKey], '글리프 lib');
      if (lib[annotationsKey] !== undefined) {
        const data = dict(lib[annotationsKey]); allowedKeys(data, ['version', 'items'], '주석');
        if (data.version !== 1 || !Array.isArray(data.items)) fail(`${name}: 지원하지 않는 주석 형식`);
        const ids = new Set<string>();
        glyph.annotations = data.items.map(value => {
          const a = dict(value); allowedKeys(a, ['id', 'x', 'y', 'text'], '주석');
          if (typeof a.id !== 'string' || !/^[\x20-\x7e]{1,100}$/.test(a.id) || ids.has(a.id) || typeof a.text !== 'string' || !a.text.trim() || a.text.length > 2000) fail(`${name}: 잘못된 주석`);
          ids.add(a.id);
          return { id: a.id, x: number(a.x, '주석 X'), y: number(a.y, '주석 Y'), text: a.text };
        });
      }
    } else if (child.tagName === 'outline') {
      if (outline) fail(`${name}: outline 중복`); outline = true; attributes(child, []);
      for (const contour of child.children) {
        if (contour.tagName !== 'contour') fail(`${name}: ${contour.tagName}은 아직 지원하지 않습니다.`);
        attributes(contour, ['identifier']);
        const id = identifier(contour);
        const points = [...contour.children].map(p => {
          if (p.tagName !== 'point' || p.children.length) fail(`${name}: 잘못된 point`);
          attributes(p, ['x', 'y', 'type', 'identifier', 'smooth']);
          const type = p.getAttribute('type') ?? 'offcurve';
          const smooth = p.getAttribute('smooth');
          if (smooth !== null && !['yes', 'no'].includes(smooth)) fail(`${name}: 잘못된 smooth 속성`);
          if (!['move', 'line', 'curve', 'offcurve'].includes(type)) fail(`${name}: ${type} 곡선은 아직 지원하지 않습니다.`);
          if (type === 'offcurve' && p.hasAttribute('identifier')) fail(`${name}: 제어점 식별자 보존은 아직 지원하지 않습니다.`);
          return { x: number(p.getAttribute('x'), 'point x'), y: number(p.getAttribute('y'), 'point y'), type, ...(smooth === 'yes' ? { smooth: true } : {}), id: type === 'offcurve' ? '' : identifier(p) };
        });
        const start = points.findIndex(p => p.type !== 'offcurve');
        if (start < 0) fail(`${name}: on-curve 점 없는 컨투어는 지원하지 않습니다.`);
        const ordered = [...points.slice(start), ...points.slice(0, start)];
        const closed = ordered[0].type !== 'move';
        if (ordered.some((p, i) => p.type === 'move' && (closed || i !== 0)) || (!closed && start !== 0)) fail(`${name}: move 위치 오류`);
        const on = ordered.map((p, i) => ({ ...p, index: i })).filter(p => p.type !== 'offcurve');
        const nodes: Node[] = on.map(p => ({ id: p.id, x: p.x, y: p.y, ...(p.smooth ? { smooth: true } : {}) }));
        if (!closed && ordered.at(-1)?.type === 'offcurve') fail(`${name}: 열린 경로 끝의 제어점은 지원하지 않습니다.`);
        for (let i = closed ? 0 : 1; i < on.length; i++) {
          const prev = (i + on.length - 1) % on.length;
          const controls = i === 0 ? ordered.slice(on[prev].index + 1) : ordered.slice(on[prev].index + 1, on[i].index);
          if (on[i].type === 'line' && controls.length) fail(`${name}: 직선 앞에 제어점이 있습니다.`);
          if (on[i].type === 'curve' && controls.length === 1) fail(`${name}: 2차 곡선은 아직 지원하지 않습니다.`);
          if (controls.length > 2) fail(`${name}: 3차 곡선의 제어점 개수 오류`);
          if (controls.length === 2) {
            nodes[prev].outgoing = { x: controls[0].x, y: controls[0].y };
            nodes[i].incoming = { x: controls[1].x, y: controls[1].y };
          }
        }
        glyph.contours.push({ id, closed, nodes });
      }
    } else fail(`${name}: ${child.tagName} 데이터는 아직 지원하지 않습니다. 원본을 유지합니다.`);
  }
  return glyph;
}

export async function exportUFO(project: Project): Promise<Uint8Array> {
  project = roundProject(structuredClone(project));
  const files: Record<string, Uint8Array> = {};
  const root = 'FontDraft.ufo/';
  const put = (path: string, text: string) => { files[root + path] = strToU8(text); };
  put('metainfo.plist', plist({ creator: 'org.fontdraft', formatVersion: 3 }));
  put('fontinfo.plist', plist({ familyName: project.name, styleName: project.style, unitsPerEm: project.upm, ascender: project.ascender, descender: project.descender, xHeight: project.xHeight, capHeight: project.capHeight }));
  const advanced = !!project.masters?.length || project.glyphs.some(g => g.mask) || !!project.defaultMasterName;
  const layers: string[][] = [['public.default', 'glyphs']];
  const writeLayer = (directory: string, masterId: string, mask = false) => {
    const contents: Dict = Object.create(null);
    project.glyphs.forEach((g, i) => {
      const data = drawing(project, g, masterId), layer = mask ? data.mask ?? { contours: [] } : data;
      const file = `glyph${i.toString().padStart(5, '0')}.glif`; contents[g.name] = file;
      put(`${directory}/${file}`, glyphXML({ ...g, width: data.width, contours: layer.contours, annotations: layer.annotations }));
    });
    put(`${directory}/contents.plist`, plist(contents));
  };
  writeLayer('glyphs', defaultMaster);
  const records = (project.masters ?? []).map((m, i) => {
    const foreground = `org.fontdraft.master${i + 1}`, background = `${foreground}.background`;
    layers.push([foreground, `glyphs.master${i + 1}`], [background, `glyphs.master${i + 1}.mask`]);
    writeLayer(`glyphs.master${i + 1}`, m.id); writeLayer(`glyphs.master${i + 1}.mask`, m.id, true);
    return { id: m.id, name: m.name, foreground, background, ascender: m.ascender, descender: m.descender, xHeight: m.xHeight, capHeight: m.capHeight };
  });
  if (advanced) { layers.push(['public.background', 'glyphs.background']); writeLayer('glyphs.background', defaultMaster, true); }
  put('layercontents.plist', plist(layers));
  put('lib.plist', plist({ [versionKey]: advanced ? 2 : 1, 'public.glyphOrder': project.glyphs.map(g => g.name), ...(advanced ? { [mastersKey]: { defaultName: project.defaultMasterName ?? project.style, active: project.activeMaster ?? defaultMaster, editMask: !!project.editMask, maskVisible: project.maskVisible !== false, visibleMasters: project.visibleMasters ?? [], masters: records } } : {}) }));
  return new Promise((resolve, reject) => zip(files, { level: 6 }, (error, data) => error ? reject(error) : resolve(data)));
}

export async function importUFO(data: Uint8Array): Promise<Project> {
  if (data.byteLength > 32 * 1024 * 1024) fail('시제품은 32MB 이하의 UFOZ만 불러올 수 있습니다.');
  let total = 0, count = 0, oversized = false;
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(data, { filter: info => {
    total += info.originalSize; count++;
    if (total > 64 * 1024 * 1024 || info.originalSize > 8 * 1024 * 1024 || count > 10000) { oversized = true; return false; }
    return true;
  } }, (error, result) => error ? reject(error) : resolve(result)));
  if (oversized) fail('압축 해제 크기가 시제품 한도를 초과했습니다.');
  const paths = Object.keys(files).filter(p => !p.endsWith('/'));
  if (paths.some(p => p.split('/').some(part => !part || part === '.' || part === '..') || p.includes('\\'))) fail('UFOZ 경로가 올바르지 않습니다.');
  const roots = paths.filter(p => /^[^/]+\/metainfo\.plist$/.test(p));
  if (roots.length !== 1) fail('하나의 루트 폴더를 가진 UFOZ가 필요합니다.');
  const root = roots[0].slice(0, -'metainfo.plist'.length);
  const read = (path: string) => { if (!files[root + path]) fail(`필수 파일 누락: ${path}`); return strFromU8(files[root + path]); };
  const meta = dict(readPlist(read('metainfo.plist'))); allowedKeys(meta, ['creator', 'formatVersion', 'formatVersionMinor'], 'metainfo');
  if (meta.formatVersion !== 3 || (meta.formatVersionMinor ?? 0) !== 0) fail('UFO 3.0만 지원합니다.');
  const layers = readPlist(read('layercontents.plist'));
  if (!Array.isArray(layers) || !layers.length) fail('잘못된 레이어 목록입니다.');
  const layerMap = new Map<string, string>(), directories = new Set<string>();
  for (const entry of layers) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !entry[0] || /[\x00-\x1f\x7f]/.test(entry[0]) || typeof entry[1] !== 'string' || !/^glyphs(?:\.[^/\\]+)?$/.test(entry[1]) || layerMap.has(entry[0]) || directories.has(entry[1].toLowerCase())) fail('잘못되거나 중복된 레이어입니다.');
    layerMap.set(entry[0], entry[1]); directories.add(entry[1].toLowerCase());
  }
  if (layerMap.get('public.default') !== 'glyphs') fail('public.default 기본 레이어가 필요합니다.');
  const info = dict(readPlist(read('fontinfo.plist')));
  allowedKeys(info, ['familyName', 'styleName', 'unitsPerEm', 'ascender', 'descender', 'xHeight', 'capHeight'], 'fontinfo');
  const contents = dict(readPlist(read('glyphs/contents.plist')));
  const lib = files[root + 'lib.plist'] ? dict(readPlist(read('lib.plist'))) : {};
  allowedKeys(lib, [versionKey, 'public.glyphOrder', mastersKey], 'lib');
  if (lib[versionKey] !== undefined && ![1, 2].includes(lib[versionKey] as number)) fail('지원하지 않는 FontDraft 저장 버전입니다.');
  const supported = new Set([root + 'metainfo.plist', root + 'fontinfo.plist', root + 'layercontents.plist', root + 'lib.plist', root + 'glyphs/contents.plist']);
  const fileNames = new Set<string>();
  const glyphs = Object.entries(contents).map(([name, file]) => {
    if (!name || /[\x00-\x1f\x7f]/.test(name) || typeof file !== 'string' || !/^[^/\\]+\.glif$/i.test(file) || fileNames.has(file.toLowerCase())) fail('잘못된 글리프 이름 또는 파일 매핑입니다.');
    fileNames.add(file.toLowerCase()); supported.add(root + 'glyphs/' + file);
    return readGlyph(read('glyphs/' + file), name);
  });
  const order = lib['public.glyphOrder'];
  if (order !== undefined) {
    if (!Array.isArray(order) || order.some(n => typeof n !== 'string') || new Set(order).size !== order.length) fail('잘못된 글리프 순서입니다.');
    glyphs.sort((a, b) => { const x = order.indexOf(a.name), y = order.indexOf(b.name); return (x < 0 ? Infinity : x) - (y < 0 ? Infinity : y); });
  }
  if (!glyphs.length) fail('최소 한 개의 글리프가 필요합니다.');
  const project: Project = { id: newId(), name: textValue(info.familyName, 'Untitled'), style: textValue(info.styleName, 'Regular'), upm: number(info.unitsPerEm ?? 1000, 'UPM'), ascender: number(info.ascender ?? 800, 'Ascender'), descender: number(info.descender ?? -200, 'Descender'), xHeight: number(info.xHeight ?? 500, 'x-height'), capHeight: number(info.capHeight ?? 700, 'cap-height'), glyphs, activeGlyph: glyphs[0].id };
  if (project.upm <= 0 || project.ascender <= project.descender) fail('글자 기준선 값이 올바르지 않습니다.');
  const usedLayers = new Set(['public.default']);
  const readLayer = (name: string, mask: boolean, masterId = defaultMaster) => {
    const directory = layerMap.get(name); if (!directory || usedLayers.has(name)) fail('누락되거나 중복된 마스터 레이어입니다.');
    usedLayers.add(name); supported.add(root + directory + '/contents.plist');
    const mapping = dict(readPlist(read(directory + '/contents.plist'))), seen = new Set<string>();
    for (const [glyphName, file] of Object.entries(mapping)) {
      const glyph = glyphs.find(g => g.name === glyphName);
      if (!glyph || typeof file !== 'string' || !/^[^/\\]+\.glif$/i.test(file) || seen.has(file.toLowerCase())) fail('지원하지 않는 레이어 글리프 매핑입니다.');
      seen.add(file.toLowerCase()); supported.add(root + directory + '/' + file);
      const data = readGlyph(read(directory + '/' + file), glyphName);
      if (data.unicodes.length && JSON.stringify(data.unicodes) !== JSON.stringify(glyph.unicodes)) fail('레이어별 Unicode 차이는 지원하지 않습니다.');
      const target = drawing(project, glyph, masterId);
      if (mask) {
        if (data.width !== 0 && data.width !== target.width) fail('Mask의 별도 자폭은 지원하지 않습니다.');
        target.mask = { contours: data.contours, annotations: data.annotations };
      } else { target.width = data.width; target.contours = data.contours; target.annotations = data.annotations; }
    }
    if (!mask && Object.keys(mapping).length !== glyphs.length) fail('마스터의 글리프가 누락되었습니다.');
  };
  if (lib[mastersKey] !== undefined) {
    if (lib[versionKey] !== 2) fail('마스터 메타데이터 버전 오류입니다.');
    const data = dict(lib[mastersKey]); allowedKeys(data, ['defaultName', 'active', 'editMask', 'maskVisible', 'visibleMasters', 'masters'], '마스터');
    if (!Array.isArray(data.masters) || typeof data.active !== 'string' || typeof data.editMask !== 'boolean' || typeof data.maskVisible !== 'boolean') fail('잘못된 마스터 설정입니다.');
    project.defaultMasterName = textValue(data.defaultName, project.style);
    project.editMask = data.editMask; project.maskVisible = data.maskVisible; project.activeMaster = data.active;
    project.masters = [];
    const ids = new Set([defaultMaster]), names = new Set([project.defaultMasterName]);
    for (const value of data.masters) {
      const m = dict(value); allowedKeys(m, ['id', 'name', 'foreground', 'background', 'ascender', 'descender', 'xHeight', 'capHeight'], '마스터');
      const name = textValue(m.name, 'Master');
      if (typeof m.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(m.id) || ids.has(m.id) || names.has(name) || typeof m.foreground !== 'string' || typeof m.background !== 'string') fail('중복되거나 잘못된 마스터입니다.');
      ids.add(m.id); names.add(name);
      const master = { id: m.id, name, ascender: number(m.ascender, 'Ascender'), descender: number(m.descender, 'Descender'), xHeight: number(m.xHeight, 'x-height'), capHeight: number(m.capHeight, 'cap-height'), glyphs: {} };
      if (master.ascender <= master.descender) fail('마스터 기준선 오류입니다.');
      project.masters.push(master); readLayer(m.foreground, false, master.id); readLayer(m.background, true, master.id);
    }
    if (data.visibleMasters !== undefined) {
      if (!Array.isArray(data.visibleMasters) || data.visibleMasters.some(id => typeof id !== 'string' || !ids.has(id))) fail('잘못된 마스터 표시 설정입니다.');
      project.visibleMasters = data.visibleMasters as string[];
    }
    if (!ids.has(project.activeMaster!)) fail('편집 마스터가 없습니다.');
  } else if (lib[versionKey] === 2) fail('마스터 메타데이터가 누락되었습니다.');
  if (layerMap.has('public.background')) readLayer('public.background', true);
  if ([...layerMap.keys()].some(name => !usedLayers.has(name))) fail('지원하지 않는 레이어가 있어 원본 보존을 위해 열기를 중단했습니다.');
  const unknown = paths.filter(p => !supported.has(p));
  if (unknown.length) fail(`미지원 파일: ${unknown.slice(0, 4).join(', ')}. 원본 보존을 위해 열기를 중단했습니다.`);
  return roundProject(project);
}
