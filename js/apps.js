import { filesApp } from "./files.js";
import { notesApp } from "./notes.js";
import { terminalApp } from "./terminal.js";
import { systemApiApp } from "./system-api-app.js";
import { settingsApp } from "./settings.js";
import { browserApp } from "./browser.js";
import { appBuilderApp } from "./app-builder.js";

const iconStyles = {
  "app-builder": "linear-gradient(140deg,#ffd49e,#ff9f91)",
  files: "linear-gradient(140deg,#f3c975,#e9a94f)",
  notes: "linear-gradient(140deg,#91dcca,#57adad)",
  terminal: "linear-gradient(140deg,#9ca5c5,#747da2)",
  api: "linear-gradient(140deg,#d5b6ff,#9d77df)",
  settings: "linear-gradient(140deg,#b9bbc8,#85899e)",
  browser: "linear-gradient(140deg,#9ed8f2,#6399d1)"
};

export function registerBuiltInApps(os) {
  for (const app of [appBuilderApp, filesApp, notesApp, terminalApp, systemApiApp, settingsApp, browserApp]) {
    os.apps.register(app);
  }
}

export function renderLauncher(container, apps, openApp, query = "") {
  const filtered = apps.filter(app => `${app.name} ${app.description}`.toLowerCase().includes(query.toLowerCase()));
  container.innerHTML = filtered.map(app => `<button class="app-tile" data-launch-app="${escapeHtml(app.id)}" title="${escapeHtml(app.description)}">
    <span class="app-tile-icon" style="background:${iconStyles[app.id] ?? "linear-gradient(140deg,#b99aff,#7d61ba)"}">${escapeHtml(app.icon)}</span>
    <span>${escapeHtml(app.name)}</span></button>`).join("") || `<p class="muted" style="grid-column:1/-1;text-align:center;padding:20px">No apps match your search.</p>`;
  container.onclick = event => {
    const button = event.target.closest("[data-launch-app]");
    if (button) openApp(button.dataset.launchApp);
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
