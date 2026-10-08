// Same-origin bridge: credentials and Firestore keys stay on the NestJS server.
const API_ORIGIN = process.env.EDEN_API_ORIGIN || "http://127.0.0.1:4100";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function forward(request, context) {
  const { path } = await context.params;
  const url = new URL(request.url);
  const headers = new Headers();
  for (const name of ["content-type", "authorization", "cookie", "origin", "x-eden-request"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Keep cancellation and admin actions same-origin in the browser.
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    // Next's internal request URL can use localhost even when the browser uses
    // 127.0.0.1. Compare against the actual incoming Host header instead.
    const websiteOrigin = `${url.protocol}//${request.headers.get("host") || url.host}`;
    if (origin && origin !== websiteOrigin) {
      return Response.json({ message: "This request must come from the booking website." }, { status: 403 });
    }
  }
  try {
    const response = await fetch(`${API_ORIGIN}/api/${path.map(encodeURIComponent).join("/")}${url.search}`, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    const responseHeaders = new Headers({ "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" });
    for (const cookie of response.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
    return new Response(await response.arrayBuffer(), { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json({ message: "The booking service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
