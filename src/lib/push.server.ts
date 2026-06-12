// Web Push helpers (VAPID + send). Server-only.
import webpush from "web-push";

export type PushSubRecord = {
  endpoint: string;
  p256dh: string;
  auth_secret: string;
};

export function generateVapidKeys() {
  return webpush.generateVAPIDKeys(); // { publicKey, privateKey }
}

export async function sendPush(
  sub: PushSubRecord,
  payload: { title: string; body: string; url?: string; tag?: string },
  vapid: { publicKey: string; privateKey: string; subject: string },
): Promise<{ ok: boolean; statusCode?: number; gone?: boolean }> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  try {
    const res = await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
      },
      JSON.stringify(payload),
      { TTL: 60 },
    );
    return { ok: true, statusCode: res.statusCode };
  } catch (err) {
    const e = err as { statusCode?: number };
    // 404/410 → subscription gone, caller should delete it.
    const gone = e.statusCode === 404 || e.statusCode === 410;
    return { ok: false, statusCode: e.statusCode, gone };
  }
}
