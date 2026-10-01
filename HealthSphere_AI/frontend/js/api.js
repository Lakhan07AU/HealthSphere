/* ---------- API client (timeout + abort + status-preserving errors) ---------- */
async function api(path, { method = 'GET', body, signal, timeout = 12000 } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = timeout > 0 ? setTimeout(() => ctrl.abort(), timeout) : null;
  opts.signal = ctrl.signal;
  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const err = new Error(signal && signal.aborted ? 'Request cancelled.' : 'Request timed out. Please try again.');
      err.status = 0;
      err.code = 'timeout';
      throw err;
    }
    throw new Error('Cannot reach the HealthSphere server. Is it running?');
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
