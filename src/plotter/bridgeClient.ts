// ============================================================================
// HTTP client for the EasyDraw bridge (makerq-easydrawv3/machine/bridge.py).
// ============================================================================

export type BridgeState =
  | 'idle'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'stopping'
  | 'done'
  | 'stopped'
  | 'error';

export interface BridgeJobStatus {
  name: string;
  total: number;
  done: number;
  /** Stroke being drawn now, -1 when travelling / not drawing */
  current: number;
  ink_mm: number;
  points: number;
  speed: number | null;
  elapsed_s: number;
}

export interface BridgeStatus {
  ok: boolean;
  api: number;
  dry_run: boolean;
  state: BridgeState;
  message: string;
  job: BridgeJobStatus | null;
  pos: [number, number];
  pen: 'up' | 'down';
  travel_mm: [number, number];
  busy: boolean;
  paired: boolean;
  plotter_problem: string | null;
}

export class BridgeError extends Error {}

export class BridgeClient {
  private base: string;
  private token: string;

  constructor(url: string, token: string) {
    this.base = url.trim().replace(/\/+$/, '');
    this.token = token.trim();
  }

  async status(signal?: AbortSignal): Promise<BridgeStatus> {
    return this.call('GET', '/status', undefined, signal);
  }

  sendJob(name: string, strokes: [number, number][][], speed: number | null) {
    return this.call('POST', '/job', { name, strokes, speed });
  }

  command(cmd: 'pause' | 'resume' | 'stop' | 'pen-up' | 'motors-off') {
    return this.call('POST', `/${cmd}`, {});
  }

  private async call(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<BridgeStatus> {
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method,
        signal,
        headers: {
          'X-Bridge-Token': this.token,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new BridgeError(unreachableHint(this.base));
    }
    let data: { ok?: boolean; error?: string } & Partial<BridgeStatus>;
    try {
      data = await res.json();
    } catch {
      throw new BridgeError(`Bridge answered ${res.status} without JSON. Is ${this.base} really the EasyDraw bridge?`);
    }
    if (!res.ok || data.ok === false) throw new BridgeError(data.error || `Bridge error ${res.status}`);
    return data as BridgeStatus;
  }
}

function unreachableHint(base: string): string {
  let host = '';
  try {
    host = new URL(base).hostname;
  } catch {
    return `"${base}" is not a valid URL (example: http://localhost:8787).`;
  }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (typeof location !== 'undefined' && location.protocol === 'https:' && !local) {
    return 'This page is HTTPS, so the browser blocks plain-HTTP calls to a LAN address. Open the simulator over http (npm run dev) or run it on the plotter computer and use http://localhost:8787.';
  }
  return `Can't reach ${base}. Is bridge.py running there (and port 8787 open in that machine's firewall)?`;
}
