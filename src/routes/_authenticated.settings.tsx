import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSettings,
  updateSettings,
  testPush,
  syncKnowledgeFromUrl,
} from "@/lib/operator.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Copy, BellRing, RefreshCw, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { EnableNotifications } from "@/components/EnableNotifications";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const OLLAMA_MODELS = ["llama3.2:3b", "qwen2.5-coder:1.5b", "tinyllama:latest"];
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
];

function SettingsPage() {
  const fetchSettings = useServerFn(getSettings);
  const save = useServerFn(updateSettings);
  const sendTest = useServerFn(testPush);
  const syncKb = useServerFn(syncKnowledgeFromUrl);
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

  const syncMut = useMutation({
    mutationFn: (url: string) => syncKb({ data: { url } }),
    onSuccess: (r) => {
      toast.success(`Studied ${r.pages} page(s) · ${r.chars.toLocaleString()} chars`);
      qc.invalidateQueries({ queryKey: ["settings"] });
      setForm(null); // re-hydrate from refetch
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const widgetSnippet =
    typeof window !== "undefined"
      ? `<script src="${window.location.origin}/widget.js" defer></script>`
      : `<script src="https://your-app.lovable.app/widget.js" defer></script>`;

  if (isLoading || !form) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const provider: "groq" | "ollama" = form.ai_provider ?? "groq";

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/inbox">
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

        {/* AI Provider + Model */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">AI model</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose between Groq (cloud) or your own Ollama server (self-hosted, free).
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select
                value={provider}
                onValueChange={(v) => setForm({ ...form, ai_provider: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="groq">Groq (cloud)</SelectItem>
                  <SelectItem value="ollama">Ollama (self-hosted)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {provider === "groq" ? (
              <div className="space-y-1.5">
                <Label>Groq model</Label>
                <Select
                  value={form.groq_model}
                  onValueChange={(v) => setForm({ ...form, groq_model: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GROQ_MODELS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Ollama model</Label>
                  <Select
                    value={form.ollama_model}
                    onValueChange={(v) => setForm({ ...form, ollama_model: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OLLAMA_MODELS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Ollama base URL</Label>
                  <Input
                    value={form.ollama_base_url}
                    onChange={(e) => setForm({ ...form, ollama_base_url: e.target.value })}
                    placeholder="http://localhost:11434"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your Ollama server must be reachable from this app's server. For local dev:{" "}
                    <code>ollama pull {form.ollama_model || "llama3.2:3b"}</code>.
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* AI prompt */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">AI prompt</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell the AI who it is, the tone to use, and what it should never do. This is sent on every
            reply.
          </p>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label>System prompt</Label>
              <Textarea
                rows={8}
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="You are the support assistant for Acme Co. Be warm, accurate, and concise…"
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

        {/* Knowledge base */}
        <Card className="p-5">
          <div className="flex items-start gap-2">
            <BookOpen className="mt-1 h-5 w-5 text-primary" />
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Knowledge base</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The AI uses this to answer like a professional working at the site — not generic info.
                Paste your own copy, or sync from a URL and we'll fetch the page (and a few linked pages)
                and turn them into facts the AI must use.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Study a website</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={form.knowledge_url ?? ""}
                  onChange={(e) => setForm({ ...form, knowledge_url: e.target.value })}
                  placeholder="https://yoursite.com"
                />
                <Button
                  type="button"
                  onClick={() => {
                    if (!form.knowledge_url) {
                      toast.error("Enter a URL first");
                      return;
                    }
                    syncMut.mutate(form.knowledge_url);
                  }}
                  disabled={syncMut.isPending}
                >
                  <RefreshCw className={`mr-1.5 h-4 w-4 ${syncMut.isPending ? "animate-spin" : ""}`} />
                  {syncMut.isPending ? "Studying…" : "Sync now"}
                </Button>
              </div>
              {form.knowledge_synced_at && (
                <p className="text-xs text-muted-foreground">
                  Last synced {new Date(form.knowledge_synced_at).toLocaleString()} ·{" "}
                  {(form.knowledge_base ?? "").length.toLocaleString()} chars stored
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Knowledge text (edit freely)</Label>
              <Textarea
                rows={12}
                value={form.knowledge_base ?? ""}
                onChange={(e) => setForm({ ...form, knowledge_base: e.target.value })}
                placeholder="Paste pricing, FAQs, product specs, policies, opening hours… anything the AI should ground its answers in."
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Up to ~100,000 characters. The AI is instructed to answer only from this content and to
                hand off to a human when something isn't covered.
              </p>
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
                ai_provider: form.ai_provider,
                groq_model: form.groq_model,
                ollama_base_url: form.ollama_base_url,
                ollama_model: form.ollama_model,
                system_prompt: form.system_prompt,
                away_message: form.away_message,
                knowledge_base: form.knowledge_base,
                knowledge_url: form.knowledge_url,
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
