// Draft only: privacy-conscious analytics event receiver for Supabase Edge Functions.
// Not deployed. Keep ANALYTICS_INGEST_ENABLED unset/false until durable rate limiting,
// database policies, staging tests, and retention/deletion controls are implemented.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedTypes = new Set([
  "page_view", "product_view", "search", "cart_add", "cart_remove",
]);
const allowedOrigins = (Deno.env.get("ANALYTICS_ALLOWED_ORIGINS") ?? "")
  .split(",").map((value) => value.trim()).filter(Boolean);
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function response(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...extra } });
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin",
  };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") {
    if (!origin || !allowedOrigins.includes(origin)) return new Response(null, { status: 403, headers: cors });
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" }, cors);
  if (!origin || !allowedOrigins.includes(origin)) return response(403, { error: "origin_not_allowed" });
  if (Deno.env.get("ANALYTICS_INGEST_ENABLED") !== "true") {
    return response(503, { error: "analytics_ingest_disabled" }, cors);
  }
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return response(415, { error: "unsupported_media_type" }, cors);
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength !== null && /^\d+$/.test(rawContentLength) && Number(rawContentLength) > 4096) {
    return response(413, { error: "payload_too_large" }, cors);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return response(503, { error: "server_not_configured" }, cors);

  let payload: Record<string, unknown>;
  try {
    // Enforce the byte limit while streaming; checking after request.text() would still
    // buffer an arbitrarily large body in memory when Content-Length is absent or false.
    const reader = request.body?.getReader();
    if (!reader) return response(400, { error: "invalid_json" }, cors);
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 4096) {
        // Cancellation is best-effort; a failed cancel must not turn the size violation into a 400.
        try { await reader.cancel(); } catch { /* size limit still takes precedence */ }
        return response(413, { error: "payload_too_large" }, cors);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return response(400, { error: "invalid_json" }, cors);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response(400, { error: "invalid_payload" }, cors);
  if (typeof payload.event_type !== "string" || !allowedTypes.has(payload.event_type)) {
    return response(400, { error: "event_type_not_allowed" }, cors);
  }
  if (typeof payload.event_key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.event_key)) {
    return response(400, { error: "invalid_event_key" }, cors);
  }

  const row: Record<string, unknown> = { event_key: payload.event_key, event_type: payload.event_type };
  if (payload.event_type === "product_view" || payload.event_type === "cart_add" || payload.event_type === "cart_remove") {
    if (typeof payload.product_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.product_id)) {
      return response(400, { error: "invalid_product_id" }, cors);
    }
    row.product_id = payload.product_id;
  }
  if (payload.event_type === "search") {
    if (!Number.isInteger(payload.result_count) || (payload.result_count as number) < 0 || (payload.result_count as number) > 10000) {
      return response(400, { error: "invalid_result_count" }, cors);
    }
    row.result_count = payload.result_count;
  }
  // Deliberately ignore unknown properties: never persist raw search terms, cart contents,
  // customer contacts, URLs/query strings, IP addresses, arbitrary metadata, or client timestamps.

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.from("analytics_events_draft").insert(row);
  if (error) {
    // Duplicate idempotency key means the event was already recorded; other errors stay generic.
    if (error.code === "23505") return response(200, { accepted: true, duplicate: true }, cors);
    console.error("analytics_event_insert_failed", { code: error.code });
    return response(503, { error: "event_not_saved" }, cors);
  }
  return response(202, { accepted: true }, cors);
});
