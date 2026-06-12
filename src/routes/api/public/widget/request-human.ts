// POST /api/public/widget/request-human
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsResponse, jsonCors } from "@/lib/cors.server";

const BodySchema = z.object({
  visitor_id: z.string().uuid(),
  visitor_token: z.string().max(200),
  conversation_id: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/widget/request-human")({
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
        const { notifyOperators } = await import("@/lib/notify.server");

        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("id, visitor_id, status")
          .eq("id", body.conversation_id)
          .single();
        if (!conv || conv.visitor_id !== body.visitor_id) {
          return jsonCors({ error: "Conversation not found" }, { status: 404 });
        }
        if (conv.status !== "human") {
          await supabaseAdmin
            .from("conversations")
            .update({
              status: "pending_human",
              last_message_at: new Date().toISOString(),
              unread_for_operator: true,
            })
            .eq("id", conv.id);
          await supabaseAdmin.from("messages").insert({
            conversation_id: conv.id,
            role: "system",
            content: "Visitor tapped “Talk to a human”.",
          });
        }

        const { data: settings } = await supabaseAdmin
          .from("operator_settings")
          .select("away_message")
          .limit(1)
          .maybeSingle();

        notifyOperators(supabaseAdmin, {
          trigger: "human_request",
          title: "🙋 Visitor wants a human",
          body: "Tap to take over the conversation.",
          url: `/c/${conv.id}`,
          tag: `conv-${conv.id}`,
        }).catch((e) => console.error("notify error", e));

        return jsonCors({
          ok: true,
          system_note: settings?.away_message ?? "A human will be with you shortly.",
        });
      },
    },
  },
});
