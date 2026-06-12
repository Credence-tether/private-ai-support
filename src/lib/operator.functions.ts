// Operator (you) server functions — all require Supabase auth + operator role.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertOperator(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "operator",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: operator role required");
}

// ---------- LIST / GET CONVERSATIONS ----------
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperator(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("conversations")
      .select(
        "id, status, assigned_to, unread_for_operator, last_message_at, started_at, page_url, site_origin, visitor:visitors(id, name, email, ip_country, user_agent, referrer)",
      )
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { conversations: data ?? [] };
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOperator(context.supabase, context.userId);
    const [{ data: conv, error: e1 }, { data: msgs, error: e2 }] = await Promise.all([
      context.supabase
        .from("conversations")
        .select(
          "id, status, assigned_to, unread_for_operator, last_message_at, started_at, page_url, site_origin, visitor:visitors(id, name, email, ip_country, user_agent, referrer, fingerprint, last_seen_at)",
        )
        .eq("id", data.conversationId)
        .single(),
      context.supabase
        .from("messages")
        .select("id, role, content, operator_user_id, created_at")
        .eq("conversation_id", data.conversationId)
        .order("created_at", { ascending: true }),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    return { conversation: conv, messages: msgs ?? [] };
  });

// ---------- REPLY ----------
export const sendReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        content: z.string().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOperator(context.supabase, context.userId);
    const now = new Date().toISOString();
    const { error: insErr } = await context.supabase.from("messages").insert({
      conversation_id: data.conversationId,
      role: "operator",
      content: data.content,
      operator_user_id: context.userId,
    });
    if (insErr) throw new Error(insErr.message);
    // Move to 'human' status, assign to self if unassigned, clear unread.
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("status, assigned_to")
      .eq("id", data.conversationId)
      .single();
    const patch = {
      status: "human" as const,
      last_message_at: now,
      unread_for_operator: false,
      ...(conv?.assigned_to ? {} : { assigned_to: context.userId }),
    };
    const { error: upErr } = await context.supabase
      .from("conversations")
      .update(patch)
      .eq("id", data.conversationId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

// ---------- STATUS ----------
export const updateConversationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        action: z.enum(["assign", "close", "reopen", "release", "block"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOperator(context.supabase, context.userId);
    const now = new Date().toISOString();
    if (data.action === "assign") {
      await context.supabase
        .from("conversations")
        .update({ assigned_to: context.userId, status: "human", unread_for_operator: false })
        .eq("id", data.conversationId);
    } else if (data.action === "close") {
      await context.supabase
        .from("conversations")
        .update({ status: "closed", closed_at: now })
        .eq("id", data.conversationId);
    } else if (data.action === "reopen") {
      await context.supabase
        .from("conversations")
        .update({ status: "human", closed_at: null })
        .eq("id", data.conversationId);
    } else if (data.action === "release") {
      await context.supabase
        .from("conversations")
        .update({ assigned_to: null, status: "bot" })
        .eq("id", data.conversationId);
    } else if (data.action === "block") {
      const { data: conv } = await context.supabase
        .from("conversations")
        .select("visitor_id")
        .eq("id", data.conversationId)
        .single();
      if (conv?.visitor_id) {
        await context.supabase.from("visitors").update({ blocked: true }).eq("id", conv.visitor_id);
      }
      await context.supabase
        .from("conversations")
        .update({ status: "closed", closed_at: now })
        .eq("id", data.conversationId);
    }
    return { ok: true };
  });

export const markRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOperator(context.supabase, context.userId);
    await context.supabase
      .from("conversations")
      .update({ unread_for_operator: false })
      .eq("id", data.conversationId);
    return { ok: true };
  });

// ---------- SETTINGS ----------
export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperator(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("operator_settings")
      .select(
        "system_prompt, groq_model, away_message, greeting, brand_color, brand_name, notify_on_new_conversation, notify_on_human_request, notify_on_visitor_message, allowed_origins, vapid_subject",
      )
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    return { settings: data };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        system_prompt: z.string().min(1).max(8000).optional(),
        groq_model: z.string().min(1).max(120).optional(),
        away_message: z.string().max(2000).optional(),
        greeting: z.string().max(500).optional(),
        brand_color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        brand_name: z.string().max(80).optional(),
        notify_on_new_conversation: z.boolean().optional(),
        notify_on_human_request: z.boolean().optional(),
        notify_on_visitor_message: z.boolean().optional(),
        allowed_origins: z.array(z.string().max(200)).max(20).optional(),
        vapid_subject: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOperator(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("operator_settings")
      .update(data)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- PUSH ----------
export const getVapidPublicKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperator(context.supabase, context.userId);
    const { data: row } = await context.supabase
      .from("operator_settings")
      .select("vapid_public_key, vapid_private_key")
      .eq("user_id", context.userId)
      .single();
    if (row?.vapid_public_key) return { publicKey: row.vapid_public_key };
    // Generate and persist new keypair.
    const { generateVapidKeys } = await import("@/lib/push.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const keys = generateVapidKeys();
    const { error } = await supabaseAdmin
      .from("operator_settings")
      .update({ vapid_public_key: keys.publicKey, vapid_private_key: keys.privateKey })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { publicKey: keys.publicKey };
  });

export const subscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        endpoint: z.string().url(),
        p256dh: z.string().min(1),
        auth_secret: z.string().min(1),
        user_agent: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOperator(context.supabase, context.userId);
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth_secret: data.auth_secret,
        user_agent: data.user_agent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ endpoint: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const testPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperator(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPush } = await import("@/lib/push.server");
    const { data: settings } = await supabaseAdmin
      .from("operator_settings")
      .select("vapid_public_key, vapid_private_key, vapid_subject")
      .eq("user_id", context.userId)
      .single();
    if (!settings?.vapid_public_key || !settings?.vapid_private_key) {
      throw new Error("VAPID keys not generated yet. Enable notifications first.");
    }
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_secret")
      .eq("user_id", context.userId);
    if (!subs || subs.length === 0) {
      throw new Error("No push subscriptions found. Enable notifications on this device first.");
    }
    let delivered = 0;
    for (const sub of subs) {
      const r = await sendPush(
        sub as any,
        {
          title: "Test notification",
          body: "Push is working — you'll get alerts when visitors message you.",
          url: "/",
          tag: "test",
        },
        {
          publicKey: settings.vapid_public_key,
          privateKey: settings.vapid_private_key,
          subject: settings.vapid_subject ?? "mailto:operator@example.com",
        },
      );
      if (r.ok) delivered++;
      if (r.gone) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
    return { delivered, total: subs.length };
  });
