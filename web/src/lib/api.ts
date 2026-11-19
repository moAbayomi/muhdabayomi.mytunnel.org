import { z } from "zod";
import {
  NotePage,
  PaginatedNotes,
  DirectoryEntry,
  WikiStats,
  SearchResult,
  AdminNoteSummary,
  Note,
  RevisionSummary,
  NoteLinksReport,
  Media,
  CreateNoteInput,
  PatchNoteInput,
  type NoteKind,
  type NoteStatus,
} from "@repo/contracts";

const API_BASE = import.meta.env.PUBLIC_API_URL ?? "http://localhost:8787";

const ApiErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});

export class ApiError extends Error {
  public code?: string;
  public requestId?: string;
  public details?: unknown;

  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown,
  ) {
    const parsed = ApiErrorEnvelope.safeParse(body);
    super(
      parsed.success
        ? `${parsed.data.error.message} (${parsed.data.error.code})`
        : `API ${status} ${statusText}`,
    );
    this.name = "ApiError";
    if (parsed.success) {
      this.code = parsed.data.error.code;
      this.requestId = parsed.data.error.requestId;
      this.details = parsed.data.error.details;
    }
  }
}

interface RequestOptions<T extends z.ZodTypeAny> {
  schema: T;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  token?: string;
  fetcher?: typeof fetch;
}

async function request<T extends z.ZodTypeAny>(
  path: string,
  {
    schema,
    method = "GET",
    body,
    query,
    token,
    fetcher = fetch,
  }: RequestOptions<T>,
): Promise<z.infer<T>> {
  const url = new URL(path, API_BASE);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetcher(url.toString(), {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => undefined);
    throw new ApiError(res.status, res.statusText, errorBody);
  }

  if (res.status === 204) {
    return undefined as z.infer<T>;
  }

  const json = await res.json();
  return schema.parse(json);
}

// ─── Public Wiki / Notes API (/v1/*) ─────────────────────────────────

export const api = {
  notes: {
    list: (
      params?: {
        kind?: NoteKind;
        status?: NoteStatus;
        limit?: number;
        cursor?: string;
      },
      fetcher?: typeof fetch,
    ) =>
      request("/v1/notes", {
        schema: PaginatedNotes,
        query: { status: "published", ...params },
        fetcher,
      }),

    getBySlug: (slug: string, fetcher?: typeof fetch) =>
      request(`/v1/notes/${encodeURIComponent(slug)}`, {
        schema: NotePage,
        fetcher,
      }),

    directory: (fetcher?: typeof fetch) =>
      request("/v1/directory", {
        schema: z.array(DirectoryEntry),
        fetcher,
      }),

    stats: (fetcher?: typeof fetch) =>
      request("/v1/stats", {
        schema: z.array(WikiStats),
        fetcher,
      }),

    search: (q: string, fetcher?: typeof fetch) =>
      request("/v1/search", {
        schema: z.array(SearchResult),
        query: { q },
        fetcher,
      }),
  },

  // ─── Admin API (/v1/admin/*) ─────────────────────────────────────────

  admin: {
    listNotes: (token?: string, fetcher?: typeof fetch) =>
      request("/v1/admin/notes", {
        schema: z.array(AdminNoteSummary),
        token,
        fetcher,
      }),

    createNote: (
      input: CreateNoteInput,
      token?: string,
      fetcher?: typeof fetch,
    ) => {
      const payload = CreateNoteInput.parse(input);
      return request("/v1/admin/notes", {
        method: "POST",
        body: payload,
        schema: Note,
        token,
        fetcher,
      });
    },

    patchNote: (
      id: string,
      input: PatchNoteInput,
      token?: string,
      fetcher?: typeof fetch,
    ) => {
      const payload = PatchNoteInput.parse(input);
      return request(`/v1/admin/notes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: payload,
        schema: Note,
        token,
        fetcher,
      });
    },

    revisions: (id: string, token?: string, fetcher?: typeof fetch) =>
      request(`/v1/admin/notes/${encodeURIComponent(id)}/revisions`, {
        schema: z.array(RevisionSummary),
        token,
        fetcher,
      }),

    linksReport: (id: string, token?: string, fetcher?: typeof fetch) =>
      request(`/v1/admin/notes/${encodeURIComponent(id)}/links`, {
        schema: NoteLinksReport,
        token,
        fetcher,
      }),

    listMedia: (token?: string, fetcher?: typeof fetch) =>
      request("/v1/admin/media", {
        schema: z.array(Media),
        token,
        fetcher,
      }),
  },
};
