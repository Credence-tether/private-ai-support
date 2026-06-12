import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
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
} from "@/lib/operator.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { EnableNotifications } from "@/components/EnableNotifications";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: Dashboard,
});

type ConversationRow = {
  id: string;
  status: "bot" | "pending_human" | "human" | "closed";
  unread_for_operator: boolean;
  last_message_at: string;
  page_url: string | null;
  site_origin: string | null;
  visitor: { id: string; name: string | null; email: string | null; ip_country: string | null } | null;
};

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchConversations = useServerFn(listConversations);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const convsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConversations(),
    refetchOnWindowFocus: true,
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const conversations: ConversationRow[] = convsQuery.data?.conversations ?? [];
  const filtered = conversations;
  const active = filtered.find((c) => c.id === selectedId) ?? null;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const counts = {
    pending: conversations.filter((c) => c.status === "pending_human").length,
    open: conversations.filter((c) => c.status === "human").length,
    bot: conversations.filter((c) => c.status === "bot").length,
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Topbar */}
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="font-semibold">Support Inbox</span>
          <Badge variant="secondary" className="ml-2 text-xs">
            {counts.pending} pending · {counts.open} open
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

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <aside className="overflow-hidden border-r">
          <ScrollArea className="h-full">
            {convsQuery.isLoading && (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            )}
            {!convsQuery.isLoading && filtered.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <Inbox className="h-10 w-10 opacity-40" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs">Drop the widget on your site and visitors will appear here.</p>
              </div>
            )}
            <ul>
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full flex-col items-start gap-1 border-b px-4 py-3 text-left transition hover:bg-muted/50 ${
                      selectedId === c.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <UserIcon className="h-3.5 w-3.5 opacity-60" />
                        {c.visitor?.name || c.visitor?.email || `Visitor ${c.visitor?.id.slice(0, 6)}`}
                      </span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">{c.page_url ? new URL(c.page_url).pathname : c.site_origin}</span>
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

        {/* Active conversation */}
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

  // Mark as read on open
  useEffect(() => {
    markReadFn({ data: { conversationId: conversation.id } }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
    );
  }, [conversation.id, markReadFn, queryClient]);

  // Scroll to bottom on new messages
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
        <div>
          <p className="text-sm font-semibold">
            {visitor?.name || visitor?.email || `Visitor ${visitor?.id?.slice(0, 6)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {conversation.page_url || conversation.site_origin || "Unknown source"}
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
