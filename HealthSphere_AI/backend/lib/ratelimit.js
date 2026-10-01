/* Shared in-memory login rate limiter (per IP + path). No dependency. */

const buckets = new Map(); // key -> { count, resetAt }

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim().slice(0, 64);
  return req.socket?.remoteAddress || 'unknown';
}

export function loginRateLimit(req, { max = 5, windowMs = 60 * 1000 } = {}) {
  const key = `${clientIp(req)}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  // opportunistically prune
  if (buckets.size > 2000) {
    for (const [k, v] of buckets) {
      if (now > v.resetAt) buckets.delete(k);
      if (buckets.size < 1000) break;
    }
  }
  const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
  return { allowed: b.count <= max, retryAfterSec, attempts: b.count };
}
