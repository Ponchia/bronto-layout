/** Minimal CDP transport with bounded requests; no browser framework. */
export class CDP {
  constructor(url, timeout) {
    this.seq = 0;
    this.timeout = timeout;
    this.pending = new Map();
    this.listeners = new Map();
    this.waiters = new Set();
    this.ready = new Promise((resolve, reject) => {
      this.rejectReady = reject;
      this.socket = new WebSocket(url);
      this.connectTimer = setTimeout(() => {
        this.fail(new Error(`CDP WebSocket connection timed out after ${timeout}ms`));
        this.socket.close();
      }, timeout);
      this.socket.onopen = () => { clearTimeout(this.connectTimer); resolve(); };
      this.socket.onerror = () => {
        this.fail(new Error('CDP WebSocket connection failed'));
        this.socket.close();
      };
      this.socket.onmessage = event => {
        const data = JSON.parse(event.data);
        if (!data.id) {
          for (const listener of this.listeners.get(data.method) ?? []) listener(data.params ?? {});
          return;
        }
        const req = this.pending.get(data.id);
        if (!req) return;
        this.pending.delete(data.id);
        clearTimeout(req.timer);
        if (data.error) req.reject(new Error(`${req.method}: ${data.error.message}`));
        else req.resolve(data.result);
      };
      this.socket.onclose = () => this.fail(new Error('CDP connection closed'));
    });
    // A peer may fail before the caller reaches its first send(). Awaiting
    // ready still rejects, without an intervening unhandled rejection.
    this.ready.catch(() => {});
  }
  fail(error) {
    this.failure ??= error;
    clearTimeout(this.connectTimer);
    this.rejectReady(this.failure);
    for (const req of this.pending.values()) { clearTimeout(req.timer); req.reject(this.failure); }
    this.pending.clear();
    for (const reject of this.waiters) reject(this.failure);
    this.waiters.clear();
    this.listeners.clear();
  }
  listen(method, callback) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(callback); this.listeners.set(method, listeners);
    return () => { listeners.delete(callback); if (!listeners.size) this.listeners.delete(method); };
  }
  event(method, timeout = this.timeout) {
    let cancel;
    const promise = new Promise((resolve, reject) => {
      if (this.failure) { reject(this.failure); cancel = () => {}; return; }
      const failed = error => { cancel(); reject(error); };
      const timer = setTimeout(() => failed(new Error(`Timed out waiting for ${method} after ${timeout}ms`)), timeout);
      const unlisten = this.listen(method, payload => { cancel(); resolve(payload); });
      cancel = () => { clearTimeout(timer); unlisten(); this.waiters.delete(failed); };
      this.waiters.add(failed);
    });
    promise.catch(() => {});
    return { promise, cancel };
  }
  async send(method, params = {}) {
    await this.ready;
    if (this.failure) throw this.failure;
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out running ${method} after ${this.timeout}ms`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, method, timer });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async eval(expression) {
    const value = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) {
      const details = value.exceptionDetails;
      throw new Error(details.exception?.description ?? details.text ?? 'Browser script failed');
    }
    return value.result?.value;
  }
  close() { this.fail(new Error('CDP connection closed')); this.socket.close(); }
}
