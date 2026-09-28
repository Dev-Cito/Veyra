const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for an HTML element body or a quoted attribute value.
 * Every user-provided value (workspace names, task titles, user names...)
 * goes through it before being interpolated into an email's HTML part.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Collapses a value to one line, for headers such as Subject. */
export function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
