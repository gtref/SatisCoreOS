import { filesApp } from "./files.js";
import { notesApp } from "./notes.js";
import { terminalApp } from "./terminal.js";
import { systemApiApp } from "./system-api-app.js";
import { settingsApp } from "./settings.js";
import { browserApp } from "./browser.js";
import { appBuilderApp } from "./app-builder.js";
import { calculatorApp } from "./calculator.js";
import { calendarApp } from "./calendar.js";
import { converterApp } from "./converter.js";

const iconStyles = {
  "app-builder": "linear-gradient(140deg,#ffd49e,#ff9f91)",
  calculator: "linear-gradient(140deg,#b8e4dc,#72c7b9)",
  calendar: "linear-gradient(140deg,#f6c6d0,#df8fa7)",
  calendar: "linear-gradient(140deg,#f6c6d0,#df8fa7)",
  converter: "linear-gradient(140deg,#b8c9f0,#829cda)",
  files: "linear-gradient(140deg,#f3c975,#e9a94f)",
  notes: "linear-gradient(140deg,#91dcca,#57adad)",
  terminal: "linear-gradient(140deg,#9ca5c5,#747da2)",
  api: "linear-gradient(140deg,#d5b6ff,#9d77df)",
  settings: "linear-gradient(140deg,#b9bbc8,#85899e)",
  browser: "linear-gradient(140deg,#9ed8f2,#6399d1)",
  converter: "linear-gradient(140deg,#b8c9f0,#829cda)"
};

export function registerBuiltInApps(os) {
  for (const app of [appBuilderApp, filesApp, notesApp, terminalApp, calculatorApp, calendarApp, converterApp, systemApiApp, settingsApp, browserApp]) {
    os.apps.register(app);
  }
}

export function renderLauncher(container, apps, openApp, query = "", pinnedApps = new Set(), togglePin = () => {}) {
  const filtered = apps.filter(app => `${app.name} ${app.description}`.toLowerCase().includes(query.toLowerCase()));
  container.innerHTML = filtered.map(app => {
    const pinned = pinnedApps.has(app.id);
    return `<div class="app-tile" title="${escapeHtml(app.description)}">
      <button class="app-tile-launch" data-launch-app="${escapeHtml(app.id)}">
        <span class="app-tile-icon" style="background:${iconStyles[app.id] ?? "linear-gradient(140deg,#b99aff,#7d61ba)"}">${escapeHtml(app.icon)}</span>
        <span>${escapeHtml(app.name)}</span></button>
      <button class="app-pin-toggle ${pinned ? "is-pinned" : ""}" type="button" data-toggle-pin="${escapeHtml(app.id)}" aria-pressed="${pinned}" aria-label="${pinned ? "Unpin" : "Pin"} ${escapeHtml(app.name)}">${pinned ? "Unpin" : "Pin"}</button>
    </div>`;
  }).join("") || `<p class="muted" style="grid-column:1/-1;text-align:center;padding:20px">No apps match your search.</p>`;
  container.onclick = event => {
    const pinButton = event.target.closest("[data-toggle-pin]");
    if (pinButton) {
      togglePin(pinButton.dataset.togglePin);
      return;
    }
    const button = event.target.closest("[data-launch-app]");
    if (button) openApp(button.dataset.launchApp);
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
