// Shared helper for widget routes: fan out a push notification to every
// operator that has the 'operator' role. Service-role only.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function notifyOperators(
  supabaseAdmin: SupabaseClient,
  payload: {
    trigger: "new_conversation" | "human_request" | "visitor_message";
    title: string;
    body: string;
    url: string;
    tag?: string;
  },
) {
  // Find operator users
  const { data: ops } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "operator");
  if (!ops || ops.length === 0) return { sent: 0 };
  const userIds = ops.map((r: { user_id: string }) => r.user_id);

  // Load each operator's settings + subs in two batched queries
  const [{ data: settingsRows }, { data: subsRows }] = await Promise.all([
    supabaseAdmin
      .from("operator_settings")
      .select(
        "user_id, vapid_public_key, vapid_private_key, vapid_subject, notify_on_new_conversation, notify_on_human_request, notify_on_visitor_message",
      )
      .in("user_id", userIds),
    supabaseAdmin
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth_secret")
      .in("user_id", userIds),
  ]);

  if (!settingsRows || settingsRows.length === 0) return { sent: 0 };
  const { sendPush } = await import("@/lib/push.server");
  let sent = 0;
  for (const settings of settingsRows) {
    const allow =
      (payload.trigger === "new_conversation" && settings.notify_on_new_conversation) ||
      (payload.trigger === "human_request" && settings.notify_on_human_request) ||
      (payload.trigger === "visitor_message" && settings.notify_on_visitor_message);
    if (!allow) continue;
    if (!settings.vapid_public_key || !settings.vapid_private_key) continue;
    const subs = (subsRows ?? []).filter(
      (s: { user_id: string }) => s.user_id === settings.user_id,
    );
    for (const sub of subs) {
      const r = await sendPush(
        sub as any,
        {
          title: payload.title,
          body: payload.body,
          url: payload.url,
          tag: payload.tag,
        },
        {
          publicKey: settings.vapid_public_key,
          privateKey: settings.vapid_private_key,
          subject: settings.vapid_subject ?? "mailto:operator@example.com",
        },
      );
      if (r.ok) sent++;
      if (r.gone) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  }
  return { sent };
}
