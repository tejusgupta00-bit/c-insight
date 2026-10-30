import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { startInteractiveSession, writeSessionInput, endSessionInput, cancelSession } from './server/interactive-run.js';

const COMPILE_RUN_ENDPOINT = '/api/compile-run';
const COMPILE_RUN_INPUT_ENDPOINT = '/api/compile-run/input';
const COMPILE_RUN_CANCEL_ENDPOINT = '/api/compile-run/cancel';
const MAX_SOURCE_BYTES = 128 * 1024;

function readRequestBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_SOURCE_BYTES) {
        const error = new Error('Source payload exceeds the 128 KB limit.') as Error & { statusCode?: number };
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendSSE(res: Connect.ServerResponse, event: string, data: unknown) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const middleware: Connect.NextHandleFunction = (req, res, next) => {
  const pathname = req.url?.split('?')[0];

  if (pathname === COMPILE_RUN_CANCEL_ENDPOINT) {
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
    readRequestBody(req).then(raw => {
      let parsed: { id?: unknown } = {};
      try { parsed = JSON.parse(raw || '{}'); } catch {}
      const id = typeof parsed.id === 'string' ? parsed.id : '';
      if (id) cancelSession(id);
      res.statusCode = 204;
      res.end();
    }).catch(() => { res.statusCode = 400; res.end(); });
    return;
  }

  if (pathname === COMPILE_RUN_INPUT_ENDPOINT) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end();
      return;
    }
    readRequestBody(req)
      .then(raw => {
        let parsed: { id?: unknown; data?: unknown; end?: unknown };
        try { parsed = JSON.parse(raw || '{}'); } catch { parsed = {}; }
        const id = typeof parsed.id === 'string' ? parsed.id : '';
        const data = typeof parsed.data === 'string' ? parsed.data : '';
        const end = parsed.end === true;
        if (!id) { res.statusCode = 400; res.end('missing id'); return; }
        let ok = true;
        if (end && data) ok = writeSessionInput(id, data) && ok;
        ok = (end ? endSessionInput(id) : writeSessionInput(id, data)) && ok;
        res.statusCode = ok ? 204 : 404;
        res.end();
      })
      .catch(() => { if (!res.writableEnded) { res.statusCode = 400; res.end(); } });
    return;
  }

  if (pathname !== COMPILE_RUN_ENDPOINT) {
    next();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end();
    return;
  }

  readRequestBody(req)
    .then(raw => {
      let source: string;
      try {
        const parsed = JSON.parse(raw || '{}') as { source?: unknown };
        source = typeof parsed.source === 'string' ? parsed.source : '';
      } catch {
        res.statusCode = 400;
        res.end('bad json');
        return;
      }
      if (!source.trim()) {
        res.statusCode = 400;
        res.end('no source');
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      let cancelled = false;
      let sessionId: string | null = null;
      req.on('close', () => {
        cancelled = true;
        if (sessionId) cancelSession(sessionId);
      });

      startInteractiveSession(source, {
        onSession: id => { sessionId = id; sendSSE(res, 'session', { id }); },
        onStdout: text => sendSSE(res, 'stdout', { text }),
        onStderr: text => sendSSE(res, 'stderr', { text }),
        onCompileWarning: diagnostics => sendSSE(res, 'compile-warning', { diagnostics }),
        onCompileError: result => sendSSE(res, 'compile-error', result),
        onExit: result => { sendSSE(res, 'exit', result); try { res.end(); } catch {} },
        onError: message => { sendSSE(res, 'error', { message }); try { res.end(); } catch {} }
      }).then(id => {
        if (id) sessionId = id;
        if (!id && !cancelled) {
          if (!res.writableEnded) res.end();
        }
      }).catch(err => {
        sendSSE(res, 'error', { message: err instanceof Error ? err.message : 'session failed' });
        if (!res.writableEnded) res.end();
      });
    })
    .catch(err => {
      if (!res.headersSent) {
        res.statusCode = (err as { statusCode?: number })?.statusCode ?? 400;
        res.end(err instanceof Error ? err.message : 'bad request');
      }
    });
};

function compileRunPlugin(): Plugin {
  const attach = (server: { middlewares: Connect.Server }) => {
    server.middlewares.use(middleware);
  };
  return {
    name: 'c-insight:compile-run',
    configureServer: attach,
    configurePreviewServer: attach
  };
}

export default defineConfig({
  plugins: [react(), compileRunPlugin()],
  server: { port: 5173, host: true }
});