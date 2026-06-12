import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MessageSquare, Bell, Bot } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Support Inbox — Live chat for your website" },
      {
        name: "description",
        content: "Self-hosted AI-powered live chat with operator dashboard and push notifications.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  if (signedIn) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="flex items-center justify-between border-b bg-background/60 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="font-semibold">Support Inbox</span>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Operator sign in</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Your own live support, powered by AI.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Drop one script on your website. Visitors chat with AI instantly. When they want a human,
          you get pinged on your phone.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Open dashboard</Link>
          </Button>
        </div>
        <div className="mt-14 grid gap-4 text-left md:grid-cols-3">
          <Feature icon={<Bot className="h-5 w-5" />} title="Groq-powered AI">
            Fast, accurate replies handle the common questions automatically.
          </Feature>
          <Feature icon={<Bell className="h-5 w-5" />} title="Push to your phone">
            Install as a PWA and get notified the moment a visitor wants a human.
          </Feature>
          <Feature icon={<MessageSquare className="h-5 w-5" />} title="Embed anywhere">
            One <code className="rounded bg-muted px-1 text-xs">&lt;script&gt;</code> tag works on
            any website.
          </Feature>
        </div>
      </main>
    </div>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
