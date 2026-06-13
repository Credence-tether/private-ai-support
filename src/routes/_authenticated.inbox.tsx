import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  listConversations,
  getConversation,
  sendReply,
  updateConversationStatus,
  markRead,
  listLiveVisitors,
  listVisitorPageViews,
} from "@/lib/operator.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  MessageSquare,
  Settings as SettingsIcon,
  LogOut,
  User as UserIcon,
  Send,
  CheckCircle2,
  XCircle,
  Bot,
  Inbox,
  Eye,
  Globe,
  MapPin,
  Monitor,
  Mail,
  Link2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { EnableNotifications } from "@/components/EnableNotifications";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: Dashboard,
});

type Visitor = {
  id: string;
  name: string | null;
  email: string | null;
  ip_country: string | null;
  ip_city: string | null;
  ip_region: string | null;
  browser: string | null;
  os: string | null;
  current_page_url: string | null;
  current_page_title: string | null;
  user_agent?: string | null;
  referrer: string | null;
  last_seen_at?: string;
  created_at?: string;
};

type ConversationRow = {
  id: string;
  status: "bot" | "pending_human" | "human" | "closed";
  unread_for_operator: boolean;
  last_message_at: string;
  page_url: string | null;
  site_origin: string | null;
  visitor: Visitor | null;
};

function flagEmoji(country?: string | null): string {
  if (!country || country.length !== 2) return "🌐";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + country.toUpperCase().charCodeAt(0) - 65,
    A + country.toUpperCase().charCodeAt(1) - 65,
  );
}
function shortUrl(u?: string | null): string {
  if (!u) return "—";
  try {
    const x = new URL(u);
    return (x.host + x.pathname).replace(/\/$/, "") || x.host;
  } catch {
    return u.slice(0, 40);
  }
}

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchConversations = useServerFn(listConversations);
  const fetchLive = useServerFn(listLiveVisitors);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const convsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConversations(),
    refetchOnWindowFocus: true,
  });

  const liveQuery = useQuery({
    queryKey: ["live-visitors"],
    queryFn: () => fetchLive(),
    refetchInterval: 15000,
  });

  // Live updates via realtime — refetch list & active conv on change
  useEffect(() => {
    const channel = supabase
      .channel("dash-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          const convId = (payload.new as { conversation_id: string }).conversation_id;
          queryClient.invalidateQueries({ queryKey: ["conversation", convId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitors" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["live-visitors"] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const conversations: ConversationRow[] = convsQuery.data?.conversations ?? [];
  const liveVisitors: Visitor[] = liveQuery.data?.visitors ?? [];
  const active = conversations.find((c) => c.id === selectedId) ?? null;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const counts = {
    pending: conversations.filter((c) => c.status === "pending_human").length,
    open: conversations.filter((c) => c.status === "human").length,
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="font-semibold">Support Inbox</span>
          <Badge variant="secondary" className="ml-2 text-xs">
            {counts.pending} pending · {counts.open} open · {liveVisitors.length} live
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <EnableNotifications />
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings">
              <SettingsIcon className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr_300px]">
        {/* Left: Live visitors + Conversations */}
        <aside className="overflow-hidden border-r">
          <ScrollArea className="h-full">
            {/* Live visitors panel */}
            <div className="border-b bg-muted/30">
              <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                Live on site
                <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600">
                  {liveVisitors.length}
                </span>
              </div>
              {liveVisitors.length === 0 && (
                <p className="px-4 pb-3 text-xs text-muted-foreground">No one browsing right now.</p>
              )}
              <ul className="pb-2">
                {liveVisitors.map((v) => (
                  <li key={v.id} className="px-4 py-1.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      <span title={v.ip_country ?? ""}>{flagEmoji(v.ip_country)}</span>
                      <span className="truncate font-medium">
                        {v.email || v.name || `#${v.id.slice(0, 6)}`}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {v.browser ?? "—"}
                      </span>
                    </div>
                    <div className="ml-5 mt-0.5 truncate text-[11px] text-muted-foreground">
                      {shortUrl(v.current_page_url)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Conversations */}
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conversations
            </div>
            {convsQuery.isLoading && (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            )}
            {!convsQuery.isLoading && conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <Inbox className="h-10 w-10 opacity-40" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs">Drop the widget on your site and visitors will appear here.</p>
              </div>
            )}
            <ul>
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full flex-col items-start gap-1 border-b px-4 py-3 text-left transition hover:bg-muted/50 ${
                      selectedId === c.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <span>{flagEmoji(c.visitor?.ip_country)}</span>
                        <span className="truncate">
                          {c.visitor?.email || c.visitor?.name || `Visitor ${c.visitor?.id.slice(0, 6)}`}
                        </span>
                      </span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">{shortUrl(c.visitor?.current_page_url ?? c.page_url)}</span>
                      <span>{formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}</span>
                    </div>
                    {c.unread_for_operator && (
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" aria-label="unread" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </aside>

        {/* Center: Active conversation */}
        <main className="flex flex-col overflow-hidden">
          {active ? (
            <ConversationPane key={active.id} conversation={active} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 opacity-30" />
              <p className="text-sm">Select a conversation</p>
            </div>
          )}
        </main>

        {/* Right: Visitor info sidebar */}
        <aside className="hidden overflow-hidden border-l md:block">
          {active?.visitor ? (
            <VisitorPanel visitor={active.visitor} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
              Visitor details appear here.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function VisitorPanel({ visitor }: { visitor: Visitor }) {
  const fetchViews = useServerFn(listVisitorPageViews);
  const viewsQuery = useQuery({
    queryKey: ["visitor-views", visitor.id],
    queryFn: () => fetchViews({ data: { visitorId: visitor.id } }),
  });
  const views = viewsQuery.data?.views ?? [];
  const loc = [visitor.ip_city, visitor.ip_region, visitor.ip_country].filter(Boolean).join(", ");
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Visitor
          </p>
          <p className="mt-1 font-medium">
            {visitor.email || visitor.name || `#${visitor.id.slice(0, 8)}`}
          </p>
        </div>
        <Field icon={Mail} label="Email" value={visitor.email ?? "Not provided"} />
        <Field
          icon={Globe}
          label="Country"
          value={
            <span>
              {flagEmoji(visitor.ip_country)} {visitor.ip_country ?? "Unknown"}
            </span>
          }
        />
        <Field icon={MapPin} label="Location" value={loc || "Unknown"} />
        <Field
          icon={Monitor}
          label="Browser"
          value={`${visitor.browser ?? "Unknown"} · ${visitor.os ?? "Unknown"}`}
        />
        <Field icon={Eye} label="Current page" value={shortUrl(visitor.current_page_url)} />
        <Field icon={Link2} label="Referrer" value={shortUrl(visitor.referrer)} />
        {visitor.last_seen_at && (
          <Field
            icon={Eye}
            label="Last seen"
            value={formatDistanceToNow(new Date(visitor.last_seen_at), { addSuffix: true })}
          />
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent pages
          </p>
          {viewsQuery.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {!viewsQuery.isLoading && views.length === 0 && (
            <p className="text-xs text-muted-foreground">No page history yet.</p>
          )}
          <ul className="space-y-1.5">
            {views.map((v: any) => (
              <li key={v.id} className="text-xs">
                <a
                  href={v.page_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate font-medium hover:underline"
                  title={v.page_url}
                >
                  {v.page_title || shortUrl(v.page_url)}
                </a>
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(v.visited_at), { addSuffix: true })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ScrollArea>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-xs">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ConversationRow["status"] }) {
  if (status === "pending_human")
    return <Badge variant="destructive" className="text-[10px]">Wants human</Badge>;
  if (status === "human")
    return <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-[10px]">You</Badge>;
  if (status === "closed")
    return <Badge variant="outline" className="text-[10px]">Closed</Badge>;
  return (
    <Badge variant="secondary" className="gap-1 text-[10px]">
      <Bot className="h-3 w-3" /> Bot
    </Badge>
  );
}

type Message = {
  id: string;
  role: "visitor" | "assistant" | "operator" | "system";
  content: string;
  created_at: string;
};

function ConversationPane({ conversation }: { conversation: ConversationRow }) {
  const fetchConv = useServerFn(getConversation);
  const reply = useServerFn(sendReply);
  const setStatus = useServerFn(updateConversationStatus);
  const markReadFn = useServerFn(markRead);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const detailQuery = useQuery({
    queryKey: ["conversation", conversation.id],
    queryFn: () => fetchConv({ data: { conversationId: conversation.id } }),
  });

  useEffect(() => {
    markReadFn({ data: { conversationId: conversation.id } }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
    );
  }, [conversation.id, markReadFn, queryClient]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [detailQuery.data?.messages?.length]);

  const replyMut = useMutation({
    mutationFn: () => reply({ data: { conversationId: conversation.id, content: draft } }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["conversation", conversation.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const statusMut = useMutation({
    mutationFn: (action: "assign" | "close" | "reopen" | "release" | "block") =>
      setStatus({ data: { conversationId: conversation.id, action } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation", conversation.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const messages: Message[] = detailQuery.data?.messages ?? [];
  const visitor = (detailQuery.data?.conversation as any)?.visitor;

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {flagEmoji(visitor?.ip_country)}{" "}
            {visitor?.email || visitor?.name || `Visitor ${visitor?.id?.slice(0, 6)}`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {shortUrl(visitor?.current_page_url ?? conversation.page_url)} ·{" "}
            {visitor?.browser ?? "Unknown browser"}
          </p>
        </div>
        <div className="flex gap-1">
          {conversation.status !== "human" && conversation.status !== "closed" && (
            <Button size="sm" variant="default" onClick={() => statusMut.mutate("assign")}>
              <UserIcon className="mr-1 h-3.5 w-3.5" /> Take over
            </Button>
          )}
          {conversation.status === "human" && (
            <Button size="sm" variant="ghost" onClick={() => statusMut.mutate("release")}>
              Back to bot
            </Button>
          )}
          {conversation.status !== "closed" ? (
            <Button size="sm" variant="ghost" onClick={() => statusMut.mutate("close")}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Close
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => statusMut.mutate("reopen")}>
              Reopen
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm("Block this visitor?")) statusMut.mutate("block");
            }}
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-muted/20 p-4">
        {detailQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {messages.map((m) => (
            <MessageBubble key={m.id} m={m} />
          ))}
          {messages.length === 0 && !detailQuery.isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
          )}
        </div>
      </div>

      <div className="border-t bg-background p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) replyMut.mutate();
          }}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={conversation.status === "closed" ? "Reopen to reply…" : "Reply to visitor…"}
            disabled={conversation.status === "closed" || replyMut.isPending}
            rows={2}
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim()) replyMut.mutate();
              }
            }}
          />
          <Button type="submit" disabled={!draft.trim() || replyMut.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </>
  );
}

function MessageBubble({ m }: { m: Message }) {
  if (m.role === "system") {
    return (
      <div className="mx-auto rounded-full bg-muted px-3 py-1 text-center text-xs italic text-muted-foreground">
        {m.content}
      </div>
    );
  }
  const isVisitor = m.role === "visitor";
  const isOp = m.role === "operator";
  return (
    <div className={`flex ${isVisitor ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
          isVisitor
            ? "bg-background border"
            : isOp
            ? "bg-primary text-primary-foreground"
            : "bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50"
        }`}
      >
        <p className="whitespace-pre-wrap">{m.content}</p>
        <p className={`mt-1 text-[10px] opacity-60 ${isVisitor ? "" : "text-right"}`}>
          {m.role === "assistant" ? "AI · " : ""}
          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
