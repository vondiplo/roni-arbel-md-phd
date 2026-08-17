// A static server that mirrors how GitHub Pages serves this repo: everything
// lives under /<repo-name>/ rather than at the root.
//
// Developing against the same URL shape as production is what keeps a stray
// absolute path from working locally and 404ing once deployed. Anything
// requested outside the prefix is refused for the same reason.
//
// Run it directly to browse the site:  node tools/serve.mjs

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { repoName, ROOT } from './repo.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * @returns {Promise<{url: string, prefix: string, port: number, close: () => Promise<void>}>}
 */
export async function startServer({ port = 0, root = ROOT, prefix = `/${repoName()}/` } = {}) {
  const server = createServer(async (request, response) => {
    const send = (status, body = '') => {
      response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(body);
    };

    let pathname;
    try {
      ({ pathname } = new URL(request.url, 'http://localhost'));
    } catch {
      return send(400, 'bad request');
    }
    pathname = decodeURIComponent(pathname);

    if (pathname === prefix.slice(0, -1)) {
      response.writeHead(301, { location: prefix });
      return response.end();
    }
    if (!pathname.startsWith(prefix)) {
      return send(404, `not found: everything is served under ${prefix}`);
    }

    let target = resolve(root, `.${normalize(pathname.slice(prefix.length - 1))}`);
    if (target !== root && !target.startsWith(root + '/')) return send(403, 'forbidden');

    let info = await stat(target).catch(() => null);
    if (info?.isDirectory()) {
      target = join(target, 'index.html');
      info = await stat(target).catch(() => null);
    }
    if (!info?.isFile()) return send(404, `not found: ${pathname}`);

    response.writeHead(200, {
      'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': info.size,
    });
    createReadStream(target).pipe(response);
  });

  await new Promise((done, failed) => {
    server.once('error', failed);
    server.listen(port, '127.0.0.1', done);
  });

  const actual = server.address().port;
  return {
    port: actual,
    prefix,
    url: `http://127.0.0.1:${actual}${prefix}`,
    close: () => new Promise((done) => server.close(done)),
  };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const server = await startServer({ port: Number(process.env.PORT) || 8000 });
  console.log(`serving ${ROOT}`);
  console.log(`  site   ${server.url}`);
  console.log(`  OVAL   ${server.url}oval/`);
}
