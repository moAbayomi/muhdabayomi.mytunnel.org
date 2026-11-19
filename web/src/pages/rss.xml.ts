
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { api } from "../lib/api";

export async function GET(context: APIContext) {
  // Fetch recently updated entries from /v1/directory (already includes updated_at & title)
  const directory = await api.notes.directory();

  const sorted = [...directory]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .slice(0, 20);

  return rss({
    title: "Muhd Abayomi — Recently Updated",
    description: "Recently updated notes, pages, and projects from the wiki.",
    site: context.site ?? "https://mytunnel.org",
    items: sorted.map((entry) => ({
      title: entry.title,
      pubDate: new Date(entry.updated_at),
      link: `/${entry.slug}/`,
      description: `${entry.kind} · ${entry.reading_minutes} min read`,
    })),
  });
}