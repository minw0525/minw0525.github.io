import type { GeometryJob, GeometryResult } from './geometry-worker';

// The editor serializes jobs; terminate also makes obsolete replies impossible.
export class GeometryClient {
  private worker?: Worker;
  private pending?: { resolve: (value: GeometryResult) => void; reject: (reason: Error) => void; id: number };
  private serial = 0;
  run(job: Omit<GeometryJob, 'id'>): Promise<GeometryResult> {
    if (this.pending) throw new Error('Geometry job already running');
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        this.worker = new Worker(new URL('./geometry-worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data }: MessageEvent<GeometryResult>) => {
          if (data.id !== this.pending?.id) return;
          const pending = this.pending; this.pending = undefined;
          if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data);
        };
        this.worker.onerror = event => { event.preventDefault(); this.stop(new Error(event.message || 'Geometry worker failed')); };
        this.worker.onmessageerror = () => this.stop(new Error('Geometry response could not be read'));
      }
      const id = ++this.serial; this.pending = { resolve, reject, id };
      this.worker.postMessage({ ...job, id });
    });
  }
  stop(reason: Error = new DOMException('Canceled', 'AbortError')) {
    this.worker?.terminate(); this.worker = undefined;
    const pending = this.pending; this.pending = undefined; pending?.reject(reason);
  }
}
