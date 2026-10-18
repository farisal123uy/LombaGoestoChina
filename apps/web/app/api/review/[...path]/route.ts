import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path;
  if (!path.length || path.some((part) => !/^[A-Za-z0-9_-]+$/.test(part)) || request.nextUrl.search) return Response.json({ error: "REVIEW_ROUTE_NOT_AVAILABLE" }, { status: 404 });
  const base = process.env.REVIEW_RUNTIME_URL || "http://127.0.0.1:4300";
  try {
    const body = ["POST", "PUT"].includes(request.method) ? await request.arrayBuffer() : undefined;
    if (body && body.byteLength > 32768) return Response.json({ error: "REVIEW_REQUEST_TOO_LARGE" }, { status: 413 });
    const response = await fetch(`${base.replace(/\/$/, "")}/${path.map(encodeURIComponent).join("/")}`, {
      method: request.method, cache: "no-store", signal: AbortSignal.timeout(150000),
      headers: { ...(request.headers.get("authorization") ? { authorization: request.headers.get("authorization")! } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body,
    });
    return new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch { return Response.json({ error: "REVIEW_RUNTIME_UNAVAILABLE" }, { status: 503 }); }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
