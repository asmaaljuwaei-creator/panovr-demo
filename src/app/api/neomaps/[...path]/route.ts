import type { NextRequest } from "next/server";

export const runtime = "nodejs";          // ensure Node runtime (not edge)
export const dynamic = "force-dynamic";   // avoid static optimization
export const revalidate = 0;

const UPSTREAM = "https://api.neomaps.com";

// allow-list your sites
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "https://yourapp.com",
  "https://www.yourapp.com",
]);

type Params = { path: string[] };
type Ctx = { params: Params } | { params: Promise<Params> };

// helper: handle both plain object and Promise in Next 14/15
async function readParams(ctx: Ctx): Promise<Params> {
  const p: any = (ctx as any).params;
  return typeof p?.then === "function" ? await p : p;
}

function corsHeadersFor(origin?: string) {
  const h = new Headers();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    // h.set("Access-Control-Allow-Credentials", "true"); // if you need cookies
  }
  h.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, X-Contract-Id, X-Client-Type");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Vary", "Origin");
  return h;
}

function buildUpstreamUrl(req: NextRequest, pathParts: string[]) {
  const tail = pathParts.map(encodeURIComponent).join("/");
  const qs = req.nextUrl.search || "";
  return `${UPSTREAM}/${tail}${qs}`;
}

async function proxy(req: NextRequest, ctx: Ctx) {
  const { path } = await readParams(ctx);
  if (!Array.isArray(path) || path.length === 0) {
    return new Response("Missing path", { status: 400 });
  }

  const upstreamUrl = buildUpstreamUrl(req, path);

  // clone/clean headers for upstream
  const incoming = Object.fromEntries(req.headers.entries());
  const headers = new Headers(incoming);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("content-length"); // we'll re-serialize body
  headers.set("accept", incoming["accept"] ?? "*/*");

  // If you want to keep secrets server-side, set them here:
  // headers.set("Authorization", `Bearer ${process.env.NEOMAPS_TOKEN!}`);
  // headers.set("X-Contract-Id", process.env.NEOMAPS_CONTRACT_ID!`);
  // headers.set("X-Client-Type", "Web");

  // Read the body once (streams can’t be forwarded twice)
  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const upstreamResp = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  });

  // pass-thru response + add CORS for browser
  const resHeaders = new Headers(upstreamResp.headers);
  const cors = corsHeadersFor(req.headers.get("origin") || undefined);
  cors.forEach((v, k) => resHeaders.set(k, v));

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: resHeaders,
  });
}

export async function OPTIONS(req: NextRequest, ctx: Ctx) {
  await readParams(ctx); // not used, but keeps signature symmetric
  const headers = corsHeadersFor(req.headers.get("origin") || undefined);
  return new Response(null, { status: 204, headers });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx);
}
