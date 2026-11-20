import { api, ApiError } from "../../lib/api";
import { renderPreview } from "../../lib/preview";

type AdminNote = Awaited<ReturnType<typeof api.admin.listNotes>>[number];
type FullNote = Awaited<ReturnType<typeof api.admin.getNote>>;
type Directory = Awaited<ReturnType<typeof api.notes.directory>>;

const $ = <T extends HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);

const loginForm = $<HTMLFormElement>("[data-login]");
const passwordInput = $<HTMLInputElement>("[data-password]");
const loginError = $<HTMLElement>("[data-login-error]");
const app = $<HTMLElement>("[data-app]");
const logoutButton = $<HTMLButtonElement>("[data-logout]");
const listEl = $<HTMLUListElement>("[data-list]");
const statusEl = $<HTMLElement>("[data-status]");
const editorForm = $<HTMLFormElement>("[data-editor]");
const titleInput = $<HTMLInputElement>("[data-title]");
const bodyInput = $<HTMLTextAreaElement>("[data-body]");
const metaEl = $<HTMLElement>("[data-meta]");
const previewEl = $<HTMLElement>("[data-preview]");
const previewToggle = $<HTMLButtonElement>("[data-preview-toggle]");
const messageEl = $<HTMLElement>("[data-message]");
const newButton = $<HTMLButtonElement>("[data-new]");
const publishButton = $<HTMLButtonElement>("[data-publish]");
const unpublishButton = $<HTMLButtonElement>("[data-unpublish]");
const deleteButton = $<HTMLButtonElement>("[data-delete]");
const imageInput = $<HTMLInputElement>("[data-image]");
const linkSelect = $<HTMLSelectElement>("[data-link-select]");
const insertLinkButton = $<HTMLButtonElement>("[data-insert-link]");

const TOKEN_KEY = "wiki_admin_token";
const DRAFT_KEY = "wiki_admin_draft";

let token = "";
let notes: AdminNote[] = [];
let titles: Record<string, string> = {};
let currentId: string | null = null;
let currentUpdatedAt: string | null = null;

function say(text: string, isError = false) {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.classList.toggle("text-accent", isError);
  messageEl.classList.toggle("text-muted", !isError);
}

function setVisible(element: HTMLElement | null, visible: boolean) {
  if (element) element.hidden = !visible;
}

async function boot() {
  token = localStorage.getItem(TOKEN_KEY) ?? "";
  if (!token) {
    setVisible(loginForm, true);
    return;
  }

  try {
    await refresh();
    showEditor();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      lock();
      return;
    }
    throw error;
  }
}

async function refresh() {
  notes = await api.admin.listNotes(token);
  const directory: Directory = await api.notes.directory();
  titles = Object.fromEntries(directory.map((entry) => [entry.slug, entry.title]));
  populateLinks(directory);
  renderList();
}

function showEditor() {
  setVisible(loginForm, false);
  setVisible(app, true);
  setVisible(logoutButton, true);
  restoreDraft();
}

function lock() {
  token = "";
  localStorage.removeItem(TOKEN_KEY);
  notes = [];
  currentId = null;
  setVisible(app, false);
  setVisible(logoutButton, false);
  setVisible(loginForm, true);
  loginForm?.reset();
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = "";

  for (const note of notes) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "block w-full truncate text-left hover:text-accent";
    button.textContent = `${note.status === "published" ? "●" : "○"} ${note.title}`;
    button.addEventListener("click", () => {
      void selectNote(note);
    });
    item.appendChild(button);
    listEl.appendChild(item);
  }

  if (statusEl) statusEl.textContent = `${notes.length} notes`;
}

async function selectNote(note: AdminNote) {
  try {
    const full: FullNote = await api.admin.getNote(note.id, token);
    currentId = full.id;
    currentUpdatedAt = full.updated_at;
    if (titleInput) titleInput.value = full.title;
    if (bodyInput) bodyInput.value = full.body;
    if (metaEl) {
      metaEl.textContent = `${full.status} · updated ${new Date(full.updated_at).toLocaleString()}`;
    }
    say("");
    renderPreviewIfVisible();
  } catch (error) {
    say(error instanceof Error ? error.message : "could not load note", true);
  }
}

function newNote() {
  currentId = null;
  currentUpdatedAt = null;
  if (titleInput) titleInput.value = "";
  if (bodyInput) bodyInput.value = "";
  if (metaEl) metaEl.textContent = "new";
  say("");
  titleInput?.focus();
}

async function save(): Promise<boolean> {
  const title = titleInput?.value.trim() ?? "";
  const body = bodyInput?.value ?? "";

  if (!title) {
    say("a title is required", true);
    return false;
  }

  try {
    if (currentId) {
      const updated = await api.admin.patchNote(
        currentId,
        { title, body, updatedAt: currentUpdatedAt ?? undefined },
        token,
      );
      currentUpdatedAt = updated.updated_at;
      if (metaEl) metaEl.textContent = `${updated.status} · saved`;
    } else {
      const created = await api.admin.createNote({ title, body }, token);
      currentId = created.id;
      currentUpdatedAt = created.updated_at;
      if (metaEl) metaEl.textContent = `${created.status} · created`;
    }

    localStorage.removeItem(DRAFT_KEY);
    await refresh();
    say("saved");
    return true;
  } catch (error) {
    say(error instanceof Error ? error.message : "save failed", true);
    return false;
  }
}

async function publish() {
  if (!(await save()) || !currentId) return;

  try {
    const note = await api.admin.publish(currentId, token);
    currentUpdatedAt = note.updated_at;
    if (metaEl) metaEl.textContent = `${note.status} · published`;

    let rebuild = "";
    try {
      await api.admin.rebuild(token);
      rebuild = " · rebuild triggered";
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 503 || error.status === 502)
      ) {
        rebuild = " · rebuild not configured yet";
      } else {
        throw error;
      }
    }

    await refresh();
    say(`published${rebuild}`);
  } catch (error) {
    say(error instanceof Error ? error.message : "publish failed", true);
  }
}

async function unpublish() {
  if (!currentId) return;

  try {
    const note = await api.admin.unpublish(currentId, token);
    currentUpdatedAt = note.updated_at;
    await refresh();
    say("unpublished");
  } catch (error) {
    say(error instanceof Error ? error.message : "unpublish failed", true);
  }
}

async function remove() {
  if (!currentId) return;
  if (!window.confirm("Delete this note? It is a soft delete.")) return;

  try {
    await api.admin.remove(currentId, token);
    newNote();
    await refresh();
    say("deleted");
  } catch (error) {
    say(error instanceof Error ? error.message : "delete failed", true);
  }
}

function renderPreviewIfVisible() {
  if (!previewEl || previewEl.hidden) return;
  previewEl.innerHTML = renderPreview(bodyInput?.value ?? "", titles);
}

previewToggle?.addEventListener("click", () => {
  if (!previewEl || !bodyInput) return;
  const showPreview = previewEl.hidden;
  previewEl.hidden = !showPreview;
  bodyInput.hidden = showPreview;
  previewToggle.textContent = showPreview ? "edit" : "preview";
  if (showPreview) renderPreviewIfVisible();
});

function insertAtCursor(text: string) {
  if (!bodyInput) return;
  const start = bodyInput.selectionStart ?? bodyInput.value.length;
  const end = bodyInput.selectionEnd ?? start;
  bodyInput.value =
    bodyInput.value.slice(0, start) + text + bodyInput.value.slice(end);
  const position = start + text.length;
  bodyInput.setSelectionRange(position, position);
  bodyInput.focus();
  saveDraft();
  renderPreviewIfVisible();
}

async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("could not encode image"))),
      "image/webp",
      0.82,
    );
  });
}

async function uploadImage(file: File) {
  if (!token) return;
  say("resizing image…");

  try {
    const blob = await resizeImage(file);
    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    const media = await api.admin.upload(blob, name, token);
    insertAtCursor(`\n![${file.name}](${media.url})\n`);
    say("image uploaded");
  } catch (error) {
    say(error instanceof Error ? error.message : "upload failed", true);
  }
}

function populateLinks(directory: Directory) {
  if (!linkSelect) return;
  linkSelect.innerHTML = "";
  for (const entry of directory) {
    const option = document.createElement("option");
    option.value = entry.slug;
    option.textContent = entry.title;
    linkSelect.appendChild(option);
  }
}

function saveDraft() {
  if (!titleInput || !bodyInput) return;
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ id: currentId, title: titleInput.value, body: bodyInput.value }),
    );
  } catch {
    /* private mode / quota */
  }
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw) as {
      id?: string | null;
      title?: string;
      body?: string;
    };
    if (!draft.title && !draft.body) return;

    if (titleInput) titleInput.value = draft.title ?? "";
    if (bodyInput) bodyInput.value = draft.body ?? "";
    currentId = draft.id ?? null;
    if (metaEl) metaEl.textContent = "restored draft";
    say("restored unsaved draft");
  } catch {
    /* malformed draft */
  }
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginError) loginError.hidden = true;

  try {
    const { token: fresh } = await api.auth.login(passwordInput?.value ?? "");
    token = fresh;
    localStorage.setItem(TOKEN_KEY, fresh);
    await refresh();
    showEditor();
  } catch (error) {
    if (loginError) {
      loginError.textContent =
        error instanceof Error ? error.message : "could not unlock";
      loginError.hidden = false;
    }
  }
});

editorForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});

newButton?.addEventListener("click", newNote);
publishButton?.addEventListener("click", () => void publish());
unpublishButton?.addEventListener("click", () => void unpublish());
deleteButton?.addEventListener("click", () => void remove());

imageInput?.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) void uploadImage(file);
  imageInput.value = "";
});

insertLinkButton?.addEventListener("click", () => {
  if (linkSelect?.value) insertAtCursor(`[[${linkSelect.value}]]`);
});

logoutButton?.addEventListener("click", lock);

bodyInput?.addEventListener("input", () => {
  saveDraft();
  renderPreviewIfVisible();
});
titleInput?.addEventListener("input", saveDraft);

void boot();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    /* offline support is optional */
  });
}
