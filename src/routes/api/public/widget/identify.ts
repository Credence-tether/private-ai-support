// POST /api/public/widget/identify — store visitor email from pre-chat form
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsResponse, jsonCors } from "@/lib/cors.server";

const BodySchema = z.object({
  visitor_id: z.string().uuid(),
  visitor_token: z.string().max(200),
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional(),
});

export const Route = createFileRoute("/api/public/widget/identify")({
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
        const { error } = await supabaseAdmin
          .from("visitors")
          .update({
            email: body.email,
            ...(body.name ? { name: body.name } : {}),
          })
          .eq("id", body.visitor_id);
        if (error) return jsonCors({ error: error.message }, { status: 500 });
        return jsonCors({ ok: true });
      },
    },
  },
});
