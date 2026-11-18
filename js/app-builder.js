import { escapeHtml } from "./app-utils.js";

const STORAGE_KEY = "satiscoreos-user-apps";
const ICONS = ["✦", "✿", "☀", "♥", "☕", "🎨", "📚", "✓"];
const ACCENTS = {
  violet: "#b99aff",
  ocean: "#83c8ed",
  mint: "#82d9ba",
  sunset: "#ffad91",
  lemon: "#f0d477"
};
const TEMPLATES = {
  blank: { name: "", description: "", intro: "", message: "" },
  welcome: { name: "Welcome Home", description: "A friendly hello for your space", intro: "Make yourself at home. This little space is yours.", message: "Welcome back! ✨" },
  focus: { name: "Focus Buddy", description: "A small nudge to stay on track", intro: "One thing at a time. Pick your next small step and get started.", message: "Nice work showing up. Keep going!" },
  checklist: { name: "Tiny Wins", description: "A checklist for today's little wins", intro: "A few small things to make today feel good.", message: "One more tiny win!" }
};

function readSavedApps() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let apps;
  try {
    apps = JSON.parse(raw);
  } catch {
    throw new Error("Your saved app data is not valid JSON. Clear the local SatisCoreOS app storage to start fresh.");
  }
  if (!Array.isArray(apps) || apps.some(app =>
    !app || typeof app.id !== "string" || !app.id.startsWith("custom-") ||
    !["name", "icon", "description", "intro", "buttonLabel", "message"].every(key => typeof app[key] === "string") ||
    (app.mode !== undefined && !["message", "counter", "checklist"].includes(app.mode)) ||
    (app.accent !== undefined && !(app.accent in ACCENTS)) ||
    (app.items !== undefined && (!Array.isArray(app.items) || app.items.some(item => typeof item !== "string"))) ||
    (app.completed !== undefined && (!Array.isArray(app.completed) || app.completed.some(item => typeof item !== "boolean"))) ||
    (app.count !== undefined && (!Number.isSafeInteger(app.count) || app.count < 0))
  )) {
    throw new Error("Your saved app data has an unsupported format.");
  }
  return apps;
}

function saveApps(apps) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
}

function createUserApp(config) {
  const mode = config.mode ?? "message";
  const accent = ACCENTS[config.accent] ?? ACCENTS.violet;
  const items = Array.isArray(config.items) ? config.items : [];
  const completed = Array.isArray(config.completed) ? config.completed : [];
  return Object.freeze({
    id: config.id,
    name: config.name,
    icon: config.icon,
    description: config.description,
    mount(root, api) {
      root.innerHTML = `<section class="user-app" style="--user-accent:${accent}">
        <span class="user-app-icon">${escapeHtml(config.icon)}</span>
        <p class="eyebrow">MADE IN APP STUDIO</p>
        <h2>${escapeHtml(config.name)}</h2>
        <p class="user-app-intro">${escapeHtml(config.intro)}</p>
        ${mode === "checklist"
          ? `<ul class="user-checklist">${items.map((item, index) => `<li><label><input type="checkbox" data-check-item="${index}" ${completed[index] ? "checked" : ""}><span>${escapeHtml(item)}</span></label></li>`).join("")}</ul>
            <form class="user-add-item"><input name="item" maxlength="80" placeholder="Add a task..." aria-label="New checklist task"><button class="button button-secondary" type="submit">Add</button></form>`
          : mode === "counter"
            ? `<div class="user-counter" aria-live="polite">${config.count ?? 0}</div><div class="user-counter-controls"><button class="button button-secondary" type="button" data-counter="decrease" aria-label="Decrease count">−</button><button class="button button-primary" type="button" data-counter="increase">${escapeHtml(config.buttonLabel)}</button><button class="button button-secondary" type="button" data-counter="reset">Reset</button></div>`
            : `<button class="button button-primary" type="button">${escapeHtml(config.buttonLabel)}</button>`}
      </section>`;
      if (mode === "counter") {
        let count = config.count ?? 0;
        const counter = root.querySelector(".user-counter");
        counter.textContent = String(count);
        root.querySelector(".user-counter-controls").addEventListener("click", event => {
          const action = event.target.closest("[data-counter]")?.dataset.counter;
          if (!action) return;
          count = action === "reset" ? 0 : Math.max(0, count + (action === "decrease" ? -1 : 1));
          counter.textContent = String(count);
          counter.classList.remove("counter-pop");
          requestAnimationFrame(() => counter.classList.add("counter-pop"));
          try { updateSavedApp(config.id, { count }); }
          catch (error) { api.ui.notify(`Counter value could not be saved: ${error.message}`, { type: "error" }); }
        });
      } else if (mode === "checklist") {
        const list = root.querySelector(".user-checklist");
        list.addEventListener("change", event => {
          const input = event.target.closest("[data-check-item]");
          if (!input) return;
          completed[Number(input.dataset.checkItem)] = input.checked;
          try { updateSavedApp(config.id, { completed }); }
          catch (error) { api.ui.notify(`Checklist progress could not be saved: ${error.message}`, { type: "error" }); }
        });
        root.querySelector(".user-add-item").addEventListener("submit", event => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("item");
          const value = input.value.trim();
          if (!value) return;
          const row = document.createElement("li");
          const label = document.createElement("label");
          const checkbox = document.createElement("input");
          const text = document.createElement("span");
          checkbox.type = "checkbox";
          text.textContent = value;
          label.append(checkbox, text);
          row.append(label);
          list.append(row);
          items.push(value);
          completed.push(false);
          try { updateSavedApp(config.id, { items, completed }); }
          catch (error) { api.ui.notify(`Checklist item could not be saved: ${error.message}`, { type: "error" }); }
          input.value = "";
        });
      } else {
        root.querySelector(".user-app .button").addEventListener("click", () => api.ui.notify(config.message));
      }
    }
  });
}

function updateSavedApp(id, changes) {
  const apps = readSavedApps();
  const index = apps.findIndex(app => app.id === id);
  if (index < 0) return;
  apps[index] = { ...apps[index], ...changes };
  saveApps(apps);
}

export function registerSavedApps(os) {
  for (const app of readSavedApps()) os.apps.register(createUserApp(app));
}

function mountAppBuilder(root, api) {
  root.innerHTML = `<div class="builder-app">
    <header class="builder-heading">
      <div><p class="eyebrow">NO CODE, JUST YOUR IDEAS</p><h2 class="app-heading">App Studio</h2>
      <p class="muted">Start from a template, choose how it works, and tune the look. Your apps stay in this browser.</p></div>
      <span class="builder-sparkle" aria-hidden="true">✦</span>
    </header>
    <div class="builder-layout">
      <form class="builder-form" id="builder-form">
        <label class="builder-field">Start from a template<select name="template">
          <option value="blank">Start from scratch</option><option value="welcome">Friendly welcome</option>
          <option value="focus">Focus buddy</option><option value="checklist">Tiny checklist</option>
        </select></label>
        <label class="builder-field">App name<input name="name" maxlength="36" placeholder="e.g. Daily Boost" required></label>
        <div class="builder-field-row">
          <label class="builder-field">Pick an icon<select name="icon">${ICONS.map(icon => `<option value="${icon}">${icon}</option>`).join("")}</select></label>
          <label class="builder-field">Button label<input name="buttonLabel" maxlength="24" value="Say hello" required></label>
        </div>
        <label class="builder-field">Short description<input name="description" maxlength="72" placeholder="A little something for every day" required></label>
        <label class="builder-field">What should it say?<textarea name="intro" maxlength="220" rows="3" placeholder="Add a thought, reminder, or bit of inspiration..." required></textarea></label>
        <div class="builder-field-row">
          <label class="builder-field">App behavior<select name="mode">
            <option value="message">Encouraging message</option><option value="counter">Click counter</option><option value="checklist">Checklist</option>
          </select></label>
          <label class="builder-field">Accent color<select name="accent">
            <option value="violet">Violet</option><option value="ocean">Ocean</option><option value="mint">Mint</option><option value="sunset">Sunset</option><option value="lemon">Lemon</option>
          </select></label>
        </div>
        <label class="builder-field" data-message-field>On click, show this message<input name="message" maxlength="120" placeholder="You made something lovely!" required></label>
        <label class="builder-field hidden" data-items-field>Starting checklist items<textarea name="items" maxlength="600" rows="3" placeholder="One task per line"></textarea><span class="builder-help">Add up to 12 items. Your app can add more later.</span></label>
        <button class="button button-primary builder-submit" type="submit">Create my app <span>→</span></button>
      </form>
      <aside class="builder-preview-wrap">
        <p class="builder-preview-label">LIVE PREVIEW</p><div class="builder-preview" id="builder-preview"></div>
        <section class="builder-saved"><div class="builder-saved-heading"><h3>Your apps</h3><span id="saved-app-count">0</span></div>
          <label class="builder-app-search"><span>⌕</span><input id="builder-app-search" type="search" placeholder="Find your app..." aria-label="Search your created apps"></label>
          <div class="builder-saved-list" id="saved-app-list"></div></section>
      </aside>
    </div>
  </div>`;

  const form = root.querySelector("#builder-form");
  const preview = root.querySelector("#builder-preview");
  const savedList = root.querySelector("#saved-app-list");
  const savedCount = root.querySelector("#saved-app-count");
  const messageField = root.querySelector("[data-message-field]");
  const itemsField = root.querySelector("[data-items-field]");
  const searchInput = root.querySelector("#builder-app-search");
  let editingId = null;

  const currentConfig = () => {
    const data = new FormData(form);
    const get = (key, fallback) => String(data.get(key) || "").trim() || fallback;
    return {
      name: get("name", "Your app"),
      icon: get("icon", "✦"),
      intro: get("intro", "Your words will show up here."),
      buttonLabel: get("buttonLabel", "Say hello"),
      mode: get("mode", "message"),
      accent: get("accent", "violet"),
      message: get("message", "You made something lovely!"),
      items: String(data.get("items") || "").split("\n").map(item => item.trim()).filter(Boolean).slice(0, 12)
    };
  };

  const updatePreview = () => {
    const config = currentConfig();
    preview.style.setProperty("--user-accent", ACCENTS[config.accent]);
    const behavior = config.mode === "checklist"
      ? `<ul class="user-checklist">${(config.items.length ? config.items : ["Add your first task"]).map(item => `<li><label><input type="checkbox"><span>${escapeHtml(item)}</span></label></li>`).join("")}</ul>`
      : config.mode === "counter"
        ? `<div class="user-counter">0</div><div class="user-counter-controls"><button class="button button-secondary" type="button" data-counter="decrease" aria-label="Decrease count">−</button><button class="button button-primary" type="button" data-counter="increase">${escapeHtml(config.buttonLabel)}</button><button class="button button-secondary" type="button" data-counter="reset">Reset</button></div>`
        : `<button class="button button-primary" type="button">${escapeHtml(config.buttonLabel)}</button>`;
    preview.innerHTML = `<span class="user-app-icon">${escapeHtml(config.icon)}</span>
      <p class="eyebrow">MADE IN APP STUDIO</p><h3>${escapeHtml(config.name)}</h3>
      <p class="user-app-intro">${escapeHtml(config.intro)}</p>${behavior}`;
    messageField.classList.toggle("hidden", config.mode !== "message");
    itemsField.classList.toggle("hidden", config.mode !== "checklist");
    form.elements.message.required = config.mode === "message";
  };

  const refreshSavedApps = () => {
    const saved = readSavedApps();
    savedCount.textContent = String(saved.length);
    const filtered = saved.filter(app => `${app.name} ${app.description}`.toLowerCase().includes(searchInput.value.trim().toLowerCase()));
    savedList.innerHTML = filtered.map(app => `<div class="builder-saved-item">
      <button class="builder-saved-open" type="button" data-open-app="${escapeHtml(app.id)}"><span>${escapeHtml(app.icon)}</span><span>${escapeHtml(app.name)}</span></button>
      <button class="builder-item-action" type="button" data-edit-app="${escapeHtml(app.id)}" aria-label="Edit ${escapeHtml(app.name)}" title="Edit app">✎</button>
      <button class="builder-item-action" type="button" data-duplicate-app="${escapeHtml(app.id)}" aria-label="Duplicate ${escapeHtml(app.name)}" title="Duplicate app">⧉</button>
      <button class="builder-delete" type="button" data-remove-app="${escapeHtml(app.id)}" aria-label="Delete ${escapeHtml(app.name)}" title="Delete app">×</button>
    </div>`).join("") || `<p class="builder-empty">${saved.length ? "No apps match your search." : "Your creations will show up here."}</p>`;
  };

  const resetForm = () => {
    editingId = null;
    form.reset();
    form.elements.template.value = "blank";
    form.querySelector(".builder-submit").innerHTML = 'Create my app <span>→</span>';
    let cancel = form.querySelector("[data-cancel-edit]");
    if (cancel) cancel.remove();
    updatePreview();
  };

  const beginEdit = config => {
    editingId = config.id;
    form.elements.template.value = "blank";
    form.elements.name.value = config.name;
    form.elements.icon.value = config.icon;
    form.elements.buttonLabel.value = config.buttonLabel;
    form.elements.description.value = config.description;
    form.elements.intro.value = config.intro;
    form.elements.mode.value = config.mode ?? "message";
    form.elements.accent.value = config.accent ?? "violet";
    form.elements.message.value = config.message;
    form.elements.items.value = (config.items ?? []).join("\n");
    form.querySelector(".builder-submit").innerHTML = 'Save changes <span>✓</span>';
    if (!form.querySelector("[data-cancel-edit]")) {
      const cancel = document.createElement("button");
      cancel.className = "button button-secondary";
      cancel.type = "button";
      cancel.dataset.cancelEdit = "";
      cancel.textContent = "Cancel editing";
      form.append(cancel);
    }
    updatePreview();
    form.elements.name.focus();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  searchInput.addEventListener("input", refreshSavedApps);
  form.addEventListener("click", event => {
    if (event.target.closest("[data-cancel-edit]")) resetForm();
  });
  form.addEventListener("input", updatePreview);
  form.addEventListener("change", event => {
    if (event.target.name === "template") {
      const preset = TEMPLATES[event.target.value];
      form.elements.name.value = preset.name;
      form.elements.description.value = preset.description;
      form.elements.intro.value = preset.intro;
      form.elements.message.value = preset.message;
      if (event.target.value === "checklist") {
        form.elements.mode.value = "checklist";
        form.elements.items.value = "Drink a glass of water\nStep outside for a minute\nCelebrate one small win";
      } else {
        form.elements.mode.value = "message";
        form.elements.items.value = "";
      }
    }
    updatePreview();
  });
  preview.addEventListener("click", event => {
    const config = currentConfig();
    if (config.mode === "message" && event.target.closest("button") && config.message) api.ui.notify(config.message);
    if (config.mode === "counter" && event.target.closest("button")) {
      const counter = preview.querySelector(".user-counter");
      const action = event.target.closest("[data-counter]")?.dataset.counter;
      const value = Number(counter.textContent);
      counter.textContent = String(action === "reset" ? 0 : value + (action === "decrease" ? -1 : 1));
    }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const name = String(data.get("name")).trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-app";
    const config = {
      id: editingId ?? `custom-${slug}-${Date.now().toString(36)}`,
      name,
      icon: String(data.get("icon")),
      description: String(data.get("description")).trim(),
      intro: String(data.get("intro")).trim(),
      buttonLabel: String(data.get("buttonLabel")).trim(),
      message: String(data.get("message")).trim(),
      mode: String(data.get("mode")),
      accent: String(data.get("accent")),
      items: String(data.get("items") || "").split("\n").map(item => item.trim()).filter(Boolean).slice(0, 12),
      count: 0,
      completed: []
    };
    try {
      const saved = readSavedApps();
      const existing = editingId ? saved.find(app => app.id === editingId) : null;
      if (existing) {
        if (config.mode === "counter" && existing.mode === "counter") config.count = existing.count ?? 0;
        if (config.mode === "checklist" && existing.mode === "checklist") {
          config.completed = config.items.map((item, index) => existing.items?.[index] === item ? existing.completed?.[index] ?? false : false);
        }
        const next = saved.map(app => app.id === editingId ? { ...app, ...config } : app);
        saveApps(next);
        api.apps.remove(editingId);
        api.apps.register(createUserApp(next.find(app => app.id === editingId)));
      } else {
        const baseId = config.id;
        let suffix = 2;
        while (saved.some(app => app.id === config.id) || api.apps.list().some(app => app.id === config.id)) {
          config.id = `${baseId}-${suffix}`;
          suffix += 1;
        }
        api.apps.register(createUserApp(config));
        try {
          saveApps([...saved, config]);
        } catch (error) {
          api.apps.remove(config.id);
          throw error;
        }
      }
      refreshSavedApps();
      api.ui.notify(editingId ? `${name} was updated.` : `${name} is ready in your app library.`);
      resetForm();
    } catch (error) {
      api.ui.notify(`Could not create app: ${error.message}`, { type: "error" });
    }
  });

  savedList.addEventListener("click", event => {
    const openButton = event.target.closest("[data-open-app]");
    if (openButton) {
      api.apps.open(openButton.dataset.openApp).catch(error => api.ui.notify(error.message, { type: "error" }));
      return;
    }
    const editButton = event.target.closest("[data-edit-app]");
    if (editButton) {
      const config = readSavedApps().find(app => app.id === editButton.dataset.editApp);
      if (config) beginEdit(config);
      return;
    }
    const duplicateButton = event.target.closest("[data-duplicate-app]");
    if (duplicateButton) {
      try {
        const saved = readSavedApps();
        const original = saved.find(app => app.id === duplicateButton.dataset.duplicateApp);
        if (!original) throw new Error("That app no longer exists.");
        const copy = { ...original, items: [...(original.items ?? [])], completed: [...(original.completed ?? [])], name: `${original.name} copy` };
        const slug = copy.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-app";
        copy.id = `custom-${slug}-${Date.now().toString(36)}`;
        api.apps.register(createUserApp(copy));
        try {
          saveApps([...saved, copy]);
        } catch (error) {
          api.apps.remove(copy.id);
          throw error;
        }
        refreshSavedApps();
        api.ui.notify(`${copy.name} was duplicated.`);
      } catch (error) {
        api.ui.notify(`Could not duplicate app: ${error.message}`, { type: "error" });
      }
      return;
    }
    const removeButton = event.target.closest("[data-remove-app]");
    if (!removeButton) return;
    const id = removeButton.dataset.removeApp;
    try {
      const next = readSavedApps().filter(app => app.id !== id);
      saveApps(next);
      api.apps.remove(id);
      refreshSavedApps();
      api.ui.notify("App deleted.");
    } catch (error) {
      api.ui.notify(`Could not delete app: ${error.message}`, { type: "error" });
    }
  });

  updatePreview();
  refreshSavedApps();
}

export const appBuilderApp = Object.freeze({
  id: "app-builder",
  name: "App Studio",
  icon: "✦",
  description: "Make and manage your own mini apps, no code needed.",
  mount: mountAppBuilder
});
