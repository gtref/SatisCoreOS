import { appButton } from "./app-utils.js";

async function mountSettings(root, api) {
  root.innerHTML = `<div class="settings-app">
    <p class="eyebrow">PERSONALIZE YOUR SPACE</p><h2 class="app-heading">Settings</h2>
    <p class="muted">System information, storage and portable backups.</p>
    <section class="settings-card"><div class="settings-row"><div><h3>Virtual disk</h3><p class="muted" id="storage-label">Checking storage...</p></div><span>▤</span></div>
      <div class="storage-meter"><span id="storage-meter-fill"></span></div><button class="text-button" data-action="refresh-storage">Refresh storage details</button></section>
    <section class="settings-card"><div class="settings-row"><div><h3>Backup &amp; restore</h3><p class="muted">Save your files as a JSON backup or restore a previous one.</p></div></div>
      <div class="settings-actions">${appButton("Export JSON backup", "export", false)}${appButton("Import backup", "import", true)}</div></section>
    <section class="settings-card"><div class="settings-row"><div><h3>About SatisCoreOS</h3><p class="muted">Version ${api.system.version} · Browser-based personal workspace</p></div><span class="brand-mark">S</span></div></section>
    <section class="settings-card"><div class="settings-row"><div><h3>Make it yours</h3><p class="muted">Create a custom mini app without writing code.</p></div><button class="button button-secondary" data-action="app-studio">Open App Studio</button></div></section>
  </div>`;
  const updateUsage = async () => {
    const usage = await api.fs.usage();
    root.querySelector("#storage-label").textContent = `${usage.files} files · ${usage.characters.toLocaleString()} text characters`;
    root.querySelector("#storage-meter-fill").style.width = `${Math.min(100, Math.max(2, usage.characters / 10000))}%`;
  };
  await updateUsage();
  root.addEventListener("click", event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "export") api.ui.exportBackup().catch(error => api.ui.notify(error.message, { type: "error" }));
    if (action === "import") api.ui.importBackup();
    if (action === "refresh-storage") updateUsage().catch(error => api.ui.notify(error.message, { type: "error" }));
    if (action === "app-studio") api.apps.open("app-builder").catch(error => api.ui.notify(error.message, { type: "error" }));
  });
}

export const settingsApp = Object.freeze({
  id: "settings", name: "Settings", icon: "⚙",
  description: "Manage your system and backups.", mount: mountSettings
});
