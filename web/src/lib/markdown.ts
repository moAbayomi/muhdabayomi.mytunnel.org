
import { Marked } from "marked";
import { codeToHtml } from "shiki";
import sanitizeHtml from "sanitize-html";

export type SlugTitleMap = Map<string, string> | Record<string, string>;

const WIKI_LINK_RE = /\[\[([a-zA-Z0-9-_]+)(?:\|([^\]]+))?\]\]/g;

function resolveSlug(slug: string, slugMap: SlugTitleMap): string | undefined {
  if (slugMap instanceof Map) {
    return slugMap.get(slug);
  }
  return Object.prototype.hasOwnProperty.call(slugMap, slug)
    ? slugMap[slug]
    : undefined;
}

function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Replaces `[[slug]]` (and optional `[[slug|Custom Label]]`) before Markdown parsing.
 * Known slugs become `[Title](/slug)`; unknown slugs render as muted `[[slug]]`.
 */
export function preprocessWikiLinks(
  markdown: string,
  slugMap: SlugTitleMap,
): string {
  return markdown.replace(WIKI_LINK_RE, (_match, slug: string, alias?: string) => {
    const title = resolveSlug(slug, slugMap);
    if (title !== undefined) {
      const label = (alias?.trim() || title).replaceAll("]", "\\]");
      return `[${label}](/${encodeURIComponent(slug)})`;
    }
    return `<span class="wiki-link-unresolved" title="Unresolved note: ${escapeHtml(slug)}">[[${escapeHtml(slug)}]]</span>`;
  });
}


const marked = new Marked({
  async: true,
  gfm: true,
  breaks: false,
  async walkTokens(token) {
    if (token.type === "code") {
      const language = token.lang?.trim() || "text";
      token.text = await codeToHtml(token.text, {
        lang: language,
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
        defaultColor: false,
      }).catch(() => {
        return `<pre class="shiki"><code>${escapeHtml(token.text)}</code></pre>`;
      });
      // Mark this token so the sync renderer knows it is already HTML
      token.lang = "__shiki_html__";
    }
  },
  renderer: {
    code({ text, lang }) {
      if (lang === "__shiki_html__") {
        return text;
      }
      return `<pre class="shiki"><code>${escapeHtml(text)}</code></pre>`;
    },
  },
});


const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img",
    "h1",
    "h2",
    "del",
    "ins",
    "sup",
    "sub",
    "details",
    "summary",
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ["href", "name", "target", "rel", "class"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    span: ["class", "style", "title"],
    pre: ["class", "style", "tabindex"],
    code: ["class", "style"],
    div: ["class", "style"],
    "*": ["id"],
  },
  // Allow Shiki's CSS color variables & inline styles on code blocks
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^var\(--shiki-/],
      "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^var\(--shiki-/],
      "--shiki-light": [/^#[0-9a-fA-F]{3,8}$/],
      "--shiki-dark": [/^#[0-9a-fA-F]{3,8}$/],
      "--shiki-light-bg": [/^#[0-9a-fA-F]{3,8}$/],
      "--shiki-dark-bg": [/^#[0-9a-fA-F]{3,8}$/],
      "font-style": [/^(italic|normal)$/],
      "font-weight": [/^(bold|normal|[1-9]00)$/],
      "text-decoration": [/^(underline|line-through|none)$/],
    },
  },
};

/**
 * Full pipeline:
 * 1. Resolve `[[slug]]` wiki-links against the build's slug->title map
 * 2. Parse Markdown + highlight fenced code blocks via Shiki
 * 3. Sanitize resulting HTML against XSS while preserving Shiki styles
 */
export async function renderMarkdown(
  markdown: string,
  slugMap: SlugTitleMap = {},
): Promise<string> {
  const preprocessed = preprocessWikiLinks(markdown, slugMap);
  const rawHtml = await marked.parse(preprocessed);
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}