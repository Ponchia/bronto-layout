/** Minimal CDP transport with bounded requests; no browser framework. */
export class CDP {
  constructor(url, timeout) {
    this.seq = 0;
    this.timeout = timeout;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket = new WebSocket(url);
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(new Error('CDP WebSocket connection failed'));
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
      this.socket.onclose = () => {
        for (const req of this.pending.values()) { clearTimeout(req.timer); req.reject(new Error('CDP connection closed')); }
        this.pending.clear();
      };
    });
  }
  listen(method, callback) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(callback); this.listeners.set(method, listeners);
    return () => { listeners.delete(callback); if (!listeners.size) this.listeners.delete(method); };
  }
  event(method, timeout = this.timeout) {
    let cancel;
    const promise = new Promise((resolve, reject) => {
      let unlisten;
      const timer = setTimeout(() => { unlisten?.(); reject(new Error(`Timed out waiting for ${method} after ${timeout}ms`)); }, timeout);
      unlisten = this.listen(method, payload => { clearTimeout(timer); unlisten(); resolve(payload); });
      cancel = () => { clearTimeout(timer); unlisten(); };
    });
    return { promise, cancel };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out running ${method} after ${this.timeout}ms`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, method, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
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
  close() { this.socket.close(); }
}
