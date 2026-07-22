// Safe localStorage user reader. Returns {} on missing/corrupt data instead of throwing.
export function safeUser() {
  try {
    const raw = localStorage.getItem('fg_user');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Corrupted JSON in localStorage; clear it to avoid repeated failures.
    try { localStorage.removeItem('fg_user'); } catch (_) {}
    return {};
  }
}
