// POST /api/public/widget/init
// Body: { visitor_id?, visitor_token?, fingerprint, site_origin, page_url, user_agent, referrer, name?, email? }
// Returns: { visitor_id, visitor_token, conversation_id, status, greeting, brand_color, brand_name, messages }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsResponse, jsonCors } from "@/lib/cors.server";

const BodySchema = z.object({
  visitor_id: z.string().uuid().optional(),
  visitor_token: z.string().max(200).optional(),
  fingerprint: z.string().max(120).optional(),
  site_origin: z.string().max(300).optional(),
  page_url: z.string().max(2000).optional(),
  user_agent: z.string().max(500).optional(),
  referrer: z.string().max(2000).optional(),
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
});

export const Route = createFileRoute("/api/public/widget/init")({
  server: {
    handlers: {
      OPTIONS: async () => corsResponse(),
      POST: async ({ request }) => {
        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch (e) {
          return jsonCors({ error: "Invalid body" }, { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { signVisitorToken, verifyVisitorToken } = await import(
          "@/lib/visitor-auth.server"
        );
        const { notifyOperators } = await import("@/lib/notify.server");

        let visitorId = body.visitor_id;
        const isReturning =
          !!visitorId && !!body.visitor_token && verifyVisitorToken(visitorId, body.visitor_token);

        // Load operator settings (single-operator app: pick first row)
        const { data: settings } = await supabaseAdmin
          .from("operator_settings")
          .select("greeting, brand_color, brand_name, allowed_origins")
          .limit(1)
          .maybeSingle();

        // Optional origin allowlist
        if (
          settings?.allowed_origins &&
          settings.allowed_origins.length > 0 &&
          body.site_origin &&
          !settings.allowed_origins.includes(body.site_origin)
        ) {
          return jsonCors({ error: "Origin not allowed" }, { status: 403 });
        }

        // Resolve / create visitor
        if (isReturning && visitorId) {
          await supabaseAdmin
            .from("visitors")
            .update({
              last_seen_at: new Date().toISOString(),
              user_agent: body.user_agent ?? undefined,
              referrer: body.referrer ?? undefined,
              site_origin: body.site_origin ?? undefined,
              ...(body.name ? { name: body.name } : {}),
              ...(body.email ? { email: body.email } : {}),
            })
            .eq("id", visitorId);
        } else {
          const { data: newV, error } = await supabaseAdmin
            .from("visitors")
            .insert({
              fingerprint: body.fingerprint ?? null,
              user_agent: body.user_agent ?? null,
              referrer: body.referrer ?? null,
              site_origin: body.site_origin ?? null,
              name: body.name ?? null,
              email: body.email ?? null,
            })
            .select("id")
            .single();
          if (error || !newV) return jsonCors({ error: "Cannot create visitor" }, { status: 500 });
          visitorId = newV.id;
        }

        // Block check
        const { data: visitor } = await supabaseAdmin
          .from("visitors")
          .select("blocked")
          .eq("id", visitorId!)
          .single();
        if (visitor?.blocked) {
          return jsonCors({ error: "Blocked" }, { status: 403 });
        }

        // Find an open conversation (bot/pending_human/human), else create new
        const { data: existingConv } = await supabaseAdmin
          .from("conversations")
          .select("id, status")
          .eq("visitor_id", visitorId!)
          .neq("status", "closed")
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let conversationId: string;
        let status: string;
        let isNew = false;
        if (existingConv) {
          conversationId = existingConv.id;
          status = existingConv.status;
        } else {
          const { data: newConv, error } = await supabaseAdmin
            .from("conversations")
            .insert({
              visitor_id: visitorId!,
              site_origin: body.site_origin ?? null,
              page_url: body.page_url ?? null,
              status: "bot",
              unread_for_operator: true,
            })
            .select("id, status")
            .single();
          if (error || !newConv)
            return jsonCors({ error: "Cannot create conversation" }, { status: 500 });
          conversationId = newConv.id;
          status = newConv.status;
          isNew = true;
        }

        // Load messages
        const { data: msgs } = await supabaseAdmin
          .from("messages")
          .select("id, role, content, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        // Fire notification on new conversation
        if (isNew) {
          notifyOperators(supabaseAdmin, {
            trigger: "new_conversation",
            title: "New visitor",
            body: `Someone just opened chat${body.page_url ? ` on ${shortenUrl(body.page_url)}` : ""}.`,
            url: `/c/${conversationId}`,
            tag: `conv-${conversationId}`,
          }).catch((e) => console.error("notify error", e));
        }

        return jsonCors({
          visitor_id: visitorId,
          visitor_token: signVisitorToken(visitorId!),
          conversation_id: conversationId,
          status,
          greeting: settings?.greeting ?? "Hi there! 👋 How can we help?",
          brand_color: settings?.brand_color ?? "#0ea5e9",
          brand_name: settings?.brand_name ?? "Support",
          messages: msgs ?? [],
        });
      },
    },
  },
});

function shortenUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.host + url.pathname;
  } catch {
    return u.slice(0, 80);
  }
}
