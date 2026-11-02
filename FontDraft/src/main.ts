import './style.css';
import { projectBackup, readBackup } from './backup';
import { freshContours, copyContours, duplicateNodes, joinNodes, loopCorner } from './contour-commands';
import { GeometryClient } from './geometry-client';
import type { GeometryResult } from './geometry-worker';
import { textImage, pngImage } from './image-export';
import { lineToCurve, reverseContour, contourStartDirection, distance, glyphPoint, hitTest, pathData, screenPoint, translate, transformSelection, toggleSmooth, moveHandle, roundNodes, moveOnAxis } from './model';
import type { Contour, Hit, Point, View, Transform } from './model';
import { addExtrema, makeOverlap, strokePreviewPath, newId, shape, tipTransform, knife, knifeIntersections, breakAtNode, combine, segmentHit, outlineBounds, deleteSelection, insertNode, removeNodePreservingCurve } from './geometry';
import type { Tip, StrokePoint } from './geometry';
import { createProject, createGlyph, loadWorkspace, saveDraft, deleteDraft, saveImportedProjects, roundProject, drawing, editLayer, masterMetrics, masterList, addMaster, deleteMaster, defaultMaster } from './project';
import type { Project, Annotation, Glyph, Layer } from './project';
import { exportUFO, importUFO, escapeXML } from './ufo';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header><a class="brand" href="./">FontDraft</a>
    <label class="finger-option"><input id="finger-tools" type="checkbox" />손가락으로 도구 사용</label><div class="document-name"><button id="project-menu" aria-label="프로젝트 관리">글리프 스케치</button><span id="save-status" role="status">불러오는 중</span></div><button id="preview-mode" aria-label="미리보기" aria-pressed="false" title="미리보기 (P)">미리보기</button><button id="save-file">UFOZ 저장</button>
  </header>
  <nav id="app-menus" aria-label="앱 메뉴"></nav>
  <div id="menu-commands" hidden>
    <button id="reverse-contours">방향 반전</button><button id="copy-to-mask">전경을 배경으로 복사</button><button id="copy-to-foreground">배경 붙여넣기</button><button id="master-metrics">기준선</button>
  </div>
  <main>
    <aside class="glyphs"><span class="section-label">글리프</span><button id="add-glyph" aria-label="글리프 추가">+</button><div id="glyph-list"></div></aside>
    <div class="editor-column"><section class="workspace" aria-label="글리프 편집기">
      <label class="text-run-bar"><span>문자열</span><input id="text-run" aria-label="편집 문자열" placeholder="편집할 문자열" maxlength="200" /></label><button id="mobile-add-glyph" aria-label="글리프 추가">+</button><div id="annotation-notes"></div><svg id="canvas" role="application" aria-label="글리프 캔버스" tabindex="0"><g id="guides"></g><g id="drawing"></g><g id="preview"></g><g id="controls"></g><g id="annotations"></g><g id="brush-cursor"></g><rect id="marquee" hidden /></svg>
      <div class="toolbar"><button id="select-tool" class="active" title="선택" aria-label="선택" aria-pressed="true">↖</button><button id="pen-tool" title="펜" aria-label="펜" aria-pressed="false">♢</button><button id="brush-tool" title="브러시" aria-label="브러시" aria-pressed="false">●</button><button id="eraser-tool" title="지우개" aria-label="지우개" aria-pressed="false">▱</button><button id="rectangle-tool" title="사각형" aria-label="사각형" aria-pressed="false">□</button><button id="ellipse-tool" title="타원" aria-label="타원" aria-pressed="false">○</button><button id="knife-tool" title="나이프" aria-label="나이프" aria-pressed="false">╱</button><button id="overlap-tool" title="오버랩" aria-label="오버랩" aria-pressed="false">⋈</button><button id="annotation-tool" title="주석" aria-label="주석" aria-pressed="false">✎</button><button id="pan-tool" title="화면 이동" aria-label="화면 이동" aria-pressed="false">✥</button><span></span><button id="undo" title="실행 취소" aria-label="실행 취소">↶</button><button id="redo" title="다시 실행" aria-label="다시 실행">↷</button></div>
      <button id="finish-pen" hidden>열린 경로 완료</button>
      <button id="modifier" aria-label="Shift modifier" aria-pressed="false"><span>⇧</span><small>Shift</small></button><button id="option-modifier" aria-label="Opt modifier" aria-pressed="false"><span>⌥</span><small>Opt</small></button>
    </section>
    <section id="proof-panel" aria-label="실시간 미리보기 패널">
      <div id="proof-resize" role="separator" aria-label="미리보기 패널 높이" aria-orientation="horizontal" aria-valuemin="120" aria-valuemax="400" aria-valuenow="200" tabindex="0"></div>
      <div class="proof-heading"><button id="proof-toggle" aria-label="미리보기 패널 표시/숨기기" title="표시/숨기기" aria-expanded="true" aria-controls="proof-viewport">◉</button><button id="proof-invert" aria-label="미리보기 반전" title="반전" aria-pressed="false">◐</button></div>
      <div id="proof-viewport"><svg id="proof-canvas" role="img" aria-label="현재 글리프 실시간 미리보기"><path id="proof-fill" fill="#000" fill-rule="nonzero"/></svg></div>
    </section></div>
    <aside class="inspector" aria-label="편집 팔레트"><section class="inspector-panel" aria-labelledby="glyph-panel-title"><h2 id="glyph-panel-title">글리프</h2><form id="glyph-properties"><label>이름<input name="name" aria-label="글리프 이름" required maxlength="120" /></label><label>U+<input name="unicodes" aria-label="글리프 Unicode" placeholder="0041" /></label><div class="glyph-width-row" id="glyph-metrics"><label>LSB<input name="lsb" aria-label="LSB" type="number" step="any" /></label><label>ADV<input name="width" aria-label="글리프 폭" type="number" step="any" required /></label><label>RSB<input name="rsb" aria-label="RSB" type="number" step="any" /></label></div><p id="glyph-properties-error" role="alert"></p></form></section><section id="node-panel" class="inspector-panel" aria-labelledby="node-panel-title"><h2 id="node-panel-title">노드</h2><p id="selection-title">선택 없음</p><form id="coordinates" hidden><label>X<input id="node-x" type="number" step="any" required aria-label="노드 X" /></label><label>Y<input id="node-y" type="number" step="any" required aria-label="노드 Y" /></label></form><div class="nudge" aria-label="미세 이동"><button data-nudge="0,1" aria-label="위로 1 이동">↑</button><button data-nudge="-1,0" aria-label="왼쪽으로 1 이동">←</button><button data-nudge="0,-1" aria-label="아래로 1 이동">↓</button><button data-nudge="1,0" aria-label="오른쪽으로 1 이동">→</button></div><button id="delete-selection" type="button">Delete</button></section>
      <section class="inspector-panel" id="tip-controls" hidden aria-labelledby="tip-title"><h2 id="tip-title">브러시</h2><svg id="tip-preview" viewBox="-60 -60 120 120" aria-label="펜촉 모양"><ellipse id="tip-ellipse" cx="0" cy="0"/><g id="tip-ratio-handle" data-tip-drag="ratio" role="slider" tabindex="0" aria-label="펜촉 납작함" aria-valuemin="5" aria-valuemax="100"><circle r="14" fill="transparent"/><circle r="4" class="tip-grip"/></g><g id="tip-angle-handle" data-tip-drag="angle" role="slider" tabindex="0" aria-label="펜촉 각도" aria-valuemin="-180" aria-valuemax="180"><circle r="14" fill="transparent"/><path d="M-5-4 5 0-5 4Z" class="tip-grip"/></g><g id="tip-axes"><path id="tip-axis-lines"/><text id="angle-value"/><text id="ratio-value"/></g></svg><label class="tip-size-row">크기<input id="tip-size" type="number" min="2" max="1000" step="1" aria-label="펜촉 크기" /><input id="tip-size-slider" type="range" min="2" max="1000" step="1" aria-label="펜촉 크기 슬라이더" /></label><label class="pressure-option"><input id="tip-pressure" type="checkbox" />필압</label><label>단순화 <output id="simplify-value"></output><input id="tip-simplify" type="range" min="0" max="12" step="0.5" value="3" aria-label="윤곽선 단순화" /></label></section>
      <section id="transform-panel" class="inspector-panel" aria-labelledby="transform-panel-title"><h2 id="transform-panel-title">변형</h2><fieldset id="transform-controls" hidden><legend class="sr-only">선택 변형</legend>
        <div class="transform-top"><div id="transform-origin" role="group" aria-label="변형 기준점">${['왼쪽 위','위 중앙','오른쪽 위','왼쪽 중앙','중앙','오른쪽 중앙','왼쪽 아래','아래 중앙','오른쪽 아래'].map((name, i) => `<button type="button" data-pivot="${i}" aria-label="기준점 ${name}" aria-pressed="${i === 4}" title="${name}"><span></span></button>`).join('')}</div><div class="flip-controls"><button id="flip-horizontal" aria-label="가로 반전" title="가로 반전"></button><button id="flip-vertical" aria-label="세로 반전" title="세로 반전"></button></div></div>
        <div class="transform-input-wrapper" title="가로 배율"><span class="transform-input-axis" aria-hidden="true">↔</span><input id="scale-x" type="number" value="100" min="1" max="1000" step="any" required aria-label="가로 배율" /><span class="transform-input-unit" aria-hidden="true">%</span></div>
        <div class="transform-input-wrapper" title="세로 배율"><span class="transform-input-axis" aria-hidden="true">↕</span><input id="scale-y" type="number" value="100" min="1" max="1000" step="any" required aria-label="세로 배율" /><span class="transform-input-unit" aria-hidden="true">%</span></div>
        <label class="ratio-lock"><input id="scale-lock" type="checkbox" checked />비율 잠금</label><button id="apply-scale">크기 적용</button>
        <div class="direction-transform"><button id="rotate-left" aria-label="왼쪽 회전" title="왼쪽 회전"></button><div class="transform-input-wrapper"><input id="rotate-angle" type="number" value="15" min="0" max="360" step="any" required aria-label="회전 각도" /><span class="transform-input-unit" aria-hidden="true">°</span></div><button id="rotate-right" aria-label="오른쪽 회전" title="오른쪽 회전"></button></div>
        <div class="direction-transform"><button id="slant-left" aria-label="왼쪽 기울이기" title="왼쪽 기울이기">←</button><div class="transform-input-wrapper"><input id="slant-angle" type="number" value="10" min="0" max="80" step="any" required aria-label="가로 기울기 각도" /><span class="transform-input-unit" aria-hidden="true">°</span></div><button id="slant-right" aria-label="오른쪽 기울이기" title="오른쪽 기울이기">→</button></div>
        <div class="direction-transform"><button id="slant-down" aria-label="아래로 기울이기" title="아래로 기울이기">↓</button><div class="transform-input-wrapper"><input id="slant-y-angle" type="number" value="10" min="0" max="80" step="any" required aria-label="세로 기울기 각도" /><span class="transform-input-unit" aria-hidden="true">°</span></div><button id="slant-up" aria-label="위로 기울이기" title="위로 기울이기">↑</button></div>
        <div id="align-controls" role="group" aria-label="정렬">${['왼쪽 정렬', '가로 중앙 정렬', '오른쪽 정렬', '위로 정렬', '세로 중앙 정렬', '아래로 정렬'].map((label, i) => `<button type="button" data-align="${i}" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><g transform="${i >= 3 ? 'rotate(90 12 12)' : ''}"><path d="M${[4,12,20][i % 3]} 2v20"/><rect x="${[5,8,11][i % 3]}" y="5" width="8" height="5"/><rect x="${[5,6,7][i % 3]}" y="14" width="12" height="5"/></g></svg></button>`).join('')}</div>
        <div id="boolean-controls" role="group" aria-label="면 연산"><button id="unite-selection" aria-label="면 합치기" title="면 합치기"></button><button id="subtract-selection" aria-label="면 빼기" title="면 빼기"></button></div>
      </fieldset></section>
      <section id="masters-panel" class="inspector-panel" aria-labelledby="masters-title"><h2 id="masters-title">마스터</h2>
        <div id="master-list" role="group" aria-label="마스터 목록"></div>
        <div class="master-actions"><button id="master-add" aria-label="빈 마스터 추가" title="빈 마스터 추가"></button><button id="master-duplicate" aria-label="마스터 복제" title="마스터 복제"></button><button id="master-delete" aria-label="마스터 삭제" title="마스터 삭제"></button></div>
        <p id="master-error" role="alert"></p>
      </section>
    </aside>
  </main><div id="status" role="status" hidden></div>`;

const $ = <T extends Element>(id: string) => document.getElementById(id)! as unknown as T;
const workspace = document.querySelector<HTMLElement>('.workspace')!;
const chrome = document.createElement('div'); chrome.className = 'editor-chrome';
chrome.append(document.querySelector('.text-run-bar')!, $('mobile-add-glyph'));
document.querySelector('header')!.insertBefore(document.querySelector('.toolbar')!, $('preview-mode'));
const surface = document.createElement('div'); surface.className = 'canvas-surface';
surface.append($('canvas'), $('annotation-notes'), $('finish-pen'));
workspace.prepend(chrome, surface);
chrome.append(document.querySelector('.finger-option')!);

const canvas = $<SVGSVGElement>('canvas');
let project = createProject('Unititled');
let projects: Project[] = [project];
const activeGlyph = () => project.glyphs.find(g => g.id === project.activeGlyph)!;
const currentDrawing = () => drawing(project, activeGlyph());
const currentLayer = () => editLayer(project, activeGlyph());
const metrics = () => masterMetrics(project);
const historyKey = () => `${project.id}:${project.activeMaster ?? defaultMaster}:${project.activeGlyph}:${project.editMask ? 'mask' : 'foreground'}`;
const foreground = (glyph: Glyph) => glyph.id === project.activeGlyph && !project.editMask ? contours : drawing(project, glyph).contours;
let contours = currentLayer().contours;
let selected = new Set<string>();
let selectedSegments = new Set<string>(), selectedHandles = new Set<string>();
let cursor: Point | null = null;
let pivotIndex = 4;
let view: View = { x: 0, y: 0, scale: 1 };
const tools = ['select', 'pen', 'brush', 'eraser', 'rectangle', 'ellipse', 'knife', 'overlap', 'annotation', 'pan'] as const;
type Tool = typeof tools[number];
let tool: Tool = 'select';
let previewMode = false, freeTransform = false;
let editText = '', activeSlot = 0;
let slotTap: { index: number; time: number } | null = null;
const tips: Record<'brush' | 'eraser', Tip> = { brush: { size: 50, ratio: 0.45, angle: 35, simplify: 3, pressure: true }, eraser: { size: 50, ratio: 1, angle: 0, simplify: 3 } };
let penDraft: Contour | null = null;
let message = '';
let masterPanelMarkup = '';
let keyModifier = false, modifierLocked = false, keyOption = false, optionLocked = false;
const modifierPointers = new Map<number, { x: number; y: number; time: number; used: boolean }>();
const optionPointers = new Map<number, { x: number; y: number; time: number; used: boolean }>();
const option = () => keyOption || optionLocked || optionPointers.size > 0;
const modifier = () => keyModifier || modifierLocked || modifierPointers.size > 0;
type Snapshot = { contours: Contour[]; annotations: Annotation[]; width: number; other?: Layer; otherExpected?: string };
let undo: Snapshot[] = [], redo: Snapshot[] = [];
const histories = new Map<string, { undo: Snapshot[]; redo: Snapshot[] }>();
const annotations = () => currentLayer().annotations ?? [];
const snapshot = (): Snapshot => structuredClone({ contours, annotations: annotations(), width: currentDrawing().width });
let cancelAnnotationDrag: (() => void) | null = null;
const touches = new Map<number, Point>();
let touchTap: { time: number; starts: Map<number, Point>; count: number; valid: boolean; view: View } | null = null;
let penId: number | null = null;
let pinch: { center: Point; distance: number; view: View } | null = null;
let lastTap: { id: string; time: number; point: Point; selection: Set<string> } | null = null;
type Gesture = { id: number; start: Point; before: Contour[]; selection: Set<string>; segments?: Set<string>; handles?: Set<string>; view: View; hit: Hit | null; constrained?: boolean; penEdit?: Hit; additive: boolean; moved: boolean; kind: 'edit' | 'pan' | 'box' | 'draw' | 'glyph' | 'free'; free?: { index: number; pivot: Point; start: Point };  slot?: number; drawTool?: Tool; points?: StrokePoint[]; tip?: Tip; preview?: Contour[]; penBefore?: Contour | null; closePen?: boolean; end?: Point };
let gesture: Gesture | null = null;

function local(event: { clientX: number; clientY: number }): Point {
  const r = canvas.getBoundingClientRect();
  return { x: event.clientX - r.left, y: event.clientY - r.top };
}
const geometryClient = new GeometryClient();
type StrokeJob = { tool: 'brush' | 'eraser'; points: StrokePoint[]; tip: Tip; projectId: string; glyphId: string; context: string; before?: Contour[]; selection?: Set<string>; result?: GeometryResult };
const strokes: StrokeJob[] = [];
let geometryRunning = false, frame = 0;
function strokeSample(e: PointerEvent, v: View): StrokePoint {
  return { ...glyphPoint(local(e), v), ...(e.pointerType === 'pen' ? { pressure: e.pressure } : {}) };
}
function drawPreview(g: { tip?: Tip; points?: StrokePoint[]; drawTool?: string }) {
  if (!g.tip || !g.points) return '';
  const m = tipTransform(g.tip), ink = g.drawTool === 'eraser' ? '#cc755a' : '#8a8a8a';
  return `<g transform="translate(${view.x} ${view.y}) scale(${view.scale} ${-view.scale}) matrix(${m.a} ${m.b} ${m.c} ${m.d} 0 0)" opacity=".65"><path d="${strokePreviewPath(g.points, g.tip)}" fill="${ink}"/></g>`;
}
function processStrokes() {
  if (gesture || !strokes.length) return;
  const job = strokes[0];
  if (job.result) {
    if (job.projectId === project.id && job.glyphId === project.activeGlyph && job.context === historyKey()) {
      const before = job.before!, result = job.result.contours!;
      contours = job.tool === 'brush' ? [...before, ...result] : result;
      clearSelection();
      if (job.tool === 'brush') selected = new Set(result.flatMap(c => c.nodes.map(n => n.id)));
      else if (job.selection!.size) {
        const oldIds = new Set(before.map(c => c.id));
        selected = new Set(contours.flatMap(c => c.nodes.filter(n => !oldIds.has(c.id) || job.selection!.has(n.id)).map(n => n.id)));
      }
      commit(before);
      canvas.dataset.geometryBackend = job.result.backend;
    }
    strokes.shift(); geometryRunning = false; render(); processStrokes(); return;
  }
  if (geometryRunning) return;
  job.before = structuredClone(contours); job.selection = operationSelection(); geometryRunning = true;
  geometryClient.run({ tool: job.tool, points: job.points, tip: job.tip, contours: job.tool === 'eraser' ? job.before : [], selected: [...job.selection] }).then(result => {
    if (strokes[0] !== job) return;
    job.result = result; processStrokes();
  }).catch(error => {
    if (strokes[0] !== job) return;
    strokes.length = 0; geometryRunning = false;
    message = '획 연산을 완료하지 못했습니다. 기존 윤곽선은 유지됩니다.'; console.error(error); render();
  });
}
function cancelStroke(all = false) {
  if (!strokes.length) return;
  if (all || strokes.length === 1) { strokes.length = 0; geometryRunning = false; geometryClient.stop(); }
  else strokes.pop();
  render();
}
function render() {
  if (!gesture && strokes[0]?.result) queueMicrotask(processStrokes);
  const busy = strokes.length > 0;
  $<HTMLElement>('app-menus').inert = busy;
  for (const id of ['flip-horizontal', 'flip-vertical']) $<HTMLButtonElement>(id).disabled = !hasSelection() || !!gesture || !!penDraft || tool !== 'select';
  for (const button of $('align-controls').querySelectorAll<HTMLButtonElement>('button')) button.disabled = !hasSelection() || !!gesture || !!penDraft || tool !== 'select';
  canvas.dataset.geometryPending = String(strokes.length);
  document.querySelector<HTMLElement>('.glyphs')!.inert = busy;
  chrome.inert = busy;
  for (const id of ['project-menu', 'save-file']) $<HTMLButtonElement>(id).disabled = busy;
  for (const name of tools) $<HTMLButtonElement>(`${name}-tool`).disabled = busy && !['brush', 'eraser', 'pan'].includes(name);
  renderMasterPanel();
  renderProof();
  $('app').classList.toggle('preview-mode', previewMode);
  $<HTMLElement>('app').dataset.tool = tool;
  $('sidebar-toggle').setAttribute('aria-pressed', String(!hiddenViews.has('sidebar')));
  $('app').classList.toggle('mask-edit', !!project.editMask);
  $('preview-mode').setAttribute('aria-pressed', String(previewMode));
  $('preview-mode').textContent = '미리보기';
  document.querySelector<HTMLElement>('.inspector')!.inert = busy;
  $<HTMLElement>('editing-keys').inert = busy;
  selected = new Set([...selected].filter(id => contours.some(c => c.nodes.some(n => n.id === id))));
  selectedSegments = new Set([...selectedSegments].filter(id => contours.some(c => c.nodes.some((n, i) => n.id === id && (c.closed || i < c.nodes.length - 1)))));
  selectedHandles = new Set([...selectedHandles].filter(key => contours.some(c => c.nodes.some(n => ['incoming', 'outgoing'].some(part => key === handleKey(n.id, part) && n[part as 'incoming' | 'outgoing'])))));
  const activeVisible = runLayout()[activeSlot]?.glyph?.id === project.activeGlyph;
  const width = canvas.clientWidth;
  const guides = [...new Set([metrics().descender, 0, metrics().xHeight, metrics().capHeight, metrics().ascender])].map(y => {
    const p = screenPoint({ x: 0, y }, view);
    return `<line x1="0" y1="${p.y}" x2="${width}" y2="${p.y}"/><text class="baseline-value" x="8" y="${p.y - 6}">${y}</text>`;
  }).join('');
  const bounds = outlineBounds(contours);
  const metricY = screenPoint({ x: 0, y: metrics().descender }, view).y + 24;
  const left = view.x, right = view.x + currentDrawing().width * view.scale;
  const lsb = bounds?.left ?? 0, rsb = bounds ? currentDrawing().width - bounds.right : 0;
  $('guides').innerHTML = `<g class="baseline-guides">${guides}</g><g class="metric-guides">` + `<line class="sidebearing" x1="${left}" x2="${left}" y1="0" y2="${canvas.clientHeight}"/><line class="sidebearing" x1="${right}" x2="${right}" y1="0" y2="${canvas.clientHeight}"/>` + metricBadge(`${lsb.toFixed(0)}`, left, metricY, 'start') + metricBadge(String(currentDrawing().width), (left + right) / 2, metricY, 'middle') + metricBadge(`${rsb.toFixed(0)}`, right, metricY, 'end') + '</g>';
  const metricForm = $<HTMLFormElement>('glyph-properties');
  for (const [name, value] of [['lsb', lsb], ['width', currentDrawing().width], ['rsb', rsb]] as const) {
    const input = field(metricForm, name); input.disabled = !!project.editMask; if (document.activeElement !== input) input.value = String(Number(value.toFixed(3)));
    input.disabled = !!gesture || (name !== 'width' && !bounds);
  }
  $('drawing').innerHTML = renderNeighbors() + (activeVisible && !previewMode ? masterList(project).filter(m => m.id !== (project.activeMaster ?? defaultMaster) && project.visibleMasters?.includes(m.id)).map(m => `<path class="master-reference" data-reference-master="${escapeXML(m.id)}" fill="none" d="${drawing(project, activeGlyph(), m.id).contours.map(c => pathData(c, view)).join(' ')}"/>`).join('') : '') + (activeVisible && !previewMode ? `<path class="mask-reference" fill="none" d="${(project.editMask ? currentDrawing().contours : project.maskVisible !== false ? currentDrawing().mask?.contours ?? [] : []).map(c => pathData(c, view)).join(' ')}"/>` : '') + `<path class="glyph-fill" fill-rule="nonzero" d="${(activeVisible ? contours : []).filter(c => c.closed).map(c => pathData(c, view)).join(' ')}"/>`;
  const controls: string[] = [], highlighted: string[] = [];
  const selectedNodes = nodeSelection();
  for (const contour of [...contours, ...(penDraft ? [penDraft] : [])]) {
    controls.push(`<path class="outline" data-contour="${escapeXML(contour.id)}" d="${pathData(contour, view)}"/>`);
    for (const node of contour.nodes) {
      const p = screenPoint(node, view), active = selectedNodes.has(node.id) || (contour === penDraft && node === contour.nodes.at(-1));
      for (const part of ['incoming', 'outgoing'] as const) {
        const handle = node[part];
        if (!handle) continue;
        const h = screenPoint(handle, view);
        controls.push(`<line class="handle-line ${selectedHandles.has(handleKey(node.id, part)) ? 'selected' : ''}" x1="${p.x}" y1="${p.y}" x2="${h.x}" y2="${h.y}"/><circle class="handle ${selectedHandles.has(handleKey(node.id, part)) ? 'selected' : ''}" data-handle="${escapeXML(node.id)}-${part}" cx="${h.x}" cy="${h.y}" r="4"/>`);
      }
      const start = node === contour.nodes[0];
      const direction = start ? contourStartDirection(contour) : null;
      const angle = direction ? Math.atan2(-direction.y, direction.x) * 180 / Math.PI : 0;
      const attributes = `class="node ${node.smooth ? 'smooth' : 'corner'} ${active ? 'selected' : ''}" data-node="${escapeXML(node.id)}" data-x="${node.x}" data-y="${node.y}"`;
      (active ? highlighted : controls).push(start
        ? `<path ${attributes} data-start="${escapeXML(node.id)}" transform="rotate(${angle} ${p.x} ${p.y})" d="M${p.x + 6} ${p.y}L${p.x - 6} ${p.y - 6}L${p.x - 6} ${p.y + 6}Z"/>`
        : `<rect ${attributes} x="${node.smooth ? p.x - 6 : p.x - 5}" y="${node.smooth ? p.y - 6 : p.y - 5}" width="${node.smooth ? 12 : 10}" height="${node.smooth ? 12 : 10}" rx="${node.smooth ? 6 : 0}"/>`);
    }
  }
  for (const c of contours) for (let i = 0; i < c.nodes.length - (c.closed ? 0 : 1); i++) {
    if (selectedSegments.has(c.nodes[i].id) || (selectedNodes.has(c.nodes[i].id) && selectedNodes.has(c.nodes[(i + 1) % c.nodes.length].id))) controls.push(`<path class="selected-segment" d="${pathData({ id: '', closed: false, nodes: [c.nodes[i], c.nodes[(i + 1) % c.nodes.length]] }, view)}"/>`);
  }
  $('controls').innerHTML = activeVisible ? controls.join('') + highlighted.join('') : '';
  // Selected handles are raised above coincident unselected controls too.
  for (const el of [...$('controls').querySelectorAll('.handle.selected')]) $('controls').append(el);
  renderCursor();
  renderAnnotations();
  let preview = '';
  if (gesture?.kind === 'draw') {
    const g = gesture;
    if (g.drawTool === 'overlap' && g.hit?.part === 'node') {
      const a = screenPoint(g.hit.node, view), target = g.end ? visibleHit(g.end) : null, b = target?.part === 'node' ? screenPoint(target.node, view) : g.end ?? a;
      preview = `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" fill="none" stroke="#467ba0" stroke-dasharray="4 3"/><circle cx="${a.x}" cy="${a.y}" r="9" fill="none" stroke="#467ba0"/>${target?.part === 'node' ? `<circle cx="${b.x}" cy="${b.y}" r="9" fill="none" stroke="#467ba0"/>` : ''}`;
    } else if (g.drawTool === 'knife' && g.end) {
      const a = glyphPoint(g.start, g.view), b = glyphPoint(g.end, g.view);
      const ink = g.additive ? '#c86e4f' : '#467ba0';
      const dots = knifeIntersections(g.before, g.selection, a, b).map(p => {
        const s = screenPoint(p, view); return `<circle cx="${s.x}" cy="${s.y}" r="4" fill="${ink}"/>`;
      }).join('');
      preview = `<line x1="${g.start.x}" y1="${g.start.y}" x2="${g.end.x}" y2="${g.end.y}" stroke="${ink}" stroke-width="1.5" stroke-dasharray="${g.additive ? 'none' : '4 4'}"/>${dots}`;
    } else if (g.tip && g.points) {
      preview = drawPreview(g);
    } else if (g.preview) preview = `<path d="${g.preview.map(c => pathData(c, view)).join(' ')}" fill="none" stroke="#555" stroke-width="1"/>`;
  }
  $('preview').innerHTML = strokes.map(job => drawPreview({ ...job, drawTool: job.tool })).join('') + preview + (freeTransform ? freeTransformMarkup() : '') + (previewMode && penDraft ? `<path d="${pathData(penDraft, view)}" fill="none" stroke="#555"/>` : '');
  $('selection-title').textContent = [selected.size ? `${selected.size} 노드` : '', selectedSegments.size ? `${selectedSegments.size} 세그먼트` : '', selectedHandles.size ? `${selectedHandles.size} 핸들` : ''].filter(Boolean).join(' · ') || '선택 없음';
  const coordinate = coordinateSelection();
  $('coordinates').toggleAttribute('hidden', !coordinate);
  if (coordinate) for (const axis of ['x', 'y'] as const) { const input = $<HTMLInputElement>(`node-${axis}`); input.setAttribute('aria-label', `${coordinate.part ? '핸들' : '노드'} ${axis.toUpperCase()}`); if (document.activeElement !== input) input.value = String(Number(coordinate.point[axis].toFixed(3))); }
  document.querySelectorAll<HTMLButtonElement>('[data-nudge]').forEach(b => b.disabled = !hasSelection() || !!gesture);
  $<HTMLButtonElement>('delete-selection').disabled = !hasSelection() || !!gesture || !!penDraft;
  $<HTMLButtonElement>('undo').disabled = (!undo.length && !busy) || !!gesture;
  $<HTMLButtonElement>('redo').disabled = !redo.length || !!gesture || busy;
  $('modifier').setAttribute('aria-pressed', String(modifier()));
  $('option-modifier').setAttribute('aria-pressed', String(option()));
  $('option-modifier').querySelector('small')!.textContent = optionLocked ? 'Opt · 고정' : 'Opt';
  const status = busy ? `획 처리 중 · ${strokes.length}` : message;
  $('status').textContent = status; $('status').toggleAttribute('hidden', !status);
  $('knife-tool').setAttribute('data-mode', (gesture?.drawTool === 'knife' ? gesture.additive : modifier()) ? 'split' : 'insert');
  $('modifier').querySelector('small')!.textContent = modifierLocked ? 'Shift · 고정' : 'Shift';
  $<HTMLElement>('transform-panel').hidden = tool !== 'select';
  $<HTMLFieldSetElement>('transform-controls').hidden = tool !== 'select';
  $<HTMLFieldSetElement>('transform-controls').disabled = !hasSelection() || !!gesture;
  const closedSelection = contours.filter(c => c.closed && c.nodes.some(n => operationSelection().has(n.id)));
  $<HTMLButtonElement>('unite-selection').disabled = tool !== 'select' || closedSelection.length < 2 || !!gesture;
  $<HTMLButtonElement>('subtract-selection').disabled = tool !== 'select' || !closedSelection.length || !contours.some(c => c.closed && !closedSelection.includes(c)) || !!gesture;
  canvas.style.cursor = cursor ? 'none' : tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  $<HTMLButtonElement>('finish-pen').hidden = tool !== 'pen' || !penDraft;
  $<HTMLButtonElement>('finish-pen').disabled = !!gesture || (penDraft?.nodes.length ?? 0) < 2;
  const showTip = tool === 'brush' || tool === 'eraser';
  $<HTMLElement>('tip-controls').hidden = !showTip;
  if (showTip) {
    const tip = tips[tool as 'brush' | 'eraser'];
    $<HTMLInputElement>('tip-pressure').checked = !!tip.pressure;
    $('tip-title').querySelector('span')!.textContent = "브러시";
    for (const [key, value] of [['size', tip.size], ['simplify', tip.simplify ?? 3]] as const) {
      if (document.activeElement !== $(`tip-${key}`)) $<HTMLInputElement>(`tip-${key}`).value = String(value);
      $<HTMLInputElement>(`tip-${key}`).disabled = !!gesture;

    }
    $('simplify-value').textContent = `${tip.simplify ?? 3} u`;
    $<HTMLInputElement>('tip-size-slider').value = String(tip.size);
    $<HTMLInputElement>('tip-size-slider').disabled = !!gesture;
    const rx = 48, angle = -tip.angle * Math.PI / 180;
    $('tip-ellipse').setAttribute('rx', String(rx)); $('tip-ellipse').setAttribute('ry', String(rx * tip.ratio));
    for (const [key, x, y] of [['ratio', 0, -rx * tip.ratio], ['angle', rx, 0]] as const) {
      $(`tip-${key}-handle`).setAttribute('transform', `translate(${x * Math.cos(angle) - y * Math.sin(angle)} ${x * Math.sin(angle) + y * Math.cos(angle)}) rotate(${key === 'angle' ? -tip.angle : 0})`);
    }
    $('tip-ellipse').setAttribute('transform', `rotate(${-tip.angle})`);
    $('tip-axis-lines').setAttribute('d', `M-48 0H48 M0 ${-48 * tip.ratio}V${48 * tip.ratio}`);
    $('tip-axes').setAttribute('transform', `rotate(${-tip.angle})`);
    for (const [key, rotation, label, value, x, y] of [['angle', -tip.angle, `${tip.angle}°`, tip.angle, rx, 0], ['ratio', -tip.angle - 90, `${Math.round(tip.ratio * 100)}%`, Math.round(tip.ratio * 100),  0, -rx * tip.ratio]] as const) {
      const normalized = ((rotation + 180) % 360 + 360) % 360 - 180;
      const flip = normalized > 90 || normalized < -90;
      const text = $(`${key}-value`);
      text.textContent = label; text.setAttribute('x', `${key==='ratio' ? 0 : 0}`); text.setAttribute('y', '2.5');
      text.setAttribute('transform', key==='angle' ? `translate(${(x * Math.cos(0) - y * Math.sin(0)) / 2} ${(x * Math.sin(0) + y * Math.cos(0)) / 2}) rotate(${flip ? 180: 0})` :  `rotate(${ 90 + (flip ? 0 : 180)})`);
      $(`tip-${key}-handle`).setAttribute('aria-valuenow', String(value));
    }
  }
}
function fit() {
  cancel();
  const slots = runLayout(), advance = Math.max(100, slots.reduce((sum, slot) => sum + slot.width, 0));
  view.scale = Math.max(0.05, Math.min((canvas.clientWidth - 100) / advance, (canvas.clientHeight - 80) / (metrics().ascender - metrics().descender + 50)));
  view.x = (canvas.clientWidth - advance * view.scale) / 2 + (slots[activeSlot]?.x ?? 0) * view.scale;
  view.y = canvas.clientHeight / 2 + (metrics().ascender + metrics().descender) / 2 * view.scale;
  render();
}
function commit(before: Contour[], beforeAnnotations = structuredClone(annotations()), beforeWidth = currentDrawing().width) {
  roundNodes(contours);
  const previous = { contours: before, annotations: beforeAnnotations, width: beforeWidth };
  if (JSON.stringify(previous) === JSON.stringify({ contours, annotations: annotations(), width: currentDrawing().width })) return;
  undo.push(previous); if (undo.length > 100) undo.shift(); redo.length = 0;
  persist();
}
function cancel() {
  cancelAnnotationDrag?.();
  if (gesture) {
    contours = gesture.before; selected = gesture.selection; selectedSegments = gesture.segments ?? new Set(); selectedHandles = gesture.handles ?? new Set();
    if (gesture.drawTool === 'pen') penDraft = gesture.penBefore ?? null;
    gesture = null;
  }
  $('marquee').setAttribute('hidden', '');
  lastTap = null;
  render();
}
function history(back: boolean) {
  cancel();
  if (strokes.length) { if (back) cancelStroke(); return; }
  if (penDraft) { penDraft = null; render(); return; }
  const source = back ? undo : redo, target = back ? redo : undo;
  const next = source.at(-1);
  const otherLayer = (): Layer => project.editMask ? { contours: currentDrawing().contours, annotations: currentDrawing().annotations ?? [] } : { contours: currentDrawing().mask?.contours ?? [], annotations: currentDrawing().mask?.annotations ?? [] };
  if (next?.otherExpected && next.otherExpected !== JSON.stringify(otherLayer())) { message = '전환 후 반대 레이어가 편집되었습니다. 그 편집을 먼저 되돌려 주세요.'; render(); return; }
  const previous = source.pop();
  if (previous) { target.push({ ...snapshot(), ...(previous.other ? { other: structuredClone(otherLayer()), otherExpected: JSON.stringify({ contours: previous.other.contours, annotations: previous.other.annotations ?? [] }) } : {}) }); if (previous.other) { if (project.editMask) { currentDrawing().contours = previous.other.contours; currentDrawing().annotations = previous.other.annotations; } else currentDrawing().mask = previous.other; } contours = previous.contours; currentLayer().annotations = previous.annotations; if (!project.editMask) currentDrawing().width = previous.width; persist(); }
  render();
}
function removeSelection() {
  if (!hasSelection() || gesture || penDraft) return;
  const before = structuredClone(contours);
  contours = deleteSelection(contours, selected, selectedHandles, selectedSegments);
  clearSelection(); commit(before); render();
}
$('delete-selection').addEventListener('click', removeSelection);
function nudge(dx: number, dy: number, constrained = option()) {
  if (!hasSelection() || gesture) return;
  const before = structuredClone(contours);
  moveSelection(dx, dy, constrained); commit(before); render();
}
function finishPen(closed = false) {
  if (!penDraft || penDraft.nodes.length < 2) return;
  const before = structuredClone(contours);
  penDraft.closed = closed;
  if (!closed) { delete penDraft.nodes[0].incoming; delete penDraft.nodes.at(-1)!.outgoing; }
  contours.push(penDraft); selected = new Set(penDraft.nodes.map(n => n.id)); penDraft = null;
  commit(before); render();
}

function finishDraw(g: Gesture, end: Point) {
  try {
    if (g.drawTool === 'pen' && g.penEdit) {
      if (g.moved) return;
      const hit = g.penEdit, beforeIds = new Set(hit.contour.nodes.map(n => n.id));
      const edited = hit.part === 'node' ? removeNodePreservingCurve(hit.contour, hit.node.id) : insertNode(hit.contour, glyphPoint(g.start, g.view));
      contours = contours.flatMap(c => c.id === hit.contour.id ? edited ? [edited] : [] : [c]);
      clearSelection(); if (edited) selected = new Set(edited.nodes.filter(n => !beforeIds.has(n.id)).map(n => n.id));
      commit(g.before); return;
    }
    if (g.drawTool === 'overlap') {
      if (g.hit?.part !== 'node') { message = '모서리 노드에서 시작하세요.'; return; }
      const target = visibleHit(end);
      if (g.moved) {
        if (target?.part !== 'node' || target.node.id === g.hit.node.id) { message = '다른 노드까지 드래그하세요.'; return; }
        contours = makeOverlap(g.before, new Set([g.hit.node.id, target.node.id]));
      } else contours = g.before.map(c => c.id === g.hit!.contour.id ? loopCorner(c, g.hit!.node.id) : c);
      clearSelection(); commit(g.before); return;
    }
    if (g.drawTool === 'annotation') {
      if (!g.moved) {
        const hit = annotations().map(a => ({ a, d: distance(screenPoint(a, g.view), end) })).filter(v => v.d <= 18).sort((a, b) => a.d - b.d)[0]?.a;
        showAnnotation(hit ?? { id: newId(), ...glyphPoint(end, g.view), text: '' }, !hit);
      }
      return;
    }
    if (g.drawTool === 'pen') {
      if (g.closePen) finishPen(true);
      return;
    }
    let added: Contour[] = [];
    if (g.drawTool === 'knife') {
      if (g.moved) contours = knife(g.before, g.selection, glyphPoint(g.start, g.view), glyphPoint(end, g.view), g.additive);
      else if (g.hit?.part === 'node') contours = breakAtNode(g.before, g.hit.node.id);
    } else if (g.drawTool === 'rectangle' || g.drawTool === 'ellipse') {
      if (g.moved) added = shape(g.drawTool, shapeStart(g), shapeEnd(g, end));
    } else if (g.points && g.tip) {
      const last = glyphPoint(end, g.view);
      if (distance(last, g.points.at(-1)!) > 0.001) g.points.push({ ...last, pressure: g.points.at(-1)!.pressure });
      strokes.push({ tool: g.drawTool as 'brush' | 'eraser', points: g.points, tip: g.tip, projectId: project.id, glyphId: project.activeGlyph, context: historyKey() });
      processStrokes(); return;
    }
    if (added.length) { selectedSegments.clear(); selectedHandles.clear(); contours.push(...added); selected = new Set(added.flatMap(c => c.nodes.map(n => n.id))); }
    // Keep the eraser's resulting contours selected for the next stroke.
    if ((g.drawTool === 'eraser' || g.drawTool === 'knife') && g.selection.size) {
      const oldIds = new Set(g.before.map(c => c.id));
      selected = new Set(contours.flatMap(c => c.nodes.filter(n => !oldIds.has(c.id) || g.selection.has(n.id)).map(n => n.id)));
    }
    commit(g.before);
  } catch (error) {
    contours = g.before; selected = g.selection;
    message = g.drawTool === 'overlap' && error instanceof Error ? error.message : '연산을 완료하지 못해 원래 윤곽선을 유지했습니다.';
    console.error('Geometry operation failed', error);
  }
}
function zoom(factor: number, anchor: Point) {
  if (gesture || pinch) return;
  const p = glyphPoint(anchor, view);
  view.scale = Math.max(0.15, Math.min(8, view.scale * factor));
  view.x = anchor.x - p.x * view.scale; view.y = anchor.y + p.y * view.scale;
  render();
}
function beginPinch() {
  cancel();
  const [a, b] = [...touches.values()];
  pinch = { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, distance(a, b)), view: { ...view } };
}

canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.button !== 1) return;
  if (runLayout()[activeSlot]?.glyph?.id !== project.activeGlyph && tool !== 'select' && tool !== 'pan') return;
  e.preventDefault(); if (e.pointerType !== 'touch') canvas.focus({ preventScroll: true });
  const point = local(e);
  if (e.pointerType === 'touch') {
    cursor = null; renderCursor();
    if (penId !== null) return;
    if (!touches.size) touchTap = { time: performance.now(), starts: new Map(), count: 0, valid: true, view: { ...view } };
    if (touchTap) {
      if (touchTap.starts.size !== touches.size) touchTap.valid = false;
      touchTap.starts.set(e.pointerId, point); touchTap.count = Math.max(touchTap.count, touches.size + 1);
    }
    touches.set(e.pointerId, point);
    canvas.setPointerCapture(e.pointerId);
    if (touches.size >= 2) { beginPinch(); return; }
    if (!$<HTMLInputElement>('finger-tools').checked) return;
  }
  if (e.pointerType === 'pen') { if (gesture) cancel(); touches.clear(); touchTap = null; pinch = null; penId = e.pointerId; }
  if (gesture || pinch) return;
  canvas.setPointerCapture(e.pointerId);
  const pan = tool === 'pan' || e.button === 1;
  if (strokes.length && !pan && tool !== 'brush' && tool !== 'eraser') return;
  if (!pan && freeTransform && hasSelection()) {
    const handles = transformHandles(), index = handles.findIndex(h => distance(screenPoint(h.point, view), point) < 16);
    if (index >= 0) { const h = handles[index]; gesture = { id: e.pointerId, start: point, before: structuredClone(contours), selection: new Set(selected), segments: new Set(selectedSegments), handles: new Set(selectedHandles), view: { ...view }, hit: null, additive: false, moved: false, kind: 'free', free: { index, pivot: h.pivot, start: glyphPoint(point, view) } }; return; }
  }
  const hit = pan || tool !== 'select' ? null : (visibleHit(point, selected) ?? segmentHit(contours, glyphPoint(point, view), 10 / view.scale));
  const beforeSelection = new Set(selected), beforeSegments = new Set(selectedSegments), beforeHandles = new Set(selectedHandles), additive = modifier() || e.shiftKey;
  const slot = !pan && tool === 'select' ? slotAt(point) : -1;
  if (!hit && slot >= 0 && (slot !== activeSlot || !runLayout()[slot]?.glyph)) {
    gesture = { id: e.pointerId, start: point, before: structuredClone(contours), selection: beforeSelection, segments: beforeSegments, handles: beforeHandles, view: { ...view }, hit: null, additive, moved: false, kind: 'glyph', slot }; return;
  }
  message = '';
  if (!pan && tool !== 'select') {
    const g: Gesture = { id: e.pointerId, start: point, before: structuredClone(contours), selection: operationSelection(), segments: beforeSegments, handles: beforeHandles, view: { ...view }, hit: null, additive, moved: false, kind: 'draw', drawTool: tool };
    const p = glyphPoint(point, view);
    if (tool === 'knife' || tool === 'overlap') g.hit = visibleHit(point);
    if (tool === 'brush' || tool === 'eraser') { g.points = [strokeSample(e, view)]; g.tip = { ...tips[tool] }; }
    else if (tool === 'pen') {
      if (!penDraft) {
        const edit = penHit(point);
        if (edit) { g.penEdit = edit; gesture = g; render(); return; }
      }
      g.penBefore = structuredClone(penDraft);
      if (penDraft && penDraft.nodes.length >= 3 && distance(screenPoint(penDraft.nodes[0], view), point) < 14) g.closePen = true;
      else {
        if (!penDraft) penDraft = { id: newId(), closed: false, nodes: [] };
        penDraft.nodes.push({ id: `${penDraft.id}-${penDraft.nodes.length}`, x: Math.round(p.x), y: Math.round(p.y) });
      }
    }
    gesture = g; render(); return;
  }
  if (!pan) {
    if (hit) {
      const group = hit.part === 'node' ? selected : hit.part === 'segment' ? selectedSegments : selectedHandles;
      const key = hit.part === 'node' || hit.part === 'segment' ? hit.node.id : handleKey(hit.node.id, hit.part);
      if (additive) { if (group.has(key)) group.delete(key); else group.add(key); }
      else {
        const nodes = nodeSelection(), next = hit.contour.nodes[(hit.contour.nodes.indexOf(hit.node) + 1) % hit.contour.nodes.length];
        const active = group.has(key) || (hit.part === 'segment' && nodes.has(hit.node.id) && nodes.has(next.id));
        if (!active) { clearSelection(); group.add(key); }
      }
    } else if (!additive) clearSelection();
  }
  gesture = { id: e.pointerId, start: point, before: structuredClone(contours), selection: beforeSelection, segments: beforeSegments, handles: beforeHandles, view: { ...view }, hit, additive, constrained: option() || e.altKey, moved: false, kind: pan ? 'pan' : hit ? 'edit' : 'box' };
  render();
});

function updateMarquee(g: Gesture, point: Point) {
  g.kind = 'box'; g.moved = true; slotTap = null;
    const dx = point.x - g.start.x, dy = point.y - g.start.y;
    const x = Math.min(point.x, g.start.x), y = Math.min(point.y, g.start.y);
    const box = $('marquee'); box.removeAttribute('hidden');
    for (const [key, value] of Object.entries({ x, y, width: Math.abs(dx), height: Math.abs(dy) })) box.setAttribute(key, String(value));
    selected = g.additive ? new Set(g.selection) : new Set();
    selectedSegments = g.additive ? new Set(g.segments) : new Set(); selectedHandles = g.additive ? new Set(g.handles) : new Set();
    for (const c of contours) for (const n of c.nodes) {
      const p = screenPoint(n, view);
      if (!hiddenViews.has('nodes') && p.x >= x && p.x <= x + Math.abs(dx) && p.y >= y && p.y <= y + Math.abs(dy)) selected.add(n.id);
      for (const part of ['incoming', 'outgoing'] as const) if (n[part] && !hiddenViews.has('handles')) { const h = screenPoint(n[part]!, view); if (h.x >= x && h.x <= x + Math.abs(dx) && h.y >= y && h.y <= y + Math.abs(dy)) selectedHandles.add(handleKey(n.id, part)); }
    }
}

canvas.addEventListener('pointermove', e => {
  const point = local(e);
  if (e.pointerType !== 'touch') { cursor = point; renderCursor(); }
  if (touches.has(e.pointerId)) {
    touches.set(e.pointerId, point);
    const start = touchTap?.starts.get(e.pointerId);
    if (start && distance(start, point) > 10) touchTap!.valid = false;
  }
  if (pinch && touches.size >= 2) {
    const [a, b] = [...touches.values()], anchor = glyphPoint(pinch.center, pinch.view);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    view.scale = Math.max(0.15, Math.min(8, pinch.view.scale * distance(a, b) / pinch.distance));
    view.x = center.x - anchor.x * view.scale; view.y = center.y + anchor.y * view.scale;
    render(); return;
  }
  const g = gesture;
  if (!g || g.id !== e.pointerId) return;
  if (!g.moved && distance(point, g.start) < (g.penEdit ? 8 : 4) && !g.points) return;
  g.moved = true; lastTap = null;
  const dx = point.x - g.start.x, dy = point.y - g.start.y;
  if (g.kind === 'free') { updateFreeTransform(g, glyphPoint(point, g.view)); render(); return; }
  if (g.kind === 'glyph') { g.kind = 'box'; slotTap = null; }
  if (g.kind === 'pan') { view.x = g.view.x + dx; view.y = g.view.y + dy; }
  else if (g.kind === 'draw') {
    const p = glyphPoint(point, g.view);
    if (g.drawTool === 'knife' || g.drawTool === 'overlap') g.end = point;
    else if (g.drawTool === 'rectangle' || g.drawTool === 'ellipse') g.preview = shape(g.drawTool, shapeStart(g), shapeEnd(g, point));
    else if (g.drawTool === 'pen' && penDraft && !g.closePen) {
      const node = penDraft.nodes.at(-1)!;
      node.smooth = true; node.outgoing = p; node.incoming = { x: node.x * 2 - p.x, y: node.y * 2 - p.y }; roundNodes([penDraft]);
    } else if (g.points) {
      const samples = e.getCoalescedEvents?.() ?? [];
      for (const event of samples.length ? samples : [e]) {
        const sample = strokeSample(event, g.view), last = g.points.at(-1)!;
        if (distance(last, sample) * g.view.scale >= 1.5 || Math.abs((sample.pressure ?? 1) - (last.pressure ?? 1)) >= .02) g.points.push(sample);
      }
    }
  }
  else if (g.kind === 'edit' && g.hit) {
    contours = structuredClone(g.before);
    moveSelection(dx / g.view.scale, -dy / g.view.scale, g.constrained || e.altKey); roundNodes(contours);
  } else {
    updateMarquee(g, point);
  }
  if (g.points) { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); } else render();
});

canvas.addEventListener('pointerup', e => {
  const wasTouch = touches.delete(e.pointerId);
  if (penId === e.pointerId) penId = null;
  if (wasTouch && touchTap) {
    const start = touchTap.starts.get(e.pointerId)!;
    if (distance(start, local(e)) > 10) touchTap.valid = false;
    if (!touches.size) {
      const tap = touchTap; touchTap = null;
      if (tap.valid && (tap.count === 2 || tap.count === 3) && performance.now() - tap.time < 350) {
        pinch = null; view = tap.view; lastTap = null; history(tap.count === 2); return;
      }
    }
  }
  if (pinch) { if (!touches.size) pinch = null; return; }
  const g = gesture;
  if (!g || g.id !== e.pointerId) return;
  if ((g.kind === 'box' || g.kind === 'glyph') && distance(g.start, local(e)) >= 4) updateMarquee(g, local(e));
  gesture = null; $('marquee').setAttribute('hidden', '');
  if (g.kind === 'glyph') {
    if (!g.moved && slotTap && slotTap.index === g.slot && performance.now() - slotTap.time < 340) { activateSlot(g.slot!); slotTap = null; }
    else slotTap = { index: g.slot!, time: performance.now() };
    return;
  }
  if (g.kind === 'draw') { finishDraw(g, local(e)); lastTap = null; render(); return; }
  if (g.moved && (g.kind === 'edit' || g.kind === 'free')) commit(g.before);
  if (!g.moved && g.kind === 'edit' && g.hit?.part === 'segment' && g.constrained) {
    if (lineToCurve(g.hit.contour, g.hit.node.id)) commit(g.before);
    lastTap = null; render(); return;
  }
  if (!g.moved && g.hit && ['node', 'segment'].includes(g.hit.part)) {
    const now = performance.now(), key = `${g.hit.part}:${g.hit.node.id}`;
    if (lastTap && lastTap.id === key && now - lastTap.time < 340 && distance(lastTap.point, local(e)) < 18) {
      if (g.hit.part === 'node') {
        const before = structuredClone(contours); toggleSmooth(g.hit.contour, g.hit.node); commit(before);
      } else {
        const ids = g.hit.contour.nodes.map(n => n.id), prior = lastTap.selection;
        if (!g.additive) clearSelection();
        const remove = g.additive && ids.every(id => prior.has(id));
        selectContour(g.hit.contour, remove); selectedSegments.clear();
      }
      lastTap = null;
    } else lastTap = { id: key, time: now, point: local(e), selection: g.selection };
  } else lastTap = null;
  render();
});
function interrupted(e: PointerEvent) {
  const wasTouch = touches.delete(e.pointerId);
  if (!wasTouch && penId !== e.pointerId && gesture?.id !== e.pointerId) return;
  touchTap = null;
  if (penId === e.pointerId) penId = null;
  if (gesture?.id === e.pointerId) cancel();
  if (pinch) { pinch = null; touches.clear(); }
}
canvas.addEventListener('pointercancel', interrupted);
canvas.addEventListener('lostpointercapture', interrupted);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.002), local(e)); }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

const fingerTools = $<HTMLInputElement>('finger-tools');
try { fingerTools.checked = localStorage.getItem('fontdraft.fingerTools') === 'true'; } catch { /* The preference still works for this session. */ }
fingerTools.addEventListener('change', () => { cancel(); touches.clear(); touchTap = null; pinch = null; try { localStorage.setItem('fontdraft.fingerTools', String(fingerTools.checked)); } catch { /* Session preference only. */ } });
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', e => {
  const target = e.target as Element;
  const scrolling = target.closest('.inspector, .glyphs, #proof-viewport, .toolbar, .menu-popup, dialog, textarea, input');
  if ((e.touches.length > 1 || !scrolling) && e.cancelable) e.preventDefault();
}, { passive: false });
document.addEventListener('contextmenu', e => { if (!(e.target as Element).closest('input, textarea')) e.preventDefault(); });
document.addEventListener('selectstart', e => { if (!(e.target as Element).closest('input, textarea')) e.preventDefault(); });
for (const id of ['modifier', 'option-modifier']) {
  const mod = $<HTMLButtonElement>(id);
  const pointers = id === 'modifier' ? modifierPointers : optionPointers;
  const toggle = () => { if (id === 'modifier') modifierLocked = !modifierLocked; else optionLocked = !optionLocked; };
  mod.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  mod.title = '짧게 탭: 고정/해제 · 누른 채 조작: 일시 적용';
  document.addEventListener('pointerdown', e => {
    if (!mod.contains(e.target as Node)) for (const press of pointers.values()) press.used = true;
  }, true);
  mod.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); mod.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, time: performance.now(), used: false }); render();
  });
  mod.addEventListener('pointermove', e => {
    const press = pointers.get(e.pointerId);
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) press.used = true;
  });
  mod.addEventListener('pointerup', e => {
    const press = pointers.get(e.pointerId);
    if (press && !press.used && performance.now() - press.time < 400 && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= 10) toggle();
    pointers.delete(e.pointerId); render();
  });
  for (const event of ['pointercancel', 'lostpointercapture']) mod.addEventListener(event, e => { pointers.delete((e as PointerEvent).pointerId); render(); });
  mod.addEventListener('click', e => {
    if (e.detail === 0 && !(e instanceof PointerEvent && e.pointerType)) { toggle(); render(); }
  });
}
window.addEventListener('keydown', e => {
  if (strokes.length) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); history(!e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); cancelStroke(true); }
    return;
  }
  if (document.querySelector('dialog[open]')) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.code === 'Space' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) { e.preventDefault(); togglePreview(); return; }
  if ((e.metaKey || e.ctrlKey) && ['c','x','v','d'].includes(e.key.toLowerCase())) {
    e.preventDefault(); if (!editable()) return;
    const key = e.key.toLowerCase(); if (key === 'c' || key === 'x') copySelection(key === 'x'); else pasteSelection(key === 'd' ? copyContours(contours, nodeSelection()) : clipboard); return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); clearSelection(); contours.forEach(c => selectContour(c)); render(); return; }
  if (e.key === 'Shift') { keyModifier = true; render(); }
  if (e.key === 'Alt') { keyOption = true; render(); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); history(!e.shiftKey); }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelection(); return; }
  if (e.key === 'Escape') { freeTransform = false; cancel(); modifierLocked = false; optionLocked = false; penDraft = null; clearSelection(); message = ''; render(); }
  if (e.key === 'Enter' && tool === 'pen' && !gesture) finishPen();
  const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  if (directions[e.key]) { e.preventDefault(); const [x, y] = directions[e.key]; nudge(x * ((e.shiftKey || modifier()) ? 10 : 1), y * ((e.shiftKey || modifier()) ? 10 : 1), option() || e.altKey); }
});
window.addEventListener('keyup', e => { if (e.key === 'Shift') keyModifier = false; if (e.key === 'Alt') keyOption = false; render(); });
function resetInput() { cursor = null; cancel(); keyModifier = false; modifierLocked = false; modifierPointers.clear(); keyOption = false; optionLocked = false; optionPointers.clear(); touches.clear(); touchTap = null; pinch = null; penId = null; render(); }
window.addEventListener('blur', resetInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });
window.addEventListener('resize', resetInput);
for (const name of tools) $(`${name}-tool`).addEventListener('click', () => {
  cancel(); if (penDraft?.nodes.length && penDraft.nodes.length >= 2) finishPen(); else penDraft = null;
  tool = name; freeTransform = false; message = '';
  for (const t of tools) { $(`${t}-tool`).classList.toggle('active', t === name); $(`${t}-tool`).setAttribute('aria-pressed', String(t === name)); }
  render();
});
$('finish-pen').addEventListener('click', () => finishPen());
function applyTransform(kind: Transform['kind'], override?: Transform, direction = 1, axis: 'x' | 'y' = 'x') {
  if (!hasSelection() || gesture) return;
  const inputIds = kind === 'rotate' ? ['rotate-angle'] : kind === 'scale' ? ['scale-x', 'scale-y'] : [axis === 'y' ? 'slant-y-angle' : 'slant-angle'];
  const inputs = inputIds.map(id => $<HTMLInputElement>(id));
  if (!override && inputs.some(input => !input.reportValidity())) return;
  const values = inputs.map(input => Number(input.value));
  if (!values.every(Number.isFinite)) return;
  const t: Transform = override ?? (kind === 'rotate' ? { kind, angle: values[0] * direction } : kind === 'scale' ? { kind, x: values[0] / 100, y: values[1] / 100 } : { kind, angle: values[0] * direction, axis });
  const before = structuredClone(contours);
  const nodeIds = nodeSelection();
  const standalone = contours.flatMap(c => c.nodes.flatMap(n => nodeIds.has(n.id) ? [] : (['incoming', 'outgoing'] as const).filter(part => n[part] && selectedHandles.has(handleKey(n.id, part))).map(part => ({ node: n, part, point: n[part]! }))));
  const allPoints = [...contours.flatMap(c => c.nodes).filter(n => nodeIds.has(n.id)), ...standalone.map(h => h.point)];
  const minX = Math.min(...allPoints.map(p => p.x)), maxX = Math.max(...allPoints.map(p => p.x));
  const minY = Math.min(...allPoints.map(p => p.y)), maxY = Math.max(...allPoints.map(p => p.y));
  const pivot = { x: minX + (maxX - minX) * (pivotIndex % 3) / 2, y: maxY - (maxY - minY) * Math.floor(pivotIndex / 3) / 2 };
  transformSelection(contours, nodeIds, t, pivot);
  // Keep the fill relationship when a whole closed contour is reflected.
  if (t.kind === 'scale' && t.x * t.y < 0) for (const c of contours) if (c.closed && c.nodes.every(n => nodeIds.has(n.id))) {
    reverseContour(c);
  }
  for (const h of standalone) { const n = { ...h.point, id: 'handle' }; transformSelection([{ id: 'handle', closed: false, nodes: [n] }], new Set(['handle']), t, pivot); moveHandle(h.node, h.part, n.x - h.point.x, n.y - h.point.y, !standalone.some(other => other.node === h.node && other.part !== h.part)); } commit(before); message = ''; render();
}
$('align-controls').addEventListener('click', e => {
  const button = (e.target as Element).closest<HTMLButtonElement>('[data-align]');
  if (!button || !hasSelection() || gesture || penDraft || tool !== 'select') return;
  const index = Number(button.dataset.align), axis = index < 3 ? 'x' : 'y', mode = index % 3;
  const ids = nodeSelection(), before = structuredClone(contours);
  const groups: { min: number; max: number; move: (delta: number) => void }[] = [];
  for (const c of contours) {
    if (c.nodes.length && c.nodes.every(n => ids.has(n.id))) {
      const bounds = outlineBounds([c])!;
      groups.push({ min: axis === 'x' ? bounds.left : bounds.bottom, max: axis === 'x' ? bounds.right : bounds.top,
        move: delta => translate([c], ids, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0) });
    } else for (const n of c.nodes) {
      if (ids.has(n.id)) groups.push({ min: n[axis], max: n[axis], move: delta => translate([c], new Set([n.id]), axis === 'x' ? delta : 0, axis === 'y' ? delta : 0) });
      else for (const part of ['incoming', 'outgoing'] as const) if (n[part] && selectedHandles.has(handleKey(n.id, part))) {
        const point = n[part]!;
        groups.push({ min: point[axis], max: point[axis], move: delta => { point[axis] += delta; n.smooth = false; } });
      }
    }
  }
  if (groups.length < 2) return;
  const low = Math.min(...groups.map(g => g.min)), high = Math.max(...groups.map(g => g.max));
  const edge = axis === 'y' ? 2 - mode : mode;
  const target = edge === 0 ? low : edge === 2 ? high : (low + high) / 2;
  for (const g of groups) g.move(Math.round(target - (edge === 0 ? g.min : edge === 2 ? g.max : (g.min + g.max) / 2)));
  commit(before); render();
});
$('apply-scale').addEventListener('click', () => applyTransform('scale'));
for (const [id, kind, direction, axis] of [['rotate-left','rotate',1,'x'],['rotate-right','rotate',-1,'x'],['slant-left','slant',-1,'x'],['slant-right','slant',1,'x'],['slant-down','slant',-1,'y'],['slant-up','slant',1,'y']] as const) $(id).addEventListener('click', () => applyTransform(kind, undefined, direction, axis));
$('flip-horizontal').addEventListener('click', () => applyTransform('scale', { kind: 'scale', x: -1, y: 1 }));
$('flip-vertical').addEventListener('click', () => applyTransform('scale', { kind: 'scale', x: 1, y: -1 }));
$('transform-origin').addEventListener('click', e => {
  const button = (e.target as Element).closest<HTMLButtonElement>('[data-pivot]'); if (!button) return;
  pivotIndex = Number(button.dataset.pivot);
  for (const b of $('transform-origin').querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b === button));
});
for (const axis of ['x', 'y']) $(`scale-${axis}`).addEventListener('input', () => {
  if ($<HTMLInputElement>('scale-lock').checked) $<HTMLInputElement>(`scale-${axis === 'x' ? 'y' : 'x'}`).value = $<HTMLInputElement>(`scale-${axis}`).value;
});
$('scale-lock').addEventListener('change', () => {
  if ($<HTMLInputElement>('scale-lock').checked) $<HTMLInputElement>('scale-y').value = $<HTMLInputElement>('scale-x').value;
});
for (const key of ['size', 'simplify'] as const) $(`tip-${key}`).addEventListener('input', () => {
  if (tool !== 'brush' && tool !== 'eraser') return;
  const input = $<HTMLInputElement>(`tip-${key}`);
  if (!input.value || !input.validity.valid) return;
  tips[tool][key] = Number(input.value);
  render();
});
$('undo').addEventListener('click', () => history(true));
$('redo').addEventListener('click', () => history(false));
document.querySelectorAll<HTMLButtonElement>('[data-nudge]').forEach(b => {
  const move = () => { const [x, y] = b.dataset.nudge!.split(',').map(Number); nudge(x * (modifier() ? 10 : 1), y * (modifier() ? 10 : 1)); };
  b.addEventListener('pointerdown', e => { if (e.button !== 0 || b.disabled) return; e.preventDefault(); move(); });
  b.addEventListener('click', e => { if (e.detail === 0 && !(e instanceof PointerEvent && e.pointerType)) move(); });
});


$('tip-size-slider').addEventListener('input', () => { if ((tool === 'brush' || tool === 'eraser') && !gesture) { tips[tool].size = Number($<HTMLInputElement>('tip-size-slider').value); render(); } });
$('tip-pressure').addEventListener('change', () => { if (tool === 'brush' || tool === 'eraser') tips[tool].pressure = $<HTMLInputElement>('tip-pressure').checked; });
const tipPreview = $<SVGSVGElement>('tip-preview');
let tipDrag: { id: number; key: string; tool: 'brush' | 'eraser'; before: Tip } | null = null;
tipPreview.style.touchAction = 'none';
function tipPosition(e: PointerEvent) {
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(tipPreview.getScreenCTM()!.inverse());
  return { x: p.x, y: p.y };
}
tipPreview.addEventListener('pointerdown', e => {
  if (e.button !== 0 || gesture || (tool !== 'brush' && tool !== 'eraser')) return;
  e.preventDefault(); tipPreview.setPointerCapture(e.pointerId);
  tipDrag = { id: e.pointerId, key: (e.target as Element).closest<SVGElement>('[data-tip-drag]')?.dataset.tipDrag ?? 'angle', tool, before: { ...tips[tool] } };
});
tipPreview.addEventListener('pointermove', e => {
  if (!tipDrag || tipDrag.id !== e.pointerId) return;
  const p = tipPosition(e), tip = tips[tipDrag.tool], a = tip.angle * Math.PI / 180;
  if (tipDrag.key === 'angle') tip.angle = Math.round(-Math.atan2(p.y, p.x) * 180 / Math.PI);
  else tip.ratio = Math.max(.05, Math.min(1, Math.round(Math.abs(p.x * Math.sin(a) + p.y * Math.cos(a)) / 48 * 100) / 100));
  render();
});
tipPreview.addEventListener('pointerup', () => { tipDrag = null; });
tipPreview.addEventListener('keydown', e => {
  if ((tool !== 'brush' && tool !== 'eraser') || gesture || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const key = (e.target as Element).closest<SVGElement>('[data-tip-drag]')?.dataset.tipDrag;
  if (!key) return;
  e.preventDefault(); e.stopPropagation();
  const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
  if (key === 'angle') tips[tool].angle = Math.max(-180, Math.min(180, tips[tool].angle + delta));
  else tips[tool].ratio = Math.max(.05, Math.min(1, Math.round(tips[tool].ratio * 100 + delta) / 100));
  render();
});
for (const event of ['pointercancel', 'lostpointercapture']) tipPreview.addEventListener(event, () => {
  if (tipDrag) { tips[tipDrag.tool] = tipDrag.before; tipDrag = null; render(); }
});

// Project changes keep separate glyph histories; disk exports are explicit snapshots.
let saveSequence = 0;
function renderWorkspace() {
  $('project-menu').textContent = project.name;
  const form = $<HTMLFormElement>('glyph-properties'), g = activeGlyph();
  for (const [name, value] of [['name', g.name], ['unicodes', g.unicodes.map(u => u.toString(16).toUpperCase().padStart(4, '0')).join(' ')]]) {
    const input = field(form, name);
    if (input.dataset.glyph !== g.id || input.value === (input.dataset.saved ?? '')) input.value = value;
    input.dataset.glyph = g.id; input.dataset.saved = value;
  }
  field(form, 'width').value = String(currentDrawing().width);
  const height = metrics().ascender - metrics().descender;
  $('glyph-list').innerHTML = project.glyphs.map(g => `<button class="glyph-card" data-glyph="${g.id}" aria-current="${g.id === project.activeGlyph}"><svg viewBox="-30 ${-metrics().ascender - 30} ${Math.max(drawing(project, g).width, 100) + 60} ${height + 60}" aria-hidden="true">${drawing(project, g).contours.some(c => c.nodes.length) ? '' : placeholderText(glyphCharacter(g), drawing(project, g).width, { x: 0, y: 0, scale: 1 })}<path fill-rule="nonzero" d="${drawing(project, g).contours.filter(c => c.closed).map(c => pathData(c, { x: 0, y: 0, scale: 1 })).join(' ')}"/></svg><small>${escapeXML(g.name)}</small></button>`).join('');
}
function persist() {
  roundNodes(contours); roundProject(project);
  currentLayer().contours = contours;
  renderWorkspace();
  const sequence = ++saveSequence;
  $('save-status').removeAttribute('data-error');
  $('save-status').textContent = '기기에 저장 중';
  void saveDraft(project).then(() => {
    if (sequence === saveSequence) $('save-status').textContent = '기기에 저장됨';
  }).catch(() => {
    if (sequence === saveSequence) { $('save-status').textContent = '자동저장 실패 · 프로젝트 백업을 이용하세요'; $('save-status').setAttribute('data-error', 'true'); void updateStorageStatus(); }
  });
}
function settle() {
  commitAnnotation(); cancel(); finishPen(); penDraft = null;
  currentLayer().contours = contours;
  histories.set(historyKey(), { undo, redo });
}
function activate(next: Project, glyphId = next.activeGlyph, keepView = false) {
  roundProject(next);
  settle();
  const projectChanged = project.id !== next.id;
  project = next; project.activeGlyph = glyphId;
  if (!keepView) {
    const index = runLayout().findIndex(s => s.glyph?.id === glyphId);
    if (projectChanged || index < 0) { editText = glyphCharacter(activeGlyph()); activeSlot = 0; } else activeSlot = index;
    $<HTMLInputElement>('text-run').value = editText;
  }
  contours = currentLayer().contours;
  const saved = histories.get(historyKey());
  undo = saved?.undo ?? []; redo = saved?.redo ?? [];
  clearSelection(); message = ''; if (!keepView) fit(); else render(); persist();
}
$('glyph-list').addEventListener('click', e => {
  const id = (e.target as Element).closest<HTMLElement>('[data-glyph]')?.dataset.glyph;
  if (id) activate(project, id);
});

function renderMasterPanel() {
  const list = masterList(project), id = project.activeMaster ?? defaultMaster;
  const rows = list.map(m => {
    const data = drawing(project, activeGlyph(), m.id), active = m.id === id;
    const thumbnail = (mask: boolean) => {
      const layer = active && !!project.editMask === mask ? contours : mask ? data.mask?.contours ?? [] : data.contours;
      const baselines = m.id === defaultMaster ? project : project.masters!.find(item => item.id === m.id)!;
      return `<svg class="layer-thumbnail" viewBox="-50 ${-baselines.ascender - 100} ${Math.max(data.width, 100) + 100} ${baselines.ascender - baselines.descender + 200}" aria-hidden="true"><path d="${layer.filter(c => c.closed).map(c => pathData(c, { x: 0, y: 0, scale: 1 })).join(' ')}"/></svg>`;
    };
    return `<div class="master-entry" data-master="${escapeXML(m.id)}">
      <div class="master-foreground"><button class="layer-eye" data-master-visible="${escapeXML(m.id)}" aria-label="${escapeXML(m.name)} 윤곽선 표시/숨김" aria-pressed="${active || !!project.visibleMasters?.includes(m.id)}" ${active ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${!active && !project.visibleMasters?.includes(m.id) ? '<path d="M3 21 21 3"/>' : ''}</svg></button><button ${active ? 'id="layer-foreground"' : ''} class="layer-row master-row" data-layer="foreground" aria-label="${escapeXML(m.name)} 전경" aria-pressed="${active && !project.editMask}">${thumbnail(false)}<span class="master-name">${escapeXML(m.name)}</span></button></div>
      <div class="mask-row">${active ? `<button id="mask-visible" class="layer-eye" aria-label="배경 표시/숨김" title="${project.editMask ? '편집 중인 배경' : '배경 표시/숨김'}" aria-pressed="${!!project.editMask || project.maskVisible !== false}" ${project.editMask ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${project.maskVisible === false && !project.editMask ? '<path d="M3 21 21 3"/>' : ''}</svg></button>` : '<span class="layer-eye-space"></span>'}<button ${active ? 'id="layer-mask"' : ''} class="layer-row" data-layer="mask" aria-label="${escapeXML(m.name)} Mask" aria-pressed="${active && !!project.editMask}">${thumbnail(true)}<span>배경</span></button></div>
    </div>`;
  }).join('');
  const container = $('master-list');
  if (masterPanelMarkup !== rows) {
    masterPanelMarkup = rows;
    const focused = document.activeElement as HTMLElement | null, focusedId = focused?.id;
    const parent = focused?.closest<HTMLElement>('[data-master]'), layer = focused?.dataset.layer;
    container.innerHTML = rows;
    if (parent) {
      const entry = [...container.querySelectorAll<HTMLElement>('[data-master]')].find(e => e.dataset.master === parent.dataset.master);
      (focusedId === 'mask-visible' ? document.getElementById(focusedId) : entry?.querySelector<HTMLElement>(`[data-layer="${layer}"]`))?.focus({ preventScroll: true });
    }
  }
  $<HTMLButtonElement>('master-delete').disabled = list.length < 2;

}
function changeLayer(change: () => void) {
  if (strokes.length) return;
  settle(); freeTransform = false; change(); $('master-error').textContent = ''; contours = currentLayer().contours;
  const saved = histories.get(historyKey()); undo = saved?.undo ?? []; redo = saved?.redo ?? [];
  clearSelection(); message = ''; persist(); render();
}
$('master-list').addEventListener('click', e => {
  const target = (e.target as Element).closest<HTMLElement>('button');
  if (!target || strokes.length) return;
  if (target.dataset.masterVisible) {
    const id = target.dataset.masterVisible, visible = new Set(project.visibleMasters ?? []);
    if (visible.has(id)) visible.delete(id); else visible.add(id);
    project.visibleMasters = [...visible]; persist(); render(); return;
  }
  if (target.id === 'mask-visible') { project.maskVisible = project.maskVisible === false; persist(); render(); return; }
  const id = target.closest<HTMLElement>('[data-master]')?.dataset.master, mask = target.dataset.layer === 'mask';
  if (id) changeLayer(() => { project.activeMaster = id; project.editMask = mask; });
});
$('reverse-contours').addEventListener('click', () => {
  if (!hasSelection() || gesture || penDraft || strokes.length) return;
  const ids = operationSelection(), targets = contours.filter(c => c.nodes.some(n => ids.has(n.id))), before = structuredClone(contours);
  for (const c of targets) reverseContour(c);
  clearSelection(); targets.forEach(c => selectContour(c)); commit(before); render();
});
function editMasterName(id = project.activeMaster ?? defaultMaster) {
  if (strokes.length || $('master-list').querySelector('input')) return;
  const entry = [...$('master-list').querySelectorAll<HTMLElement>('[data-master]')].find(e => e.dataset.master === id);
  const row = entry?.querySelector<HTMLElement>('.master-row'), master = masterList(project).find(m => m.id === id);
  if (!row || !master) return;
  if ($('masters-panel').classList.contains('panel-collapsed')) $('masters-title').querySelector<HTMLButtonElement>('button')!.click();
  const editor = document.createElement('div'); editor.className = row.className;
  const input = document.createElement('input'); input.id = 'master-name'; input.maxLength = 120;
  input.setAttribute('aria-label', '마스터 이름'); input.value = master.name;
  editor.append(row.querySelector('svg')!.cloneNode(true), input); row.replaceWith(editor);
  let finished = false;
  const finish = (cancel = false) => {
    if (finished) return;
    finished = true;
    const name = input.value.trim();
    if (!cancel) {
      if (!name || /[\x00-\x1f\x7f]/.test(name) || masterList(project).some(m => m.id !== id && m.name === name)) {
        $('master-error').textContent = '중복되지 않는 마스터 이름을 입력하세요.';
      } else {
        if (id === defaultMaster) project.defaultMasterName = name; else project.masters!.find(m => m.id === id)!.name = name;
        $('master-error').textContent = ''; persist();
      }
    }
    masterPanelMarkup = ''; render();
  };
  input.addEventListener('blur', () => finish());
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finish(e.key === 'Escape'); }
  });
  input.focus(); input.select();
}
let masterNameTap: { id: string; time: number } | null = null;
$('master-list').addEventListener('click', e => {
  const name = (e.target as Element).closest('.master-name');
  const id = name?.closest<HTMLElement>('[data-master]')?.dataset.master;
  const now = performance.now();
  if (id && masterNameTap?.id === id && now - masterNameTap.time < 340) {
    masterNameTap = null; editMasterName(id);
  } else masterNameTap = id ? { id, time: now } : null;
});
$('master-list').addEventListener('dblclick', e => {
  const id = (e.target as Element).closest('.master-name')?.closest<HTMLElement>('[data-master]')?.dataset.master;
  if (id) editMasterName(id);
});
for (const duplicate of [false, true]) $(duplicate ? 'master-duplicate' : 'master-add').addEventListener('click', () => changeLayer(() => {
  const list = masterList(project), names = list.map(m => m.name), base = duplicate ? `${list.find(m => m.id === (project.activeMaster ?? defaultMaster))!.name} 복사` : 'Master';
  let name = base, count = 2; while (names.includes(name)) name = `${base} ${count++}`;
  addMaster(project, name, duplicate); project.editMask = false;
}));
$('master-delete').addEventListener('click', () => {
  if (strokes.length || !project.masters?.length) return;
  const id = project.activeMaster ?? defaultMaster, name = masterList(project).find(m => m.id === id)!.name;
  if (!confirm(`“${name}” 마스터와 모든 글리프의 전경·배경을 삭제할까요? 이 삭제는 되돌릴 수 없습니다.`)) return;
  changeLayer(() => {
    const promoted = id === defaultMaster ? project.masters![0].id : null;
    const moved = [...histories].filter(([key]) => promoted && key.startsWith(`${project.id}:${promoted}:`));
    for (const key of [...histories.keys()]) if (key.startsWith(`${project.id}:${id}:`) || (promoted && key.startsWith(`${project.id}:${promoted}:`))) histories.delete(key);
    for (const [key, history] of moved) histories.set(key.replace(`:${promoted}:`, `:${defaultMaster}:`), history);
    deleteMaster(project, id); project.editMask = false;
  });
});
for (const toMask of [false, true]) $(toMask ? 'copy-to-mask' : 'copy-to-foreground').addEventListener('click', () => {
  if (strokes.length) return;
  settle(); const data = currentDrawing(), source = structuredClone(toMask ? data : data.mask ?? { contours: [], annotations: [] });
  changeLayer(() => { project.editMask = toMask; });
  const before = snapshot(); contours = toMask ? source.contours : [...contours, ...freshContours(source.contours)]; currentLayer().annotations = toMask ? source.annotations ?? [] : [...annotations(), ...(source.annotations ?? []).map(a => ({ ...a, id: newId() }))];
  clearSelection(); commit(before.contours, before.annotations, before.width); render();
});

const dialogs = document.createElement('div');
dialogs.innerHTML = `
  <dialog id="project-dialog"><h2>프로젝트</h2>
    <section aria-labelledby="saved-projects-title"><h3 id="saved-projects-title">기기에 저장된 프로젝트</h3><ul id="project-list"></ul><p id="storage-status" class="dialog-note" role="status"></p></section>
    <div class="dialog-actions"><button id="new-project">새 프로젝트</button><button id="open-file">UFOZ 열기</button><button id="export-image">이미지 내보내기</button></div>
    <form id="project-form"><label>이름<input name="name" required maxlength="120" /></label><label>스타일<input name="style" required maxlength="120" /></label>
      <div class="metrics-fields">${[['upm', 'UPM'], ['ascender', 'Ascender'], ['descender', 'Descender'], ['xHeight', 'x-height'], ['capHeight', 'cap-height']].map(([name, label]) => `<label>${label}<input name="${name}" type="number" step="any" required /></label>`).join('')}</div>
      <p class="dialog-note">UPM 변경은 윤곽선 크기를 바꾸지 않습니다.</p><p id="project-error" role="alert"></p>
      <div class="dialog-actions"><button type="button" data-close="project-dialog">닫기</button><button type="submit">적용</button></div>
    </form>
  </dialog>
  <dialog id="glyph-dialog"><h2 id="glyph-dialog-title">글리프 추가</h2><form id="glyph-form">
    <label>추가할 문자<input name="characters" required maxlength="200" placeholder="가나다ABC" /></label><label>글자 폭<input name="width" type="number" step="any" required /></label>
    <p id="glyph-error" role="alert"></p><div class="dialog-actions"><button type="button" data-close="glyph-dialog">취소</button><button type="submit">적용</button></div>
  </form></dialog>
  <dialog id="file-dialog"><h2>파일</h2><p id="file-message" role="status"></p><button data-close="file-dialog" id="file-close">닫기</button></dialog>
  <dialog id="image-dialog"><h2>이미지 내보내기</h2><form id="image-form">
    <label>문자열<textarea id="image-text" aria-label="내보낼 문자열" maxlength="200" required></textarea></label>
    <label>높이 (px)<input id="image-height" aria-label="이미지 높이" type="number" value="512" min="32" max="4096" required /></label>
    <label>형식<select id="image-format" aria-label="이미지 형식"><option value="svg">SVG</option><option value="png">PNG</option></select></label>
    <p id="image-error" role="alert"></p><div class="dialog-actions"><button type="button" data-close="image-dialog">닫기</button><button type="submit" id="image-download">내보내기</button></div>
  </form></dialog>
  <input id="backup-input" type="file" accept=".json,application/json" hidden /><input id="file-input" type="file" accept=".ufoz" hidden />`;
document.body.append(dialogs);
const projectDialog = $<HTMLDialogElement>('project-dialog'), glyphDialog = $<HTMLDialogElement>('glyph-dialog'), fileDialog = $<HTMLDialogElement>('file-dialog');
const projectForm = $<HTMLFormElement>('project-form'), glyphForm = $<HTMLFormElement>('glyph-form');
const field = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement;
let newProject = false, fileBusy = false;
let storageRequest: Promise<boolean> | undefined;
async function updateStorageStatus(request = false) {
  const storage = navigator.storage;
  let label = '영구 저장 미지원';
  try {
    if (storage?.persisted) {
      let persistent = await storage.persisted();
      if (!persistent && request && storage.persist) persistent = await (storageRequest ??= storage.persist());
      label = persistent ? '영구 저장 허용' : '영구 저장 미허용';
    }
    const estimate = await storage?.estimate?.();
    const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
    if (estimate?.usage !== undefined) label += ` · 사용 ${mb(estimate.usage)}`;
    if (estimate?.quota !== undefined) label += ` / 한도 ${mb(estimate.quota)}`;
  } catch { label = '저장공간 상태 확인 불가'; }
  $('storage-status').textContent = label;
}
function projectFields(fresh: boolean) {
  void updateStorageStatus();
  newProject = fresh;
  const values = fresh ? createProject('Unititled') : { ...project, ...metrics() };
  for (const name of ['name', 'style', 'upm', 'ascender', 'descender', 'xHeight', 'capHeight'] as const) field(projectForm, name).value = String(values[name]);
  projectDialog.querySelector('.dialog-note')!.textContent = `기준선: ${fresh ? values.style : masterList(project).find(m => m.id === (project.activeMaster ?? defaultMaster))!.name} · UPM은 프로젝트 공통입니다.`;
  $('project-error').textContent = '';
  $('project-list').innerHTML = projects.map(p => `<li data-project-id="${p.id}"><button type="button" class="project-open" data-open-project="${p.id}" aria-current="${p.id === project.id}"><strong>${escapeXML(p.name)}</strong><small>${escapeXML(p.style)} · ${p.glyphs.length} 글리프${p.id === project.id ? ' · 현재 프로젝트' : ''}</small></button><button type="button" class="project-delete" data-delete-project="${p.id}" aria-label="${escapeXML(p.name)} 삭제" title="프로젝트 삭제"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7"/></svg></button></li>`).join('');
}
$('project-menu').addEventListener('click', () => { settle(); projectFields(false); projectDialog.showModal(); });
$('master-metrics').addEventListener('click', () => { settle(); projectFields(false); projectDialog.showModal(); field(projectForm, 'ascender').focus(); });
$('new-project').addEventListener('click', () => projectFields(true));
$('project-list').addEventListener('click', async e => {
  const target = (e.target as Element).closest<HTMLButtonElement>('button');
  if (!target) return;
  const next = projects.find(p => p.id === target.dataset.openProject);
  if (next) { activate(next); projectFields(false); return; }
  const removed = projects.find(p => p.id === target.dataset.deleteProject);
  if (!removed) return;
  const last = projects.length === 1;
  if (!confirm(`“${removed.name}” 프로젝트를 이 브라우저에서 삭제할까요? 되돌릴 수 없습니다.${last ? '\n마지막 프로젝트를 삭제하면 새 빈 프로젝트를 엽니다.' : ''}`)) return;
  settle();
  const remaining = projects.filter(p => p.id !== removed.id);
  const replacement = removed.id === project.id ? remaining[0] ?? createProject() : project;
  $<HTMLElement>('app').inert = true; projectDialog.inert = true;
  try {
    await deleteDraft(removed.id, replacement);
    projects = remaining.length ? remaining : [replacement];
    if (removed.id === project.id) activate(replacement);
    for (const key of histories.keys()) if (key.startsWith(`${removed.id}:`)) histories.delete(key);
    projectFields(false);
  } catch {
    $('project-error').textContent = '프로젝트를 삭제하지 못했습니다. 다시 시도해 주세요.';
  } finally { $<HTMLElement>('app').inert = false; projectDialog.inert = false; }
});
projectForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = field(projectForm, 'name').value.trim(), style = field(projectForm, 'style').value.trim();
  const values = { upm: Number(field(projectForm, 'upm').value), ascender: Number(field(projectForm, 'ascender').value), descender: Number(field(projectForm, 'descender').value), xHeight: Number(field(projectForm, 'xHeight').value), capHeight: Number(field(projectForm, 'capHeight').value) };
  if (!name || !style || /[\x00-\x1f\x7f]/.test(name + style) || !Object.values(values).every(Number.isFinite) || values.upm <= 0 || values.ascender <= values.descender) { $('project-error').textContent = '이름과 기준선을 확인하세요. UPM은 양수, Ascender는 Descender보다 커야 합니다.'; return; }
  const next = newProject ? createProject(name) : project;
  next.name = name; next.style = style; next.upm = values.upm;
  const { upm, ...baselines } = values; Object.assign(masterMetrics(next), baselines);
  if (newProject) projects.push(next);
  activate(next); void updateStorageStatus(true); projectDialog.close();
});
function showGlyph() {
  settle(); field(glyphForm, 'characters').value = ''; field(glyphForm, 'width').value = '600';
  $('glyph-error').textContent = ''; glyphDialog.showModal();
}
for (const id of ['add-glyph', 'mobile-add-glyph']) $(id).addEventListener('click', () => showGlyph());
glyphForm.addEventListener('submit', e => {
  e.preventDefault();
  const chars = [...new Set(Array.from(field(glyphForm, 'characters').value))], width = Number(field(glyphForm, 'width').value);
  if (!chars.length || !Number.isFinite(width) || chars.some(ch => { const u = ch.codePointAt(0)!; return u < 32 || (u >= 0xd800 && u <= 0xdfff); })) { $('glyph-error').textContent = '추가할 문자와 공통 자폭을 확인하세요.'; return; }
  let first: string | undefined;
  for (const ch of chars) {
    const unicode = ch.codePointAt(0)!;
    let g = project.glyphs.find(g => g.unicodes.includes(unicode));
    if (!g) {
      const base = unicode === 32 ? 'space' : /^[A-Za-z]$/.test(ch) ? ch : `uni${unicode.toString(16).toUpperCase().padStart(4, '0')}`;
      let name = base, i = 1; while (project.glyphs.some(g => g.name === name)) name = `${base}.${i++}`;
      g = createGlyph(name, [unicode]); g.width = width; project.glyphs.push(g);
    }
    first ??= g.id;
  }
  activate(project, first!); glyphDialog.close(); return;
});
for (const axis of ['x', 'y'] as const) $(`node-${axis}`).addEventListener('change', () => {
  const coordinate = coordinateSelection(), input = $<HTMLInputElement>(`node-${axis}`);
  if (!coordinate || gesture || !input.reportValidity()) return;
  const before = structuredClone(contours), delta = Number(input.value) - coordinate.point[axis];
  const dx = axis === 'x' ? delta : 0, dy = axis === 'y' ? delta : 0;
  if (coordinate.part) moveHandle(coordinate.node, coordinate.part, dx, dy);
  else translate(contours, new Set([coordinate.node.id]), dx, dy);
  commit(before); input.value = String(Number(coordinate.point[axis].toFixed(3))); render();
});
$('coordinates').addEventListener('submit', e => { e.preventDefault(); (document.activeElement as HTMLElement)?.blur(); });
for (const name of ['lsb', 'width', 'rsb'] as const) field($<HTMLFormElement>('glyph-properties'), name).addEventListener('change', () => {
  const input = field($<HTMLFormElement>('glyph-properties'), name);
  if (gesture || !input.reportValidity() || input.value === '') return;
  const value = Number(input.value); if (!Number.isFinite(value)) return;
  settle(); const before = snapshot(), bounds = outlineBounds(contours);
  if (name === 'width') currentDrawing().width = value;
  else if (bounds && name === 'lsb') {
    const delta = value - bounds.left;
    translate(contours, new Set(contours.flatMap(c => c.nodes.map(n => n.id))), delta, 0);
    roundNodes(contours); currentDrawing().width = outlineBounds(contours)!.right + before.width - bounds.right;
  } else if (bounds) currentDrawing().width = bounds.right + value;
  commit(before.contours, before.annotations, before.width);
  const updated = outlineBounds(contours); input.value = String(Number((name === 'width' ? currentDrawing().width : name === 'lsb' ? updated!.left : currentDrawing().width - updated!.right).toFixed(3))); render();
});
function applyGlyphProperties() {
  const form = $<HTMLFormElement>('glyph-properties');
  const name = field(form, 'name').value.trim(), width = Number(field(form, 'width').value);
  const codes = field(form, 'unicodes').value.trim().split(/\s+/).filter(Boolean).map(s => s.replace(/^U\+/i, ''));
  const unicodes = [...new Set(codes.map(s => parseInt(s, 16)))];
  if (!name || /[\x00-\x1f\x7f]/.test(name) || project.glyphs.some(g => g.name === name && g.id !== project.activeGlyph) || !Number.isFinite(width) || codes.some(s => !/^[0-9a-f]{1,6}$/i.test(s)) || unicodes.some(u => u > 0x10ffff || (u >= 0xd800 && u <= 0xdfff))) {
    $('glyph-properties-error').textContent = '이름·Unicode·폭을 확인하세요.'; return;
  }
  settle();
  const slotCharacter = Array.from(editText)[activeSlot];
  Object.assign(activeGlyph(), { name, unicodes });
  if (!project.editMask) currentDrawing().width = width;
  if (slotCharacter && !unicodes.includes(slotCharacter.codePointAt(0)!)) {
    const chars = Array.from(editText);
    if (unicodes.length) { chars[activeSlot] = String.fromCodePoint(unicodes[0]); editText = chars.join(''); }
    else { editText = ''; activeSlot = 0; }
    $<HTMLInputElement>('text-run').value = editText;
  }
  $('glyph-properties-error').textContent = ''; persist(); render();
}
$('glyph-properties').addEventListener('submit', e => { e.preventDefault(); applyGlyphProperties(); });
for (const name of ['name', 'unicodes']) field($<HTMLFormElement>('glyph-properties'), name).addEventListener('change', applyGlyphProperties);
dialogs.querySelectorAll<HTMLElement>('[data-close]').forEach(b => b.addEventListener('click', () => $<HTMLDialogElement>(b.dataset.close!).close()));
fileDialog.addEventListener('cancel', e => { if (fileBusy) e.preventDefault(); });
function beginFile(text: string) {
  settle(); fileBusy = true; $('file-message').textContent = text;
  $<HTMLButtonElement>('file-close').disabled = true; fileDialog.showModal();
}
function endFile(text: string) {
  fileBusy = false; $('file-message').textContent = text; $<HTMLButtonElement>('file-close').disabled = false;
}
$('save-file').addEventListener('click', async () => {
  beginFile('UFOZ를 만드는 중…');
  try {
    const snapshot = structuredClone(project), data = await exportUFO(snapshot);
    const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
    const a = document.createElement('a'); a.href = url; a.download = `${snapshot.name.replace(/[\\/:*?"<>|]/g, '_')}.ufoz`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    endFile('UFOZ 다운로드를 요청했습니다. 다운로드 또는 파일 앱에서 확인하세요.');
  } catch (error) { endFile(`저장 실패: ${error instanceof Error ? error.message : String(error)}`); }
});
function downloadBackup(all: boolean) {
  beginFile('백업을 만드는 중…');
  try {
    const url = URL.createObjectURL(new Blob([projectBackup(all ? projects : [project])], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `${(all ? 'FontDraft-projects' : project.name).replace(/[\\/:*?"<>|]/g, '_')}.fontdraft.json`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    endFile('백업 다운로드를 요청했습니다. 파일 앱 또는 다운로드에서 확인하세요.');
  } catch (error) { endFile(`백업 실패: ${error instanceof Error ? error.message : String(error)}`); }
}
$('backup-input').addEventListener('change', async () => {
  const input = $<HTMLInputElement>('backup-input'), file = input.files?.[0]; input.value = '';
  if (!file) return;
  projectDialog.close(); beginFile('백업을 확인하는 중…');
  $<HTMLElement>('app').inert = true;
  try {
    if (file.size > 128 * 1024 * 1024) throw new Error('128MB 이하 파일만 열 수 있습니다.');
    const imported = readBackup(await file.text());
    await saveImportedProjects(imported);
    projects.push(...imported); activate(imported.at(-1)!); void updateStorageStatus(true);
    endFile('백업을 열었습니다.'); fileDialog.close();
  } catch (error) { endFile(`백업 열기 실패: ${error instanceof Error ? error.message : String(error)}`); }
  finally { $<HTMLElement>('app').inert = false; }
});
$('open-file').addEventListener('click', () => $<HTMLInputElement>('file-input').click());
$('file-input').addEventListener('change', async () => {
  const input = $<HTMLInputElement>('file-input'), file = input.files?.[0]; input.value = '';
  if (!file) return;
  projectDialog.close(); beginFile('UFOZ를 확인하는 중…');
  try {
    if (file.size > 32 * 1024 * 1024) throw new Error('32MB 이하 파일만 열 수 있습니다.');
    const next = await importUFO(new Uint8Array(await file.arrayBuffer()));
    projects.push(next); activate(next); void updateStorageStatus(true); endFile('프로젝트를 열었습니다.'); fileDialog.close();
  } catch (error) { endFile(`열기 실패: ${error instanceof Error ? error.message : String(error)}`); }
});

// Keep startup inert until the local draft is read, so early input cannot be overwritten.
$<HTMLElement>('app').inert = true;
void loadWorkspace().then(saved => {
  if (saved.projects.length) {
    projects = saved.projects; project = projects.find(p => p.id === saved.last) ?? projects[0]; contours = currentLayer().contours;
  }
  persist(); void updateStorageStatus(true);
}).catch(() => { $('save-status').textContent = '자동저장 복원 실패 · 파일 저장을 이용하세요'; $('save-status').setAttribute('data-error', 'true'); }).finally(() => {
  $<HTMLElement>('app').inert = false; editText = glyphCharacter(activeGlyph()); $<HTMLInputElement>('text-run').value = editText; renderWorkspace(); fit();
});

function applyBoolean(operation: 'unite' | 'subtract' = 'unite') {
  const before = structuredClone(contours), originalIds = new Set(contours.map(c => c.id));
  try {
    contours = combine(contours, operationSelection(), operation);
    const changed = JSON.stringify(before) !== JSON.stringify(contours);
    if (changed) selected = new Set(contours.flatMap(c => c.nodes.filter(n => !originalIds.has(c.id) || selected.has(n.id)).map(n => n.id)));
    commit(before); message = changed ? '' : '겹치는 선택 면이 없어 변경하지 않았습니다.';
  } catch {
    contours = before; message = '면 연산을 완료하지 못해 원래 윤곽선을 유지했습니다.';
  }
  render();
}
$('unite-selection').addEventListener('click', () => { cancel(); applyBoolean(); });
$('subtract-selection').addEventListener('click', () => { cancel(); applyBoolean('subtract'); });

function togglePreview() {
  previewMode = !previewMode; message = ''; render();
}
let previewPen: number | null = null, previewPenClickUntil = 0;
$('preview-mode').addEventListener('pointerdown', e => {
  const event = e as PointerEvent;
  if (event.pointerType === 'pen' && event.button === 0) { event.preventDefault(); previewPen = event.pointerId; }
});
$('preview-mode').addEventListener('pointerup', e => {
  const event = e as PointerEvent;
  if (event.pointerId === previewPen) { event.preventDefault(); previewPen = null; previewPenClickUntil = performance.now() + 500; togglePreview(); }
});
$('preview-mode').addEventListener('pointercancel', () => { previewPen = null; });
$('preview-mode').addEventListener('pointerleave', () => { previewPen = null; });
$('preview-mode').addEventListener('click', e => { if (performance.now() < previewPenClickUntil && ((e as PointerEvent).detail !== 0 || (e as PointerEvent).pointerType === 'pen')) return; togglePreview(); });
$('proof-invert').addEventListener('click', () => {
  const inverted = $('proof-panel').classList.toggle('inverted');
  $('proof-invert').setAttribute('aria-pressed', String(inverted));
});

// Consistent, platform-independent tool symbols.
const toolIcons: Record<string, string> = {
  'add-glyph': '<path d="M12 4v16 M4 12h16"/>',
  'mobile-add-glyph': '<path d="M12 4v16 M4 12h16"/>',
  'master-add': '<path d="M12 4v16 M4 12h16"/>',
  'master-duplicate': '<rect x="3" y="3" width="12" height="12"/><path d="M9 15v6h12V9h-6 6"/>',
  'master-delete': '<path d="M4 12h16"/>',
  'proof-toggle': '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  'proof-invert': '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
  'select-tool': '<path d="M5 3v16l4-5 4 7 3-2-4-6 6-1Z"/>',
  'pen-tool': '<path d="m12 3 7 12-7 6-7-6Z M12 3v9"/><circle cx="12" cy="14" r="2"/>',
  'brush-tool': '<path d="m14 4 6 3-8 11-5-3Z M7 15c-4 0-1 5-4 6 6 1 9-1 9-3"/>',
  'eraser-tool': '<path d="m14 4 7 6-10 11H7l-5-5Z M7 11l7 6 M11 21h10"/>',
  'rectangle-tool': '<rect x="4" y="4" width="16" height="16"/>',
  'ellipse-tool': '<ellipse cx="12" cy="12" rx="8" ry="8"/>',
  'overlap-tool': '<path d="M3 6l18 12V6L3 18Z"/><circle cx="3" cy="6" r="2"/><circle cx="21" cy="18" r="2"/>',
  'knife-tool': '<path d="m16 3 5 4-10 11-8.1 0ZM13 7l5 4"/>',
  'annotation-tool': '<path d="M4 4h16v13h-9l-5 4v-4H4Z M8 8h8 M8 12h6"/>',
  'pan-tool': '<path d="M12 2v20 M2 12h20 M8 6l4-4 4 4 M8 18l4 4 4-4 M6 8l-4 4 4 4 M18 8l4 4-4 4"/>',
  'flip-horizontal': '<path d="M12 2v20" stroke-dasharray="2 2"/><path d="m3 6 6 6-6 6Z M21 6l-6 6 6 6Z"/>',
  'flip-vertical': '<path d="M2 12h20" stroke-dasharray="2 2"/><path d="m6 3 6 6 6-6Z M6 21l6-6 6 6Z"/>',
  'unite-selection': '<path d="M3 3h11v7h7v11H10v-7H3Z" fill="currentColor" fill-opacity=".2"/>',
  'subtract-selection': '<path d="M3 3h11v7h-4v4H3Z" fill="currentColor" fill-opacity=".35"/><path d="M10 10h11v11H10Z" stroke-dasharray="2 2"/>',
  'slant-left': '<path d="M4 4h10l6 16H10Z"/>',
  'slant-right': '<path d="M10 4h10l-6 16H4Z"/>',
  'slant-down': '<path d="m4 4 16 6v10L4 14Z"/>',
  'slant-up': '<path d="m4 10 16-6v10L4 20Z"/>',
  'rotate-left': '<path d="M5 9a8 8 0 1 1 0 7 M5 3v6h6"/>',
  'rotate-right': '<path d="M19 9a8 8 0 1 0 0 7 M19 3v6h-6"/>',
  undo: '<path d="m8 4-5 5 5 5 M3 9h11a6 6 0 0 1 0 12"/>',
  redo: '<path d="m16 4 5 5-5 5 M21 9h-11a6 6 0 0 0 0 12"/>',
};
for (const [id, icon] of Object.entries(toolIcons)) $(id).innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;

function renderProof() {
  const viewport = $('proof-viewport');
  const height = viewport.clientHeight; if (!height) return;
  const top = metrics().ascender + 100, bottom = metrics().descender - 100;
  const scale = height / (top - bottom);
  const slots = runLayout();
  const proofContours = (glyph: Glyph) => glyph.id === project.activeGlyph ? contours : project.editMask ? drawing(project, glyph).mask?.contours ?? [] : drawing(project, glyph).contours;
  let left = 0, right = slots.reduce((w, s) => w + s.width, 0);
  for (const slot of slots) {
    const bounds = outlineBounds(slot.glyph ? proofContours(slot.glyph) : []);
    if (bounds) { left = Math.min(left, slot.x + bounds.left); right = Math.max(right, slot.x + bounds.right); }
  }
  const width = Math.max(viewport.clientWidth, (right - left) * scale + 48);
  const origin = (width - (right + left) * scale) / 2, y = (height + (top + bottom) * scale) / 2;
  $('proof-canvas').setAttribute('width', String(width)); $('proof-canvas').setAttribute('height', String(height));
  $('proof-fill').setAttribute('d', slots.map(slot => (slot.glyph ? proofContours(slot.glyph) : []).filter(c => c.closed).map(c => pathData(c, { x: origin + slot.x * scale, y, scale })).join(' ')).join(' '));


}
new ResizeObserver(renderProof).observe($('proof-viewport'));
$('proof-toggle').addEventListener('click', () => {
  const closed = $('proof-panel').classList.toggle('collapsed');
  $('proof-toggle').setAttribute('aria-expanded', String(!closed));
  $<HTMLElement>('proof-viewport').hidden = closed;
  $<HTMLElement>('proof-resize').hidden = closed;
  document.querySelector<HTMLElement>('.editor-column')!.classList.toggle('proof-collapsed', closed);
});
let panelResize: { id: number; y: number; height: number } | null = null;
const proofResize = $<HTMLElement>('proof-resize');
function setProofHeight(height: number) {
  const column = document.querySelector<HTMLElement>('.editor-column')!;
  const max = Math.max(120, column.clientHeight * .55);
  const next = Math.max(120, Math.min(max, height));
  column.style.setProperty('--proof-height', `${next}px`);
  proofResize.setAttribute('aria-valuemax', String(Math.round(max)));
  proofResize.setAttribute('aria-valuenow', String(Math.round(next)));
}
proofResize.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault(); cancel();
  panelResize = { id: e.pointerId, y: e.clientY, height: $('proof-panel').getBoundingClientRect().height };
  proofResize.setPointerCapture(e.pointerId);
});
proofResize.addEventListener('pointermove', e => { if (panelResize?.id === e.pointerId) setProofHeight(panelResize.height + panelResize.y - e.clientY); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) proofResize.addEventListener(type, () => { panelResize = null; });
proofResize.addEventListener('keydown', e => {
  if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation(); setProofHeight($('proof-panel').getBoundingClientRect().height + (e.key === 'ArrowUp' ? 20 : -20));
});
let canvasSize = { width: canvas.clientWidth, height: canvas.clientHeight };
new ResizeObserver(() => {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  view.x += (width - canvasSize.width) / 2; view.y += (height - canvasSize.height) / 2;
  canvasSize = { width, height }; render();
}).observe(canvas);

function handleKey(id: string, part: string) { return `${id}:${part}`; }
function clearSelection() { selected.clear(); selectedSegments.clear(); selectedHandles.clear(); }
function hasSelection() { return !!(selected.size + selectedSegments.size + selectedHandles.size); }
function selectContour(contour: Contour, remove = false) {
  for (const n of contour.nodes) {
    if (remove) selected.delete(n.id); else if (!hiddenViews.has('nodes')) selected.add(n.id);
    for (const part of ['incoming', 'outgoing'] as const) if (n[part]) {
      const key = handleKey(n.id, part);
      if (remove) selectedHandles.delete(key); else if (!hiddenViews.has('handles')) selectedHandles.add(key);
    }
  }
}
function nodeSelection() {
  const result = new Set(selected);
  for (const c of contours) c.nodes.forEach((n, i) => { if (selectedSegments.has(n.id)) { result.add(n.id); result.add(c.nodes[(i + 1) % c.nodes.length].id); } });
  return result;
}
function coordinateSelection() {
  if (selectedSegments.size || selected.size + selectedHandles.size !== 1) return null;
  for (const c of contours) for (const node of c.nodes) {
    if (selected.has(node.id)) return { node, point: node, part: null };
    for (const part of ['incoming', 'outgoing'] as const) {
      if (node[part] && selectedHandles.has(handleKey(node.id, part))) return { node, point: node[part]!, part };
    }
  }
  return null;
}
function operationSelection() {
  const result = nodeSelection();
  for (const c of contours) for (const n of c.nodes) if (selectedHandles.has(handleKey(n.id, 'incoming')) || selectedHandles.has(handleKey(n.id, 'outgoing'))) result.add(n.id);
  return result;
}
function moveSelection(dx: number, dy: number, constrained = false) {
  const nodes = nodeSelection();
  if (constrained) { for (const c of contours) for (const n of c.nodes) if (nodes.has(n.id)) moveOnAxis(n, 'node', dx, dy); }
  else translate(contours, nodes, dx, dy);
  for (const c of contours) for (const n of c.nodes) if (!nodes.has(n.id)) {
    const both = selectedHandles.has(handleKey(n.id, 'incoming')) && selectedHandles.has(handleKey(n.id, 'outgoing'));
    for (const part of ['incoming', 'outgoing'] as const) if (selectedHandles.has(handleKey(n.id, part))) { if (constrained) moveOnAxis(n, part, dx, dy); else moveHandle(n, part, dx, dy, !both); }
  }
}
function shapeStart(g: Gesture) {
  const p = glyphPoint(g.start, g.view);
  return g.additive ? { x: Math.round(p.x), y: Math.round(p.y) } : p;
}
function shapeEnd(g: Gesture, end: Point) {
  const p = glyphPoint(end, g.view), a = shapeStart(g);
  if (!g.additive) return p;
  const size = Math.round(Math.max(Math.abs(p.x - a.x), Math.abs(p.y - a.y)));
  return { x: a.x + (p.x < a.x ? -size : size), y: a.y + (p.y < a.y ? -size : size) };
}
function penHit(point: Point): Hit | null {
  const node = hiddenViews.has('nodes') ? null : hitTest(contours, new Set(), point, view, ['node']);
  return node ?? segmentHit(contours, glyphPoint(point, view), 16 / view.scale);
}
function renderCursor() {
  canvas.style.cursor = cursor ? 'none' : tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  if (!cursor) { $('brush-cursor').innerHTML = ''; return; }
  const icon = (x: number, y: number, size = 20) => `<svg class="cursor-icon" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24">${toolIcons[`${tool}-tool`]}</svg>`;
  const cross = '<path d="M-10 0h7 M3 0h7 M0-10v7 M0 3v7"/><circle r="1"/>';
  let content: string;
  if (tool === 'brush' || tool === 'eraser') {
    const tip = gesture?.tip ?? tips[tool], rx = tip.size * view.scale / 2, ry = rx * tip.ratio, a = tip.angle * Math.PI / 180, hintAngle=30, offset = 5;
    // 1. 각도를 라디안으로 변환
    const thetaH = (hintAngle * Math.PI) / 180;
    // 2. 타원 관점에서의 상대적인 각도 계산 (절대각 b - 타원회전각 a)
    const relativeTheta = thetaH + a;
    // 3. 상대 각도를 이용해 타원 중심에서 표면까지의 거리 R 계산
    const cosRel = Math.cos(relativeTheta), sinRel = Math.sin(relativeTheta);
    const denominator = Math.sqrt(Math.pow(ry * cosRel, 2) + Math.pow(rx * sinRel, 2));
    const R = (rx * ry) / denominator;
    // 4. hintAngle 방향으로 (R + offset)만큼 나아간 최종 좌표 산출
    const right = (R + offset) * Math.cos(thetaH);
    const bottom = (R + offset) * Math.sin(thetaH);
    content = `<ellipse rx="${rx}" ry="${ry}" transform="rotate(${-tip.angle})"/><path d="M-3 0h6 M0-3v6"/>${icon(right, bottom, 18)}`;
  } else if (['rectangle', 'ellipse', 'overlap'].includes(tool)) content = cross + icon(5, 5, tool === 'ellipse' ? 18 : 16);
  else if (tool === 'knife') content = '<circle r="2.5" fill="white"/>' + icon(-2.5, -15);
  else if (tool === 'select') content = icon(-4, 0);
  else if (tool === 'pen') content = icon(-12, -2.5);
  else content = icon(-12, -12);
  const hit = tool === 'pen' && !penDraft ? penHit(cursor) : null;
  const hint = hit?.part === 'node' ? '−' : hit?.part === 'segment' ? '+' : '';
  $('brush-cursor').innerHTML = `<g class="tool-cursor" data-tool="${tool}" transform="translate(${cursor.x} ${cursor.y})">${content}${hint ? `<text class="cursor-hint" x="15" y="-8">${hint}</text>` : ''}</g>`;
}
canvas.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') { cursor = local(e); renderCursor(); } });
canvas.addEventListener('pointercancel', () => { cursor = null; renderCursor(); });

canvas.addEventListener('pointerleave', () => { cursor = null; renderCursor(); });

const inspector = document.querySelector<HTMLElement>('.inspector')!;
const sidebar = document.createElement('div'); sidebar.className = 'sidebar';
inspector.before(sidebar); sidebar.append(inspector);
const editingKeys = document.createElement('section'); editingKeys.id = 'editing-keys'; editingKeys.setAttribute('aria-label', '편집 키');
editingKeys.append($('modifier'), $('option-modifier'), $('delete-selection'), inspector.querySelector('.nudge')!);
sidebar.append(editingKeys);
for (const panel of inspector.querySelectorAll<HTMLElement>('.inspector-panel')) {
  const heading = panel.querySelector<HTMLElement>('h2')!;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'panel-toggle';
  const label = document.createElement('span'); label.textContent = heading.textContent;
  button.append(label); heading.replaceChildren(button);
  const key = `fontdraft.panelCollapsed.${heading.id}`;
  const setCollapsed = (collapsed: boolean) => { panel.classList.toggle('panel-collapsed', collapsed); button.setAttribute('aria-expanded', String(!collapsed)); };
  try { setCollapsed(localStorage.getItem(key) === 'true'); } catch { setCollapsed(false); }
  button.addEventListener('click', () => {
    const collapsed = !panel.classList.contains('panel-collapsed'); setCollapsed(collapsed);
    try { localStorage.setItem(key, String(collapsed)); } catch { /* Session preference only. */ }
  });
}

// Resize from the edge facing the canvas; keep the preferred width across viewport changes.
for (const [panel, key, minimum, fraction] of [
  [sidebar, 'sidebar', 208, .4],
  [document.querySelector<HTMLElement>('.glyphs')!, 'glyphs', 96, .25],
] as const) {
  const grip = document.createElement('div');
  grip.className = 'panel-resize'; grip.tabIndex = 0;
  grip.setAttribute('role', 'separator'); grip.setAttribute('aria-orientation', 'vertical');
  grip.setAttribute('aria-label', key === 'sidebar' ? '사이드패널 폭' : '글리프 목록 폭');
  panel.append(grip);
  let preferred: number = minimum;
  try { const saved = Number(localStorage.getItem(`fontdraft.${key}Width`)); if (saved >= minimum) preferred = saved; } catch { /* Session preference only. */ }
  const applyWidth = () => {
    const maximum = Math.max(minimum, Math.floor(document.documentElement.clientWidth * fraction));
    const width = Math.round(Math.max(minimum, Math.min(maximum, preferred)));
    panel.style.setProperty('--panel-width', `${width}px`);
    grip.setAttribute('aria-valuemin', String(minimum)); grip.setAttribute('aria-valuemax', String(maximum)); grip.setAttribute('aria-valuenow', String(width));
    return width;
  };
  const saveWidth = () => { try { localStorage.setItem(`fontdraft.${key}Width`, String(preferred)); } catch { /* Session preference only. */ } };
  const direction = () => (key === 'sidebar') !== $('app').classList.contains('sidebar-left') ? -1 : 1;
  let drag: { id: number; x: number; width: number; preferred: number; direction: number } | null = null;
  grip.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    e.preventDefault(); cancel();
    drag = { id: e.pointerId, x: e.clientX, width: panel.getBoundingClientRect().width, preferred, direction: direction() };
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', e => {
    if (drag?.id !== e.pointerId) return;
    preferred = drag.width + (e.clientX - drag.x) * drag.direction;
    preferred = applyWidth();
  });
  grip.addEventListener('pointerup', e => { if (drag?.id === e.pointerId) { drag = null; saveWidth(); } });
  for (const type of ['pointercancel', 'lostpointercapture']) grip.addEventListener(type, () => {
    if (drag) { preferred = drag.preferred; drag = null; applyWidth(); }
  });
  grip.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    preferred = applyWidth() + (e.key === 'ArrowRight' ? 16 : -16) * direction();
    preferred = applyWidth(); saveWidth();
  });
  window.addEventListener('resize', applyWidth); applyWidth();
}

const keyIcon = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
$('modifier').querySelector('span')!.innerHTML = keyIcon('<path d="m12 3 9 9h-5v9H8v-9H3Z"/>');
$('option-modifier').querySelector('span')!.innerHTML = keyIcon('<path d="M3 5h6l7 14h5 M15 5h6"/>');
$('delete-selection').innerHTML = keyIcon('<path d="M9 5h12v14H9l-7-7Z M12 9l6 6 M18 9l-6 6"/>') + '<small>Delete</small>';
for (const button of editingKeys.querySelectorAll<HTMLButtonElement>('[data-nudge]')) {
  const [x, y] = button.dataset.nudge!.split(',').map(Number), angle = x === 1 ? 90 : x === -1 ? -90 : y === -1 ? 180 : 0;
  button.innerHTML = keyIcon(`<path d="M12 20V4 M5 11l7-7 7 7" transform="rotate(${angle} 12 12)"/>`);
}
let pendingAnnotation: Annotation | null = null;
let annotationBefore: Snapshot | null = null;
function showAnnotation(annotation: Annotation, fresh: boolean) {
  if (fresh) pendingAnnotation = annotation;
  renderAnnotations();
  document.querySelector<HTMLTextAreaElement>(`[data-note-id="${CSS.escape(annotation.id)}"] textarea`)?.focus();
}
function renderAnnotations() {
  $('annotation-notes').toggleAttribute('hidden', runLayout()[activeSlot]?.glyph?.id !== project.activeGlyph);
  const list = [...annotations(), ...(pendingAnnotation ? [pendingAnnotation] : [])];
  const container = $('annotation-notes');
  for (const el of [...container.children] as HTMLElement[]) if (!list.some(a => a.id === el.dataset.noteId)) el.remove();
  for (const a of list) {
    let box = [...container.children].find(el => (el as HTMLElement).dataset.noteId === a.id) as HTMLElement | undefined;
    if (!box) {
      box = document.createElement('div'); box.className = 'annotation-note'; box.dataset.noteId = a.id;
      const input = document.createElement('textarea'); input.maxLength = 2000; input.setAttribute('aria-label', '주석 내용'); input.placeholder = '주석';
      input.addEventListener('focus', () => { annotationBefore = snapshot(); });
      input.addEventListener('blur', commitAnnotation);
      const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', '주석 삭제');
      remove.addEventListener('click', () => { const before = snapshot(); if (pendingAnnotation?.id === a.id) pendingAnnotation = null; currentLayer().annotations = annotations().filter(n => n.id !== a.id); commit(before.contours, before.annotations); render(); });
      let drag: { id: number; x: number; y: number; start: Point; scale: number; before: Snapshot } | null = null;
      box.addEventListener('pointerdown', e => {
        if (tool !== 'select' || e.button !== 0 || (e.target as Element).closest('button') || gesture || strokes.length || cancelAnnotationDrag) return;
        if (e.pointerType === 'touch' && !fingerTools.checked) return;
        e.preventDefault(); e.stopPropagation();
        input.blur();
        const note = annotations().find(n => n.id === a.id); if (!note) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: { x: note.x, y: note.y }, scale: view.scale, before: snapshot() };
        cancelAnnotationDrag = () => {
          const note = annotations().find(n => n.id === a.id); if (note && drag) Object.assign(note, drag.start);
          drag = null; cancelAnnotationDrag = null; renderAnnotations();
        };
        box!.setPointerCapture(e.pointerId);
      });
      box.addEventListener('pointermove', e => {
        if (drag?.id !== e.pointerId) return;
        const note = annotations().find(n => n.id === a.id); if (!note) return;
        note.x = Math.round(drag.start.x + (e.clientX - drag.x) / drag.scale);
        note.y = Math.round(drag.start.y - (e.clientY - drag.y) / drag.scale);
        renderAnnotations();
      });
      box.addEventListener('pointerup', e => {
        if (drag?.id !== e.pointerId) return;
        const before = drag.before; drag = null; cancelAnnotationDrag = null; commit(before.contours, before.annotations); render();
      });
      for (const event of ['pointercancel', 'lostpointercapture']) box.addEventListener(event, () => {
        if (!drag) return;
        cancelAnnotationDrag?.();
      });
      box.append(input, remove); container.append(box);
    }
    const input = box.querySelector('textarea')!;
    if (document.activeElement !== input) input.value = a.text;
    const p = screenPoint(a, view); box.style.left = `${p.x}px`; box.style.top = `${p.y}px`;
  }
}
function commitAnnotation() {
  const container = $('annotation-notes');
  const before = annotationBefore ?? snapshot(); let changed = false;
  for (const box of [...container.children] as HTMLElement[]) {
    const text = box.querySelector('textarea')!.value.trim();
    const a = annotations().find(a => a.id === box.dataset.noteId) ?? (pendingAnnotation?.id === box.dataset.noteId ? pendingAnnotation : null);
    if (!a || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(text)) continue;
    if (a === pendingAnnotation) { if (text) { currentLayer().annotations = [...annotations(), { ...a, text }]; changed = true; } pendingAnnotation = null; }
    else if (a.text !== text) { currentLayer().annotations = text ? annotations().map(n => n.id === a.id ? { ...n, text } : n) : annotations().filter(n => n.id !== a.id); changed = true; }
  }
  annotationBefore = null;
  if (changed) { commit(before.contours, before.annotations); render(); }
  else renderAnnotations();
}

function glyphCharacter(g: Glyph) { return g.unicodes.length ? String.fromCodePoint(g.unicodes[0]) : ''; }
function runLayout() {
  let x = 0;
  const chars = editText ? Array.from(editText) : [''];
  return chars.map(ch => {
    const glyph = ch ? project.glyphs.find(g => g.unicodes.includes(ch.codePointAt(0)!)) : activeGlyph();
    const width = glyph ? drawing(project, glyph).width : project.upm * .6;
    const slot = { glyph, ch, x, width }; x += width; return slot;
  });
}
const placeholderContext = document.createElement('canvas').getContext('2d')!;
const placeholderMeasurements = new Map<string, TextMetrics>();
function placeholderText(ch: string, width: number, v: View) {
  if (!ch.trim()) return '';
  const measure = (text: string) => {
    let value = placeholderMeasurements.get(text);
    if (!value) { placeholderContext.font = '1000px sans-serif'; value = placeholderContext.measureText(text); placeholderMeasurements.set(text, value); }
    return value;
  };
  const m = metrics(), reference = /^[a-z]$/.test(ch) ? 'x' : /^[A-Z]$/.test(ch) ? 'H' : ch;
  const bounds = measure(ch), height = measure(reference).actualBoundingBoxAscent;
  const target = reference === 'x' ? m.xHeight : m.capHeight;
  let ratio = Math.max(1, Math.min(target, m.ascender)) / Math.max(1, height);
  if (m.descender < 0 && bounds.actualBoundingBoxDescent > 0) ratio = Math.min(ratio, -m.descender / bounds.actualBoundingBoxDescent);
  const inkWidth = bounds.actualBoundingBoxLeft + bounds.actualBoundingBoxRight;
  ratio = Math.min(ratio, Math.max(1, width) / Math.max(1, inkWidth));
  const x = v.x + (width / 2 + (bounds.actualBoundingBoxLeft - bounds.actualBoundingBoxRight) * ratio / 2) * v.scale;
  return `<text class="glyph-placeholder" x="${x}" y="${v.y}" font-size="${1000 * ratio * v.scale}" aria-hidden="true">${escapeXML(ch)}</text>`;
}
function renderNeighbors() {
  const slots = runLayout(), origin = slots[activeSlot]?.x ?? 0;
  return slots.map((s, i) => {
    const v = { ...view, x: view.x + (s.x - origin) * view.scale };
    if (!s.glyph || !foreground(s.glyph).some(c => c.nodes.length)) return placeholderText(s.ch || (s.glyph ? glyphCharacter(s.glyph) : ''), s.width, v);
    if (i === activeSlot && s.glyph.id === project.activeGlyph) return '';
    return `<path class="neighbor-fill" data-slot="${i}" fill-rule="nonzero" d="${(foreground(s.glyph)).filter(c => c.closed).map(c => pathData(c, v)).join(' ')}"/>`;
  }).join('');
}
function slotAt(p: Point) {
  const slots = runLayout(), origin = slots[activeSlot]?.x ?? 0, point = glyphPoint(p, view);
  if (point.y < metrics().descender - 30 || point.y > metrics().ascender + 30) return -1;
  return slots.findIndex(s => point.x + origin >= s.x && point.x + origin < s.x + Math.max(1, s.width));
}
function activateSlot(index: number) {
  const slots = runLayout(), slot = slots[index]; if (!slot) return;
  if (!slot.glyph) { showGlyph(); field(glyphForm, 'characters').value = slot.ch; return; }
  const offset = (slot.x - (slots[activeSlot]?.x ?? 0)) * view.scale;
  activeSlot = index; activate(project, slot.glyph.id, true); view.x += offset; render();
}
$('text-run').addEventListener('input', () => {
  settle(); editText = $<HTMLInputElement>('text-run').value;
  const slots = runLayout(), found = slots.findIndex(s => s.glyph?.id === project.activeGlyph);
  activeSlot = found >= 0 ? found : 0;
  if (found < 0 && slots[0]?.glyph) activate(project, slots[0].glyph.id, true);
  render();
});

function metricBadge(text: string, x: number, y: number, align: 'start' | 'middle' | 'end') {
  const width = text.length * 6 + 12, left = align === 'middle' ? -width / 2 : align === 'end' ? -width : 0;
  return `<g class="metric-badge" transform="translate(${x} ${y})"><rect x="${left}" y="-11" width="${width}" height="22" rx="2"/><text x="${left + 6}" y="3">${escapeXML(text)}</text></g>`;
}

$('export-image').addEventListener('click', () => {
  settle(); projectDialog.close(); $<HTMLTextAreaElement>('image-text').value = editText || glyphCharacter(activeGlyph());
  $('image-error').textContent = ''; $<HTMLDialogElement>('image-dialog').showModal();
});
$('image-form').addEventListener('submit', async e => {
  e.preventDefault(); const button = $<HTMLButtonElement>('image-download'); button.disabled = true;
  try {
    const result = textImage(project, $<HTMLTextAreaElement>('image-text').value, Number($<HTMLInputElement>('image-height').value));
    const format = $<HTMLSelectElement>('image-format').value;
    const blob = format === 'png' ? await pngImage(result.svg, result.width, result.height) : new Blob([result.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `FontDraft.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
    $('image-error').textContent = '';
  } catch (error) { $('image-error').textContent = error instanceof Error ? error.message : '이미지를 만들지 못했습니다.'; }
  finally { button.disabled = false; }
});

let clipboard: Contour[] = [];
function copySelection(cut = false) {
  clipboard = copyContours(contours, nodeSelection());
  if (cut && clipboard.length) removeSelection();
}
function pasteSelection(source = clipboard) {
  if (!source.length) return;
  const before = structuredClone(contours), added = freshContours(source);
  contours.push(...added); clearSelection(); added.forEach(c => selectContour(c)); commit(before); render();
}
function duplicateSelectedNodes() {
  if (!editable() || !selected.size) return;
  const before = structuredClone(contours), result = duplicateNodes(contours, selected);
  contours = result.contours; clearSelection(); selected = result.duplicated;
  commit(before); render();
}
function invertSelection() {
  const segmentsOnly = selectedSegments.size > 0 && selected.size === 0 && selectedHandles.size === 0;
  const nodes = nodeSelection(), handles = new Set(selectedHandles), segments = new Set(selectedSegments);
  clearSelection();
  for (const c of contours) for (let i = 0; i < c.nodes.length; i++) {
    const n = c.nodes[i];
    if (segmentsOnly) { if (!segments.has(n.id) && (c.closed || i < c.nodes.length - 1)) selectedSegments.add(n.id); continue; }
    if (!nodes.has(n.id) && !hiddenViews.has('nodes')) selected.add(n.id);
    for (const part of ['incoming', 'outgoing'] as const) if (n[part] && !handles.has(handleKey(n.id, part)) && !hiddenViews.has('handles')) selectedHandles.add(handleKey(n.id, part));
  }
  render();
}

function maskCommand(swap: boolean) {
  settle();
  if (swap) {
    const data = currentDrawing(), other = structuredClone(project.editMask ? { contours: data.contours, annotations: data.annotations } : data.mask ?? { contours: [] });
    const active = { contours: structuredClone(contours), annotations: structuredClone(annotations()) };
    undo.push({ ...snapshot(), other, otherExpected: JSON.stringify(active) }); redo.length = 0;
    if (project.editMask) { data.contours = active.contours; data.annotations = active.annotations; }
    else data.mask = active;
    contours = other.contours; currentLayer().annotations = other.annotations ?? [];
    clearSelection(); persist(); render();
  } else {
    changeLayer(() => { project.editMask = true; });
    const before = snapshot(); contours = []; currentLayer().annotations = []; clearSelection(); commit(before.contours, before.annotations, before.width); render();
  }
}
function duplicateGlyph() {
  const source = activeGlyph(), g = structuredClone(source); g.id = newId(); g.unicodes = [];
  let name = `${source.name}.copy`, i = 2; while (project.glyphs.some(g => g.name === name)) name = `${source.name}.copy${i++}`; g.name = name;
  changeLayer(() => {
    project.glyphs.push(g);
    for (const m of project.masters ?? []) m.glyphs[g.id] = structuredClone(drawing(project, source, m.id));
    project.activeGlyph = g.id; editText = glyphCharacter(g); activeSlot = 0;
  }); fit();
}
function removeGlyph() {
  if (project.glyphs.length < 2 || !confirm(`“${activeGlyph().name}” 글리프를 모든 마스터에서 삭제할까요? 이 삭제는 되돌릴 수 없습니다.`)) return;
  changeLayer(() => { const id = project.activeGlyph; project.glyphs = project.glyphs.filter(g => g.id !== id); for (const m of project.masters ?? []) delete m.glyphs[id]; project.activeGlyph = project.glyphs[0].id; editText = glyphCharacter(activeGlyph()); activeSlot = 0; for (const key of histories.keys()) if (key.includes(`:${id}:`)) histories.delete(key); }); fit();
}
function contourCommand(command: 'start' | 'break' | 'join' | 'loop' | 'overlap' | 'extrema') {
  if (gesture || penDraft || strokes.length) return;
  const before = structuredClone(contours);
  try {
    if (command === 'extrema') {
      const ids = operationSelection();
      contours = contours.map(c => !ids.size || c.nodes.some(n => ids.has(n.id)) ? addExtrema(c) : c);
    } else if (command === 'start') {
      if (selected.size !== 1) throw new Error('시작점으로 쓸 노드 하나를 선택하세요.');
      const c = contours.find(c => c.nodes.some(n => selected.has(n.id)))!;
      if (!c.closed) throw new Error('닫힌 컨투어에서 시작점을 설정하세요.');
      const index = c.nodes.findIndex(n => selected.has(n.id)); c.nodes = [...c.nodes.slice(index), ...c.nodes.slice(0, index)];
    } else if (command === 'break') { for (const id of selected) contours = breakAtNode(contours, id); }
    else if (command === 'join') contours = joinNodes(contours, selected);
    else if (command === 'loop') { if (!selected.size) throw new Error('모서리 노드를 선택하세요.'); for (const id of selected) contours = contours.map(c => c.nodes.some(n => n.id === id) ? loopCorner(c, id) : c); }
    else contours = makeOverlap(contours, selected);
    commit(before); message = '';
  } catch (error) { contours = before; message = (error as Error).message; }
  render();
}

const hiddenViews = new Set<string>();
type MenuItem = { label: string; action?: () => void; enabled?: () => boolean; checked?: () => boolean; children?: MenuItem[] } | null;
const clickCommand = (id: string) => () => $<HTMLButtonElement>(id).click();
const editable = () => !gesture && !penDraft && !strokes.length;
const selectionAvailable = () => editable() && hasSelection();
const viewItems: [string, string][] = [['nodes','노드'],['handles','핸들'],['baselines','기준선'],['metrics','메트릭'],['annotations','주석'],['glyphs','글리프 목록'],['sidebar','사이드 패널']];
const menus: [string, MenuItem[]][] = [
  ['파일', [{ label: '프로젝트 관리…', action: clickCommand('project-menu') }, { label: '새 프로젝트', action: () => { settle(); projectFields(true); projectDialog.showModal(); } }, { label: '열기…', action: clickCommand('open-file') }, { label: '저장', action: clickCommand('save-file') }, null, { label: '프로젝트 백업…', action: () => downloadBackup(false) }, { label: '전체 프로젝트 백업…', action: () => downloadBackup(true) }, { label: '백업 열기…', action: () => $<HTMLInputElement>('backup-input').click() }, null, { label: '이미지 내보내기…', action: clickCommand('export-image') }, { label: '설정…', action: clickCommand('project-menu') }]],
  ['편집', [{ label: '실행 취소', action: () => history(true), enabled: () => !!undo.length }, { label: '다시 실행', action: () => history(false), enabled: () => !!redo.length }, null,
    { label: '잘라내기', action: () => copySelection(true), enabled: selectionAvailable }, { label: '복사', action: () => copySelection(), enabled: selectionAvailable }, { label: '붙여넣기', action: () => pasteSelection(), enabled: () => editable() && !!clipboard.length }, { label: '복제', action: () => pasteSelection(copyContours(contours, nodeSelection())), enabled: selectionAvailable }, null,
    { label: '전체 선택', action: () => { clearSelection(); contours.forEach(c => selectContour(c)); render(); }, enabled: editable }, { label: '선택 해제', action: () => { clearSelection(); render(); } }, { label: '선택 반전', action: invertSelection, enabled: editable }, null, { label: '자유변형', action: () => { $<HTMLButtonElement>('select-tool').click(); freeTransform = true; render(); }, enabled: selectionAvailable }]],
  ['폰트', [{ label: '새 글리프…', action: showGlyph }, { label: '글리프 복제', action: duplicateGlyph }, { label: '글리프 삭제', action: removeGlyph, enabled: () => project.glyphs.length > 1 }, null,
    { label: '마스터', children: [{ label: '새 마스터', action: clickCommand('master-add') }, { label: '마스터 복제', action: clickCommand('master-duplicate') }, { label: '이름 변경', action: () => { hiddenViews.delete('sidebar'); $('app').classList.remove('hide-sidebar'); $('master-list').scrollIntoView(); editMasterName(); } }, { label: '마스터 삭제', action: clickCommand('master-delete'), enabled: () => !!project.masters?.length }, { label: '기준선…', action: clickCommand('master-metrics') }] },
    { label: '배경', children: [{ label: '배경 편집', action: () => changeLayer(() => { project.editMask = !project.editMask; }), checked: () => !!project.editMask }, { label: '전경을 배경으로 복사', action: clickCommand('copy-to-mask') }, { label: '전경으로 붙여넣기', action: clickCommand('copy-to-foreground') }, { label: '전경과 배경 전환', action: () => maskCommand(true) }, { label: '배경 비우기', action: () => maskCommand(false) }] }]],
  ['컨투어', [{ label: '극점 추가', action: () => contourCommand('extrema'), enabled: editable }, null, { label: '노드 복제', action: duplicateSelectedNodes, enabled: () => editable() && !!selected.size }, null, { label: '시작점 설정', action: () => contourCommand('start'), enabled: () => editable() && selected.size === 1 }, { label: '방향 반전', action: clickCommand('reverse-contours'), enabled: selectionAvailable }, null,
    { label: '끊기', action: () => contourCommand('break'), enabled: () => editable() && !!selected.size }, { label: '잇기', action: () => contourCommand('join'), enabled: () => editable() && selected.size === 2 }, null,
    { label: '오버랩 제거', action: () => { if (editable()) { if (!hasSelection()) contours.forEach(c => selectContour(c)); applyBoolean(); } }, enabled: editable }, { label: '오버랩 만들기', action: () => contourCommand('overlap'), enabled: () => editable() && selected.size === 2 }, { label: '모서리 루프', action: () => contourCommand('loop'), enabled: () => editable() && !!selected.size }]],
  ['보기', [{ label: 'UI 좌우 반전', checked: () => $('app').classList.contains('sidebar-left'), action: () => { const left = $('app').classList.toggle('sidebar-left'); try { localStorage.setItem('fontdraft.sidebarLeft', String(left)); } catch { /* Session preference only. */ } } }, null, ...viewItems.map(([key, label]) => ({ label, checked: () => !hiddenViews.has(key), action: () => { const hidden = !hiddenViews.has(key); if (hidden) hiddenViews.add(key); else hiddenViews.delete(key); $('app').classList.toggle(`hide-${key}`, hidden); if (key === 'nodes' && hidden) selected.clear(); if (key === 'handles' && hidden) selectedHandles.clear(); render(); } })),
    { label: '배경', checked: () => project.maskVisible !== false, action: () => { project.maskVisible = project.maskVisible === false; persist(); render(); } }, { label: '미리보기 패널', checked: () => !$('proof-panel').classList.contains('collapsed'), action: clickCommand('proof-toggle') }]],
];
const menuRoot = $('app-menus');
function closeMenus() { menuRoot.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open')); }
for (const [label, items] of menus) {
  const detail = document.createElement('details'), summary = document.createElement('summary'), popup = document.createElement('div');
  summary.textContent = label; popup.className = 'menu-popup'; detail.append(summary, popup); menuRoot.append(detail);
  const buttons: { button: HTMLButtonElement; item: Exclude<MenuItem, null> }[] = [];
  const populate = (parent: HTMLElement, entries: MenuItem[]) => { for (const item of entries) {
    if (!item) { parent.append(document.createElement('hr')); continue; }
    if (item.children) { const d = document.createElement('details'), s = document.createElement('summary'), body = document.createElement('div'); s.textContent = item.label; d.append(s, body); parent.append(d); populate(body, item.children); continue; }
    const button = document.createElement('button'); button.textContent = item.label; button.setAttribute('aria-label', item.label);
    button.addEventListener('click', () => { closeMenus(); item.action?.(); }); parent.append(button); buttons.push({ button, item });
  } };
  populate(popup, items);
  detail.addEventListener('toggle', () => { if (!detail.open) return; for (const other of menuRoot.children) if (other !== detail) other.removeAttribute('open');
    for (const { button, item } of buttons) { button.disabled = item.enabled ? !item.enabled() : false; if (item.checked) button.setAttribute('aria-pressed', String(item.checked())); }
    popup.style.left = `${Math.max(4, Math.min(summary.getBoundingClientRect().left, innerWidth - popup.offsetWidth - 4))}px`;
  });
}
const sidebarToggle = document.createElement('button');
sidebarToggle.id = 'sidebar-toggle'; sidebarToggle.setAttribute('aria-label', '사이드패널 표시'); sidebarToggle.title = '사이드패널 표시/숨김';
sidebarToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="18" height="16" rx="1"/><path d="M15 4v16"/></svg>';
sidebarToggle.setAttribute('aria-pressed', 'true'); menuRoot.append(sidebarToggle);
sidebarToggle.addEventListener('click', () => { const hidden = !hiddenViews.has('sidebar'); if (hidden) hiddenViews.add('sidebar'); else hiddenViews.delete('sidebar'); $('app').classList.toggle('hide-sidebar', hidden); render(); });
try { $('app').classList.toggle('sidebar-left', localStorage.getItem('fontdraft.sidebarLeft') === 'true'); } catch { /* Session preference only. */ }
document.addEventListener('pointerdown', e => { if (!(e.target as Element).closest('#app-menus')) closeMenus(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });

function visibleHit(point: Point, selection = new Set<string>()): Hit | null {
  return hitTest(contours, selection, point, view, (['node', 'incoming', 'outgoing'] as const).filter(part => !hiddenViews.has(part === 'node' ? 'nodes' : 'handles')));
}

function transformHandles() {
  const ids = nodeSelection(), points = contours.flatMap(c => c.nodes.flatMap(n => [...(ids.has(n.id) ? [n] : []), ...(['incoming', 'outgoing'] as const).filter(part => !ids.has(n.id) && n[part] && selectedHandles.has(handleKey(n.id, part))).map(part => n[part]!)]));
  if (!points.length) return [];
  const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x)), bottom = Math.min(...points.map(p => p.y)), top = Math.max(...points.map(p => p.y));
  const center = { x: (left + right) / 2, y: (bottom + top) / 2 };
  const pointsAround = [[left,top],[center.x,top],[right,top],[left,center.y],[right,center.y],[left,bottom],[center.x,bottom],[right,bottom]];
  return [...pointsAround.map(([x,y]) => ({ point: {x,y}, pivot: {x: left + right - x, y: bottom + top - y} })), { point: { x: center.x, y: top + 32 / view.scale }, pivot: center }];
}
function freeTransformMarkup() {
  const handles = transformHandles(); if (!handles.length) return '';
  const a = screenPoint(handles[0].point, view), b = screenPoint(handles[7].point, view), top = screenPoint(handles[1].point, view), rotate = screenPoint(handles[8].point, view);
  return `<g class="free-transform"><rect x="${a.x}" y="${a.y}" width="${b.x-a.x}" height="${b.y-a.y}" fill="none" stroke="#3679b8" stroke-dasharray="4 3"/><path d="M${top.x} ${top.y}V${rotate.y}" stroke="#3679b8"/>${handles.map((h,i)=>{ const p = screenPoint(h.point,view); return `<rect data-transform-handle="${i}" x="${p.x-6}" y="${p.y-6}" width="12" height="12" rx="${i===8?6:0}" fill="white" stroke="#3679b8"/>`; }).join('')}</g>`;
}
function updateFreeTransform(g: Gesture, point: Point) {
  const { index, pivot, start } = g.free!;
  contours = structuredClone(g.before);
  const ids = nodeSelection();
  let t: Transform;
  if (index === 8) t = { kind: 'rotate', angle: (Math.atan2(point.y-pivot.y, point.x-pivot.x) - Math.atan2(start.y-pivot.y,start.x-pivot.x)) * 180 / Math.PI };
  else {
    let x = Math.abs(start.x-pivot.x) < 1e-6 ? 1 : (point.x-pivot.x)/(start.x-pivot.x), y = Math.abs(start.y-pivot.y) < 1e-6 ? 1 : (point.y-pivot.y)/(start.y-pivot.y);
    if (modifier()) { const scale = Math.abs(x-1)>Math.abs(y-1) ? x : y; x=scale; y=scale; }
    t = { kind:'scale', x, y };
  }
  for (const c of contours) for (const n of c.nodes) if (!ids.has(n.id)) for (const part of ['incoming','outgoing'] as const) if (n[part] && selectedHandles.has(handleKey(n.id,part))) {
    const handle = { ...n[part]!, id: 'h' }; transformSelection([{id:'h',closed:false,nodes:[handle]}],new Set(['h']),t,pivot); n[part] = {x:handle.x,y:handle.y};
  }
  transformSelection(contours,ids,t,pivot);
  if (t.kind==='scale' && t.x*t.y<0) for(const c of contours) if(c.closed && c.nodes.every(n=>ids.has(n.id))) { reverseContour(c); }
  roundNodes(contours);
}
