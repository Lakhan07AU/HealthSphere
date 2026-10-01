import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './lib/api.js';
import { ensureSeed } from './lib/seed.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Static SPA lives in ../frontend locally; in the Docker compose setup nginx
// serves it instead, so STATIC_DIR=off disables static serving in this process.
const STATIC_OFF = /^off|none|false$/i.test(String(process.env.STATIC_DIR || ''));
const PUBLIC = STATIC_OFF ? null
  : path.resolve(ROOT, process.env.STATIC_DIR || path.join(ROOT, '..', 'frontend'));
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/webmanifest'
};

ensureSeed();

const server = http.createServer(handler);

export default async function handler(req, res) {
  applySecurityHeaders(res);
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/api/')) {
      let body = null;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        body = await readJson(req, 25 * 1024 * 1024);
      }
      const query = Object.fromEntries(url.searchParams.entries());
      const handled = await handleApi(req, res, pathname, query, body);
      if (!handled) json(res, 404, { error: 'Unknown API endpoint' });
      return;
    }

    serveStatic(req, res, pathname);
  } catch (e) {
    console.error('[server]', e);
    try { json(res, 500, { error: 'Internal server error' }); } catch { /* noop */ }
  }
}

function applySecurityHeaders(res) {
  const origWriteHead = res.writeHead.bind(res);
  if (res._secWrapped) return;
  res._secWrapped = true;
  res.writeHead = (status, headers = {}) => {
    if (!res.getHeader('X-Content-Type-Options')) res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!res.getHeader('Referrer-Policy')) res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!res.getHeader('X-Frame-Options')) res.setHeader('X-Frame-Options', 'DENY');
    if (!res.getHeader('Content-Security-Policy')) {
      res.setHeader('Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.clarity.ms; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; " +
        "connect-src 'self'; frame-ancestors 'none'");
    }
    return origWriteHead(status, headers);
  };
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function cacheControlFor(rel) {
  if (rel === '/index.html' || rel === '/' || rel.endsWith('.html')) return 'no-store';
  if (rel.startsWith('/js/') || rel.startsWith('/css/')) return 'public, max-age=31536000, immutable';
  if (rel === '/sw.js') return 'no-cache';
  return 'public, max-age=3600';
}

function etagFor(stat) {
  return `"${stat.size.toString(36)}-${Number(stat.mtimeMs).toString(36)}"`;
}

function serveStatic(req, res, pathname) {
  if (!PUBLIC) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found — this process serves the API only. Static SPA is served by the frontend container.'); return; }
  let rel = pathname === '/' ? '/index.html' : pathname;
  const fp = path.normalize(path.join(PUBLIC, rel));
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(fp, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      // SPA fallback → index.html (never cached)
      fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
        res.end(html);
      });
      return;
    }
    const tag = etagFor(stat);
    if ((req.headers['if-none-match'] || '') === tag) {
      res.writeHead(304, { ETag: tag, 'Cache-Control': cacheControlFor(rel) });
      res.end();
      return;
    }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(fp).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': cacheControlFor(rel),
        ETag: tag,
      });
      res.end(data);
    });
  });
}

function listen(port, attempts = 10) {
  server.once('error', e => {
    if (e.code === 'EADDRINUSE' && attempts > 0) {
      console.log(`Port ${port} busy — trying ${port + 1}…`);
      listen(port + 1, attempts - 1);
    } else { console.error(e); process.exit(1); }
  });
  server.listen(port, () => {
    const u = `http://localhost:${port}`;
    console.log('');
    console.log('  HealthSphere AI - Family Health Intelligence');
    console.log(`  Server: ${u}`);
    console.log('  Demo:   demo@healthsphere.ai / demo1234');
    console.log('');
    if (process.argv.includes('--open') && process.platform === 'win32') {
      import('node:child_process').then(cp => cp.exec(`start "" "${u}"`)).catch(() => {});
    }
  });
}

// Local / traditional hosting: start the HTTP server.
// On Vercel (process.env.VERCEL) this module is imported by api/index.js and
// invoked as a serverless handler instead — listening would crash the lambda.
if (!process.env.VERCEL) {
  listen(PORT);
}
