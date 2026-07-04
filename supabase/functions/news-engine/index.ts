// Kalo news engine: ingest news from RSS sources (X pluggable later as
// another adapter), score each item ONCE, and hand the structured impact to
// the database, which shocks bot market-state and files market proposals /
// resolution suggestions for superadmin review.
//
// Scoring: Claude (Haiku) when ANTHROPIC_API_KEY is set as a function secret;
// a conservative keyword fallback otherwise, so the pipeline runs end to end
// before any key is configured. One LLM call per news item serves the whole
// bot fleet.
//
// Invoked on a schedule by pg_cron via pg_net (see migration 0015) and
// manually from the Command Centre. Auth: platform-verified JWT (anon key).

import { createClient } from "npm:@supabase/supabase-js@2";

type Feed = { source: string; url: string; category: string };

const FEEDS: Feed[] = [
  { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "Geopolitics" },
  { source: "BBC Politics", url: "https://feeds.bbci.co.uk/news/politics/rss.xml", category: "Politics" },
  { source: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "Economics" },
  { source: "BBC Football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", category: "World Cup" },
  { source: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml", category: "Sports" },
  { source: "BBC Tech", url: "https://feeds.bbci.co.uk/news/technology/rss.xml", category: "Tech" },
  { source: "BBC Culture", url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", category: "Culture" },
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "Crypto" },
];

const CATEGORIES = ["Politics", "Geopolitics", "Sports", "World Cup", "Crypto", "Tech", "Economics", "Culture"];
const ITEMS_PER_FEED = 6;
const SCORE_BATCH = 6;

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "").trim();
}

function parseRss(xml: string): { title: string; link: string; description: string; pubDate: string }[] {
  const items: { title: string; link: string; description: string; pubDate: string }[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    const block = m[0];
    const pick = (tag: string) => decode(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "");
    const title = pick("title");
    const link = pick("link") || decode(block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] ?? "");
    if (title && link.startsWith("http")) {
      items.push({ title, link, description: pick("description"), pubDate: pick("pubDate") });
    }
    if (items.length >= ITEMS_PER_FEED) break;
  }
  return items;
}

type Market = { id: string; question: string; category: string | null };
type Impact = {
  audiences: { category: string; sentiment: number; strength: number }[];
  matched_markets: { market_id: string; direction: number; strength: number }[];
  proposal: { question: string; criteria: string; category: string; close_at: string } | null;
  resolution: { market_id: string; outcome: "YES" | "NO"; rationale: string } | null;
};

const STOP = new Set(["the","a","an","of","to","in","on","for","and","or","is","are","will","be","by","with","at","as","this","that","after","before","over","its","his","her","their","from","has","have","was","were","not"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

function keywordScore(item: { title: string; category_hint: string | null }, markets: Market[]): Impact {
  const titleWords = words(item.title);
  const matched = markets
    .map((m) => {
      const overlap = [...words(m.question)].filter((w) => titleWords.has(w)).length;
      return { m, overlap };
    })
    .filter((x) => x.overlap >= 2)
    .slice(0, 3)
    // keywords cannot judge direction — heat-only nudge (direction 0)
    .map((x) => ({ market_id: x.m.id, direction: 0, strength: 0.3 }));
  return {
    audiences: item.category_hint ? [{ category: item.category_hint, sentiment: 0, strength: 0.3 }] : [],
    matched_markets: matched,
    proposal: null, // keyword mode cannot draft honest resolution criteria
    resolution: null,
  };
}

async function llmScore(
  apiKey: string,
  item: { title: string; summary: string | null; category_hint: string | null; url: string },
  markets: Market[],
): Promise<Impact | null> {
  const prompt = `You score news for a play-money prediction market. Audience categories: ${CATEGORIES.join(", ")}.

Open markets (id | category | question):
${markets.map((m) => `${m.id} | ${m.category ?? "General"} | ${m.question}`).join("\n")}

News item (source category hint: ${item.category_hint ?? "none"}):
TITLE: ${item.title}
SUMMARY: ${item.summary ?? "(none)"}

Return ONLY a JSON object:
{
 "audiences":[{"category":"<one of the categories>","sentiment":-1..1,"strength":0..1}],  // who cares and how much; [] if nobody
 "matched_markets":[{"market_id":"<uuid from list>","direction":-1..1,"strength":0..1}],  // direction: +1 pushes YES up; only genuinely related markets
 "proposal": null | {"question":"Will ...? (binary, unambiguous)","criteria":"Resolves YES if ... per <named public source>; otherwise NO. Cutoff ...","category":"<category>","close_at":"<ISO datetime 3-60 days out>"},
 "resolution": null | {"market_id":"<uuid>","outcome":"YES"|"NO","rationale":"..."}      // only if this news definitively settles a listed market
}
Only propose a market for genuinely bet-worthy, verifiable near-term events. Be conservative: most items deserve strength <= 0.4 and no proposal.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    console.error("anthropic error", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    const marketIds = new Set(markets.map((m) => m.id));
    return {
      audiences: (parsed.audiences ?? []).filter((a: { category: string }) => CATEGORIES.includes(a.category)).slice(0, 4),
      matched_markets: (parsed.matched_markets ?? []).filter((m: { market_id: string }) => marketIds.has(m.market_id)).slice(0, 4),
      proposal: parsed.proposal ?? null,
      resolution: parsed.resolution && marketIds.has(parsed.resolution.market_id) ? parsed.resolution : null,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  // ── 1. ingest ──────────────────────────────────────────────────────────
  let ingested = 0;
  await Promise.all(FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed.url, {
        signal: AbortSignal.timeout(8000),
        headers: { "user-agent": "kalo-news-engine/1.0" },
      });
      if (!res.ok) return;
      for (const item of parseRss(await res.text())) {
        const { data, error } = await supabase.rpc("news_ingest", {
          p_source: feed.source,
          p_url: item.link,
          p_title: item.title,
          p_summary: item.description || null,
          p_category_hint: feed.category,
          p_published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        });
        if (!error && data !== null) ingested++;
      }
    } catch (e) {
      console.error("feed failed", feed.source, e);
    }
  }));

  // ── 2. score pending items ────────────────────────────────────────────
  const [{ data: pending }, { data: markets }] = await Promise.all([
    supabase.from("news_items").select("id, title, summary, category_hint, url")
      .eq("status", "pending").order("fetched_at", { ascending: false }).limit(SCORE_BATCH),
    supabase.from("markets").select("id, question, category").eq("status", "open"),
  ]);

  let scored = 0, skipped = 0;
  for (const item of pending ?? []) {
    let impact: Impact | null = null;
    let scoredBy = "keywords";
    if (apiKey) {
      impact = await llmScore(apiKey, item, markets ?? []);
      if (impact) scoredBy = "llm";
    }
    if (!impact) impact = keywordScore(item, markets ?? []);

    const meaningful =
      impact.audiences.some((a) => a.strength > 0) ||
      impact.matched_markets.some((m) => m.strength > 0) ||
      impact.proposal || impact.resolution;

    if (!meaningful) {
      await supabase.rpc("news_skip", { p_news_id: item.id });
      skipped++;
      continue;
    }
    const { error } = await supabase.rpc("news_apply_impact", {
      p_news_id: item.id,
      p_audiences: impact.audiences,
      p_matched: impact.matched_markets,
      p_proposal: impact.proposal,
      p_resolution: impact.resolution,
      p_scored_by: scoredBy,
    });
    if (error) console.error("apply_impact failed", item.id, error.message);
    else scored++;
  }

  return new Response(
    JSON.stringify({ ingested, scored, skipped, llm: !!apiKey, at: new Date().toISOString() }),
    { headers: { "content-type": "application/json" } },
  );
});
