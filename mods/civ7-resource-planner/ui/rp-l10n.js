// Use the game's text language and native English fallback, never the OS locale.
export const t = (key, ...args) => Locale.compose(`LOC_RP_${key}`, ...args);

// Pure planner/settings code can report a key without requiring the game API.
export function errorMessage(error) {
  const message=error?.message ?? String(error);
  return /^LOC_RP_[A-Z_]+$/.test(message)?Locale.compose(message):message;
}
