export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' });
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
