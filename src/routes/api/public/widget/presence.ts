// POST /api/public/widget/presence — heartbeat + page-view tracking
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsResponse, jsonCors } from "@/lib/cors.server";

const BodySchema = z.object({
  visitor_id: z.string().uuid(),
  visitor_token: z.string().max(200),
  page_url: z.string().max(2000),
  page_title: z.string().max(500).optional(),
  referrer: z.string().max(2000).optional(),
  record_view: z.boolean().optional(),
});

export const Route = createFileRoute("/api/public/widget/presence")({
  server: {
    handlers: {
      OPTIONS: async () => corsResponse(),
      POST: async ({ request }) => {
        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return jsonCors({ error: "Invalid body" }, { status: 400 });
        }
        const { verifyVisitorToken } = await import("@/lib/visitor-auth.server");
        if (!verifyVisitorToken(body.visitor_id, body.visitor_token)) {
          return jsonCors({ error: "Invalid token" }, { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const headers = request.headers;
        const ipCountry = headers.get("cf-ipcountry") || undefined;
        const ipCity = headers.get("cf-ipcity") || undefined;
        const ipRegion = headers.get("cf-region") || undefined;

        await supabaseAdmin
          .from("visitors")
          .update({
            last_seen_at: new Date().toISOString(),
            current_page_url: body.page_url,
            current_page_title: body.page_title ?? null,
            ...(ipCountry ? { ip_country: ipCountry } : {}),
            ...(ipCity ? { ip_city: ipCity } : {}),
            ...(ipRegion ? { ip_region: ipRegion } : {}),
          })
          .eq("id", body.visitor_id);

        if (body.record_view) {
          await supabaseAdmin.from("visitor_page_views").insert({
            visitor_id: body.visitor_id,
            page_url: body.page_url,
            page_title: body.page_title ?? null,
            referrer: body.referrer ?? null,
          });
        }
        return jsonCors({ ok: true });
      },
    },
  },
});
