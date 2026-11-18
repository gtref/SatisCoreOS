export const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function recordName(path) { return path.slice(path.lastIndexOf("/") + 1); }

export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function appButton(label, action, secondary = false) {
  return `<button class="button ${secondary ? "button-secondary" : "button-primary"}" data-action="${action}">${label}</button>`;
}
