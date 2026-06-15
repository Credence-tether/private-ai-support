// POST /api/public/widget/message
// Body: { visitor_id, visitor_token, conversation_id, content }
// Returns: { assistant_message? | { handed_over: true } }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsResponse, jsonCors } from "@/lib/cors.server";

const BodySchema = z.object({
  visitor_id: z.string().uuid(),
  visitor_token: z.string().max(200),
  conversation_id: z.string().uuid(),
  content: z.string().min(1).max(4000),
});

export const Route = createFileRoute("/api/public/widget/message")({
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

        // Verify conversation belongs to visitor + visitor identified
        const [{ data: conv }, { data: vis }] = await Promise.all([
          supabaseAdmin
            .from("conversations")
            .select("id, status, visitor_id, page_url")
            .eq("id", body.conversation_id)
            .single(),
          supabaseAdmin
            .from("visitors")
            .select("email, current_page_url")
            .eq("id", body.visitor_id)
            .single(),
        ]);
        if (!conv || conv.visitor_id !== body.visitor_id) {
          return jsonCors({ error: "Conversation not found" }, { status: 404 });
        }
        if (conv.status === "closed") {
          return jsonCors({ error: "Conversation closed" }, { status: 409 });
        }
        if (!vis?.email) {
          return jsonCors({ error: "Email required", requires_email: true }, { status: 412 });
        }

        // Insert visitor message
        const now = new Date().toISOString();
        await supabaseAdmin.from("messages").insert({
          conversation_id: conv.id,
          role: "visitor",
          content: body.content,
        });

        // Settings: provider, prompt, model, knowledge base, away message
        const { data: settings } = await supabaseAdmin
          .from("operator_settings")
          .select(
            "system_prompt, groq_model, ai_provider, ollama_base_url, ollama_model, knowledge_base, knowledge_url, away_message",
          )
          .limit(1)
          .maybeSingle();

        // Detect "talk to human" intent — flips to pending_human and notifies.
        const { wantsHuman } = await import("@/lib/groq.server");
        const human = wantsHuman(body.content);

        if (conv.status === "human" || conv.status === "pending_human" || human) {
          // Don't reply with AI; flag for operator.
          const newStatus = conv.status === "human" ? "human" : "pending_human";
          await supabaseAdmin
            .from("conversations")
            .update({
              status: newStatus,
              last_message_at: now,
              unread_for_operator: true,
            })
            .eq("id", conv.id);
          // System message visible to operator only when human-requested.
          if (human && conv.status === "bot") {
            await supabaseAdmin.from("messages").insert({
              conversation_id: conv.id,
              role: "system",
              content: "Visitor requested a human.",
            });
          }
          notifyOperators(supabaseAdmin, {
            trigger: human ? "human_request" : "visitor_message",
            title: human
              ? `🙋 ${vis.email} wants a human`
              : `Message from ${vis.email}`,
            body: body.content.slice(0, 140),
            url: `/c/${conv.id}`,
            tag: `conv-${conv.id}`,
          }).catch((e) => console.error("notify error", e));
          if (human) {
            return jsonCors({
              handed_over: true,
              system_note:
                settings?.away_message ??
                "Thanks — connecting you to a human. They'll reply here shortly.",
            });
          }
          return jsonCors({ ok: true });
        }

        // Bot reply via configured AI provider
        const { data: history } = await supabaseAdmin
          .from("messages")
          .select("role, content")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true })
          .limit(40);

        const basePrompt =
          settings?.system_prompt ??
          "You are a friendly, concise customer support assistant. If the user asks for a human, briefly acknowledge and let them know a human will be notified. Keep replies short.";

        const kb = (settings?.knowledge_base ?? "").trim();
        const kbBlock = kb
          ? `\n\nYou must answer as a professional representative of the website below. Ground every answer in this knowledge base — do not invent facts. If the answer is not in the knowledge base, say so briefly and offer to connect a human.\n\n--- WEBSITE KNOWLEDGE BASE${
              settings?.knowledge_url ? ` (source: ${settings.knowledge_url})` : ""
            } ---\n${kb}\n--- END KNOWLEDGE BASE ---`
          : "";
        const systemPrompt = basePrompt + kbBlock;

        const { aiChat } = await import("@/lib/ai.server");
        const aiSettings = {
          ai_provider: (settings?.ai_provider ?? "groq") as "groq" | "ollama",
          groq_model: settings?.groq_model ?? "llama-3.3-70b-versatile",
          ollama_base_url: settings?.ollama_base_url ?? "http://localhost:11434",
          ollama_model: settings?.ollama_model ?? "llama3.2:3b",
        };

        const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: systemPrompt },
          ...(history ?? [])
            .filter((m) => m.role === "visitor" || m.role === "assistant")
            .map((m) => ({
              role: (m.role === "visitor" ? "user" : "assistant") as "user" | "assistant",
              content: m.content,
            })),
        ];

        let reply = "";
        try {
          reply = await aiChat(chatMessages, aiSettings);
        } catch (e) {
          console.error("AI error", e);
          reply =
            "Sorry, I'm having trouble responding right now. Tap “Talk to a human” and someone will get back to you.";
        }
        if (!reply) reply = "…";

        await supabaseAdmin.from("messages").insert({
          conversation_id: conv.id,
          role: "assistant",
          content: reply,
        });
        await supabaseAdmin
          .from("conversations")
          .update({ last_message_at: new Date().toISOString(), unread_for_operator: true })
          .eq("id", conv.id);

        // Visitor-message notification (configurable per operator settings)
        notifyOperators(supabaseAdmin, {
          trigger: "visitor_message",
          title: `Message from ${vis.email}`,
          body: body.content.slice(0, 140),
          url: `/c/${conv.id}`,
          tag: `conv-${conv.id}`,
        }).catch((e) => console.error("notify error", e));

        return jsonCors({ assistant_message: reply });
      },
    },
  },
});
