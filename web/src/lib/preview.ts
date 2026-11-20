import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Lightweight preview for the admin editor.
 *
 * Deliberately does NOT import the build-time renderer: that pulls in Shiki
 * and its language grammars (~1 MB) into the admin bundle. Code blocks show
 * as plain <pre> here; the published page still gets full highlighting.
 */
const marked = new Marked({ gfm: true, breaks: false });

const WIKI_LINK = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/gi;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1"]),
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};

export function renderPreview(
  markdown: string,
  titles: Record<string, string> = {},
): string {
  const withWikiLinks = markdown.replace(
    WIKI_LINK,
    (_match, slug: string, alias?: string) => {
      const title = titles[slug];
      if (!title) return `\`[[${slug}]]\``;
      return `[${(alias?.trim() || title).replaceAll("]", "\\]")}](/${slug})`;
    },
  );

  return sanitizeHtml(marked.parse(withWikiLinks) as string, OPTIONS);
}
