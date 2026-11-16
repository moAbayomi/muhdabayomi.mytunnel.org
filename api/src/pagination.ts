export function encodeCursor(updated_at: string, id: string): string {
  const json = JSON.stringify({ u: updated_at, i: id });
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCursor(cursor: string): { u: string; i: string } | null {
  try {
    const padded = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
    const parsed = JSON.parse(json);
    if (typeof parsed.u !== 'string' || typeof parsed.i !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}