require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handler } = require('./functions/api/interpret');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        resolve({ raw });
      }
    });
    req.on('error', reject);
  });
}

async function serveApi(req, res) {
  const payload = await readRequestBody(req);
  const result = await handler({
    httpMethod: req.method,
    body: JSON.stringify(payload),
    headers: req.headers,
  });

  res.writeHead(result.statusCode || 200, result.headers || {});
  res.end(result.body || '');
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const filePath = requestPath === '/' ? path.join(ROOT, 'index.html') : path.resolve(ROOT, `.${requestPath}`);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal server error');
        return;
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/interpret')) {
      await serveApi(req, res);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.message || '서버 처리 중 오류가 발생했습니다.' }));
  }
});

server.listen(PORT, () => {
  console.log(`Health checker running at http://localhost:${PORT}`);
});
