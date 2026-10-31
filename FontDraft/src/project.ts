import { sample, roundNodes } from './model';
import type { Contour } from './model';
import { newId } from './geometry';

export type Annotation = { id: string; x: number; y: number; text: string };
export type Layer = { contours: Contour[]; annotations?: Annotation[] };
export type Drawing = Layer & { width: number; mask?: Layer };
export type Metrics = { ascender: number; descender: number; xHeight: number; capHeight: number };
export type Master = Metrics & { id: string; name: string; glyphs: Record<string, Drawing> };
export type Glyph = Drawing & { id: string; name: string; unicodes: number[] };
export type Project = { id: string; name: string; style: string; upm: number; ascender: number; descender: number; xHeight: number; capHeight: number; glyphs: Glyph[]; activeGlyph: string; masters?: Master[]; activeMaster?: string; defaultMasterName?: string; editMask?: boolean; maskVisible?: boolean; visibleMasters?: string[] };
export function createGlyph(name: string, unicodes: number[] = []): Glyph { return { id: newId(), name, unicodes, width: 600, contours: [] }; }
export function createProject(name = 'Unititled', demo = false): Project {
  const glyph = createGlyph(demo ? 'o' : 'A', [demo ? 0x6f : 0x41]);
  if (demo) { glyph.contours = sample(); roundNodes(glyph.contours); }
  return { id: newId(), name, style: 'Regular', upm: demo ? 600 : 1000, ascender: demo ? 600 : 800, descender: demo ? 0 : -200, xHeight: demo ? 300 : 500, capHeight: demo ? 600 : 750, glyphs: [glyph], activeGlyph: glyph.id };
}

export function roundProject(project: Project): Project {
  for (const key of ['ascender', 'descender', 'xHeight', 'capHeight'] as const) project[key] = Math.round(project[key]);
  for (const master of project.masters ?? []) {
    for (const key of ['ascender', 'descender', 'xHeight', 'capHeight'] as const) master[key] = Math.round(master[key]);
  }
  for (const glyph of project.glyphs) for (const data of [glyph, ...(project.masters ?? []).map(m => drawing(project, glyph, m.id))]) {
    data.width = Math.round(data.width);
    for (const layer of [data, ...(data.mask ? [data.mask] : [])]) {
      roundNodes(layer.contours);
      for (const note of layer.annotations ?? []) { note.x = Math.round(note.x); note.y = Math.round(note.y); }
    }
  }
  if (project.activeMaster && project.activeMaster !== defaultMaster && !project.masters?.some(m => m.id === project.activeMaster)) project.activeMaster = defaultMaster;
  return project;
}

export const defaultMaster = 'default';
export function masterMetrics(project: Project): Metrics {
  return project.masters?.find(m => m.id === project.activeMaster) ?? project;
}
export function drawing(project: Project, glyph: Glyph, masterId = project.activeMaster): Drawing {
  const master = project.masters?.find(m => m.id === masterId);
  if (!master) return glyph;
  return master.glyphs[glyph.id] ??= { width: glyph.width, contours: [] };
}
export function editLayer(project: Project, glyph: Glyph): Layer {
  const data = drawing(project, glyph);
  return project.editMask ? data.mask ??= { contours: [] } : data;
}
export function masterList(project: Project) {
  return [{ id: defaultMaster, name: project.defaultMasterName ?? project.style }, ...(project.masters ?? []).map(m => ({ id: m.id, name: m.name }))];
}
export function addMaster(project: Project, name: string, duplicate: boolean): Master {
  project.defaultMasterName ??= project.style;
  const metrics = masterMetrics(project), glyphs: Record<string, Drawing> = {};
  for (const glyph of project.glyphs) {
    const source = drawing(project, glyph);
    glyphs[glyph.id] = duplicate ? structuredClone(source) : { width: source.width, contours: [] };
  }
  const master: Master = { id: newId(), name, ascender: metrics.ascender, descender: metrics.descender, xHeight: metrics.xHeight, capHeight: metrics.capHeight, glyphs };
  (project.masters ??= []).push(master); project.activeMaster = master.id; return master;
}
export function deleteMaster(project: Project, id: string) {
  if (!project.masters?.length) return;
  if (id === defaultMaster) {
    const next = project.masters.shift()!;
    project.visibleMasters = project.visibleMasters?.filter(key => key !== defaultMaster).map(key => key === next.id ? defaultMaster : key);
    for (const glyph of project.glyphs) {
      const data = next.glyphs[glyph.id] ?? { width: glyph.width, contours: [] };
      glyph.width = data.width; glyph.contours = data.contours; glyph.annotations = data.annotations; glyph.mask = data.mask;
    }
    for (const key of ['ascender', 'descender', 'xHeight', 'capHeight'] as const) project[key] = next[key];
    project.defaultMasterName = next.name;
  } else project.masters = project.masters.filter(m => m.id !== id);
  project.visibleMasters = project.visibleMasters?.filter(key => key !== id || id === defaultMaster);
  project.activeMaster = defaultMaster;
}

let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  return connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('fontdraft', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('projects', { keyPath: 'id' }); request.result.createObjectStore('settings'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadWorkspace(): Promise<{ projects: Project[]; last?: string }> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'settings'], 'readonly');
    const projects = tx.objectStore('projects').getAll(), last = tx.objectStore('settings').get('last');
    tx.oncomplete = () => resolve({ projects: (projects.result as Project[]).map(roundProject), last: last.result });
    tx.onerror = () => reject(tx.error);
  });
}
export async function saveDraft(project: Project): Promise<void> {
  const snapshot = roundProject(structuredClone(project));
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'settings'], 'readwrite');
    tx.objectStore('projects').put(snapshot); tx.objectStore('settings').put(snapshot.id, 'last');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('자동 저장 취소'));
  });
}
