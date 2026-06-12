import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import {
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from "@/lib/operator.functions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function EnableNotifications() {
  const getKey = useServerFn(getVapidPublicKey);
  const subscribe = useServerFn(subscribePush);
  const unsubscribe = useServerFn(unsubscribePush);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          setSubscribed(true);
          setEndpoint(sub.endpoint);
        }
      } catch {}
    })();
  }, []);

  const enableMut = useMutation({
    mutationFn: async () => {
      if (Notification.permission === "denied") {
        throw new Error("Notifications blocked. Enable them in your browser settings.");
      }
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Permission denied");
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const { publicKey } = await getKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      await subscribe({
        data: {
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh!,
          auth_secret: json.keys!.auth!,
          user_agent: navigator.userAgent,
        },
      });
      setSubscribed(true);
      setEndpoint(json.endpoint!);
    },
    onSuccess: () => toast.success("Notifications enabled on this device."),
    onError: (e) => toast.error((e as Error).message),
  });

  const disableMut = useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await unsubscribe({ data: { endpoint: sub.endpoint } });
      } else if (endpoint) {
        await unsubscribe({ data: { endpoint } });
      }
      setSubscribed(false);
      setEndpoint(null);
    },
    onSuccess: () => toast.success("Notifications disabled."),
  });

  if (!supported) {
    return (
      <Button variant="outline" size="sm" disabled title="Not supported in this browser">
        <BellOff className="mr-1.5 h-4 w-4" /> Push not supported
      </Button>
    );
  }

  if (subscribed) {
    return (
      <Button variant="outline" size="sm" onClick={() => disableMut.mutate()}>
        <Bell className="mr-1.5 h-4 w-4 text-emerald-500" /> Notifications on
      </Button>
    );
  }
  return (
    <Button variant="default" size="sm" onClick={() => enableMut.mutate()} disabled={enableMut.isPending}>
      <Bell className="mr-1.5 h-4 w-4" /> Enable notifications
    </Button>
  );
}
