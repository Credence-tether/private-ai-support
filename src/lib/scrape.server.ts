// Lightweight website scraper for building the AI knowledge base.
// Fetches a URL (+ a few same-origin links), strips HTML, returns plain text.
// Server-only. No external deps.

const MAX_PAGES = 8;
const MAX_BYTES_PER_PAGE = 400_000;
const MAX_TOTAL_CHARS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : "";
}

function extractLinks(html: string, baseUrl: URL): string[] {
  const out = new Set<string>();
  const re = /<a\s+[^>]*href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], baseUrl);
      if (u.origin !== baseUrl.origin) continue;
      if (!/^https?:$/.test(u.protocol)) continue;
      if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|mp3|css|js|ico)(\?|$)/i.test(u.pathname)) continue;
      u.hash = "";
      out.add(u.toString());
    } catch {
      /* ignore */
    }
  }
  return [...out];
}

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LovableChatBot/1.0 (+knowledge-base)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) throw new Error("not HTML");
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > MAX_BYTES_PER_PAGE ? buf.slice(0, MAX_BYTES_PER_PAGE) : buf;
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } finally {
    clearTimeout(timer);
  }
}

export type ScrapeResult = {
  text: string;
  pagesFetched: number;
  sourceUrls: string[];
};

export async function scrapeWebsite(startUrl: string): Promise<ScrapeResult> {
  const start = new URL(startUrl);
  const seen = new Set<string>();
  const queue: string[] = [start.toString()];
  const parts: string[] = [];
  const sources: string[] = [];

  while (queue.length > 0 && sources.length < MAX_PAGES) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const html = await fetchPage(url);
      const title = extractTitle(html);
      const text = stripHtml(html);
      if (text.length < 80) continue;
      parts.push(`# ${title || url}\nURL: ${url}\n\n${text}`);
      sources.push(url);
      if (sources.length === 1) {
        // Only discover links from the entry page.
        for (const link of extractLinks(html, start).slice(0, 25)) {
          if (!seen.has(link)) queue.push(link);
        }
      }
    } catch {
      /* skip page */
    }
  }

  let combined = parts.join("\n\n---\n\n");
  if (combined.length > MAX_TOTAL_CHARS) {
    combined = combined.slice(0, MAX_TOTAL_CHARS) + "\n…[truncated]";
  }
  if (!combined) throw new Error("Could not fetch any readable content from that URL.");
  return { text: combined, pagesFetched: sources.length, sourceUrls: sources };
}
