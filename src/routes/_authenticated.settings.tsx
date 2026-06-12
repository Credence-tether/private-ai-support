import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSettings, testPush } from "@/lib/operator.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Copy, BellRing } from "lucide-react";
import { toast } from "sonner";
import { EnableNotifications } from "@/components/EnableNotifications";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const fetchSettings = useServerFn(getSettings);
  const save = useServerFn(updateSettings);
  const sendTest = useServerFn(testPush);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => fetchSettings(),
  });

  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (data?.settings && !form) setForm(data.settings);
  }, [data, form]);

  const saveMut = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const testMut = useMutation({
    mutationFn: () => sendTest({}),
    onSuccess: (r) => toast.success(`Sent to ${r.delivered}/${r.total} device(s).`),
    onError: (e) => toast.error((e as Error).message),
  });

  const widgetSnippet =
    typeof window !== "undefined"
      ? `<script src="${window.location.origin}/widget.js" defer></script>`
      : `<script src="https://your-app.lovable.app/widget.js" defer></script>`;

  if (isLoading || !form) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <h1 className="font-semibold">Settings</h1>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        {/* Embed snippet */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Install on your website</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste this before <code className="rounded bg-muted px-1">&lt;/body&gt;</code> on every page.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-xs">
            <code className="flex-1 break-all">{widgetSnippet}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(widgetSnippet);
                toast.success("Copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Phone notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Install this app on your phone (Add to Home Screen) and enable notifications to get alerted
            when visitors message you.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EnableNotifications />
            <Button variant="outline" size="sm" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
              <BellRing className="mr-1.5 h-4 w-4" /> Send test
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            <ToggleRow
              label="New conversation"
              checked={form.notify_on_new_conversation}
              onChange={(v) => setForm({ ...form, notify_on_new_conversation: v })}
            />
            <ToggleRow
              label="Visitor message (during AI chat)"
              checked={form.notify_on_visitor_message}
              onChange={(v) => setForm({ ...form, notify_on_visitor_message: v })}
            />
            <ToggleRow
              label="“Talk to a human” requested"
              checked={form.notify_on_human_request}
              onChange={(v) => setForm({ ...form, notify_on_human_request: v })}
            />
          </div>
        </Card>

        {/* Widget appearance */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Widget appearance</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Brand name</Label>
              <Input
                value={form.brand_name}
                onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Brand color</Label>
              <Input
                type="color"
                value={form.brand_color}
                onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Greeting message</Label>
              <Input
                value={form.greeting}
                onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* AI */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">AI behavior (Groq)</h2>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Input
                value={form.groq_model}
                onChange={(e) => setForm({ ...form, groq_model: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                e.g. <code>llama-3.3-70b-versatile</code>, <code>llama-3.1-8b-instant</code>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>System prompt</Label>
              <Textarea
                rows={6}
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Away / hand-off message</Label>
              <Textarea
                rows={2}
                value={form.away_message}
                onChange={(e) => setForm({ ...form, away_message: e.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* Security */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Allowed origins</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Optional. Comma-separated origins (e.g. <code>https://yoursite.com</code>) that may use the
            widget. Leave empty to allow any origin.
          </p>
          <Input
            className="mt-3"
            value={(form.allowed_origins ?? []).join(", ")}
            onChange={(e) =>
              setForm({
                ...form,
                allowed_origins: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="https://yoursite.com, https://www.yoursite.com"
          />
        </Card>

        <div className="flex justify-end pb-10">
          <Button
            onClick={() =>
              saveMut.mutate({
                brand_name: form.brand_name,
                brand_color: form.brand_color,
                greeting: form.greeting,
                groq_model: form.groq_model,
                system_prompt: form.system_prompt,
                away_message: form.away_message,
                notify_on_new_conversation: form.notify_on_new_conversation,
                notify_on_visitor_message: form.notify_on_visitor_message,
                notify_on_human_request: form.notify_on_human_request,
                allowed_origins: form.allowed_origins,
              })
            }
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
