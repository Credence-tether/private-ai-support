// POST /api/public/widget/poll — fetch new messages since `after_id` (or all)
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsResponse, jsonCors } from "@/lib/cors.server";

const BodySchema = z.object({
  visitor_id: z.string().uuid(),
  visitor_token: z.string().max(200),
  conversation_id: z.string().uuid(),
  since: z.string().datetime().optional(),
});

export const Route = createFileRoute("/api/public/widget/poll")({
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

        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("visitor_id, status")
          .eq("id", body.conversation_id)
          .single();
        if (!conv || conv.visitor_id !== body.visitor_id) {
          return jsonCors({ error: "Not found" }, { status: 404 });
        }

        let q = supabaseAdmin
          .from("messages")
          .select("id, role, content, created_at")
          .eq("conversation_id", body.conversation_id)
          .order("created_at", { ascending: true })
          .limit(50);
        if (body.since) q = q.gt("created_at", body.since);
        const { data: msgs } = await q;
        return jsonCors({ messages: msgs ?? [], status: conv.status });
      },
    },
  },
});
