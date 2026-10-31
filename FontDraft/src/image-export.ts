import type { Project } from './project';
import { drawing, masterMetrics } from './project';
import { pathData } from './model';
import { outlineBounds } from './geometry';

export function textImage(project: Project, text: string, height = 512) {
  if (!text.trim()) throw new Error('내보낼 문자열을 입력하세요.');
  const metrics = masterMetrics(project);
  const lineHeight = metrics.ascender - metrics.descender + 200;
  let left = 0, right = 0, top = metrics.ascender + 100, bottom = metrics.descender - 100;
  const paths: string[] = [], missing = new Set<string>();
  const lines = text.split(/\r?\n/);
  lines.forEach((line, row) => {
    let x = 0; const y = -row * lineHeight;
    bottom = Math.min(bottom, y + metrics.descender - 100);
    for (const char of line) {
      const glyph = project.glyphs.find(g => g.unicodes.includes(char.codePointAt(0)!));
      if (!glyph) { if (char === ' ') x += project.upm / 4; else missing.add(char); continue; }
      const data = drawing(project, glyph);
      const contours = data.contours.filter(c => c.closed), bounds = outlineBounds(contours);
      if (bounds) { left = Math.min(left, x + bounds.left - 20); right = Math.max(right, x + bounds.right + 20); top = Math.max(top, y + bounds.top + 20); bottom = Math.min(bottom, y + bounds.bottom - 20); }
      paths.push(`<path fill="black" fill-rule="nonzero" d="${contours.map(c => pathData(c, { x, y: -y, scale: 1 })).join(' ')}"/>`);
      x += data.width;
    }
    right = Math.max(right, x);
  });
  if (missing.size) throw new Error(`프로젝트에 없는 문자: ${[...missing].join(' ')}`);
  const viewWidth = Math.max(1, right - left + 40), viewHeight = top - bottom;
  const width = Math.max(1, Math.ceil(height * viewWidth / viewHeight));
  if (width > 16384 || height > 16384 || width * height > 32_000_000) throw new Error('이미지가 너무 큽니다. 문자열이나 높이를 줄이세요.');
  return { width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left - 20} ${-top} ${viewWidth} ${viewHeight}">${paths.join('')}</svg>` };
}

export async function pngImage(svg: string, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('이미지를 변환하지 못했습니다.')); image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG를 만들지 못했습니다.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
