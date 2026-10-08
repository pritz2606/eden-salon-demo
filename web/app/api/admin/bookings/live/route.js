// Keep the authenticated stream on the same origin; Firebase stays on the API.
const API_ORIGIN = process.env.EDEN_API_ORIGIN || 'http://127.0.0.1:4100';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel may end an SSE request at this limit; the admin reconnects safely.
export const maxDuration = 300;

export async function GET(request) {
  const url = new URL(request.url);
  const headers = new Headers({ accept: 'text/event-stream' });
  for (const name of ['cookie', 'origin']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = new AbortController();
  const disconnect = () => upstream.abort();
  request.signal.addEventListener('abort', disconnect, { once: true });
  if (request.signal.aborted) disconnect();
  // Limit connection setup, then allow the live response to remain open.
  const timeout = setTimeout(() => upstream.abort(), 20000);
  const dispose = () => {
    clearTimeout(timeout);
    request.signal.removeEventListener('abort', disconnect);
    upstream.abort();
  };

  try {
    const response = await fetch(`${API_ORIGIN}/api/admin/bookings/live${url.search}`, {
      method: 'GET', headers, redirect: 'manual', cache: 'no-store',
      signal: upstream.signal,
    });
    const contentType = response.headers.get('content-type') || 'application/json';
    if (!response.ok) {
      const body = await response.arrayBuffer();
      dispose();
      return new Response(body, {
        status: response.status,
        headers: { 'content-type': contentType, 'cache-control': 'no-store' },
      });
    }
    if (!response.body || !contentType.startsWith('text/event-stream')) {
      dispose();
      return Response.json({ message: 'Live appointments are temporarily unavailable.' }, { status: 503 });
    }
    clearTimeout(timeout);

    const reader = response.body.getReader();
    let finished = false;
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (finished) return;
          if (done) {
            finished = true;
            dispose();
            controller.close();
          } else controller.enqueue(value);
        } catch (error) {
          if (finished) return;
          finished = true;
          dispose();
          controller.error(error);
        }
      },
      async cancel() {
        finished = true;
        dispose();
        await reader.cancel().catch(() => {});
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store, no-transform',
        'x-accel-buffering': 'no',
      },
    });
  } catch {
    dispose();
    return Response.json({ message: 'Live appointments are temporarily unavailable. Reconnecting shortly.' }, { status: 503 });
  }
}
