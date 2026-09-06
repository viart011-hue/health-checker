import { handler as interpretHandler } from './functions/api/interpret.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/interpret')) {
      const event = {
        httpMethod: request.method,
        body: request.method === 'GET' ? '' : await request.text(),
        headers: Object.fromEntries(request.headers.entries()),
        env,
      };

      const response = await interpretHandler(event);

      return new Response(response.body || '', {
        status: response.statusCode || 200,
        headers: response.headers || { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    }

    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
