// CORS helpers for the public widget endpoints. We allow any origin (the
// widget needs to work cross-site) but only expose the small widget API.
export const widgetCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function corsResponse(): Response {
  return new Response(null, { status: 204, headers: widgetCorsHeaders });
}

export function jsonCors(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...widgetCorsHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}
