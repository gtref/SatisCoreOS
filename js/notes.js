import { escapeHtml, appButton } from "./app-utils.js";

async function mountNotes(root, api) {
  let activePath = null;
  let saveTimer;
  let search = "";
  root.innerHTML = `<div class="notes-app">
    <aside class="notes-sidebar"><div class="notes-sidebar-head"><span>My notes</span>${appButton("+", "new-note", true)}</div>
      <label class="notes-search"><span>⌕</span><input id="notes-search" type="search" placeholder="Find a note..." aria-label="Search notes"></label>
      <div class="notes-list" id="notes-list"></div></aside>
    <section class="notes-editor"><div class="notes-toolbar"><span>Plain text · autosaves</span><span class="note-count" id="note-count">0 words</span><span class="save-status" id="save-status">Saved</span>
      <button class="icon-button note-delete" data-action="delete-note" aria-label="Delete this note" title="Delete note" disabled>⌫</button></div>
    <input class="notes-title" id="note-title" placeholder="Untitled note" aria-label="Note title">
    <textarea class="notes-body" id="note-body" placeholder="Start writing..." aria-label="Note contents"></textarea></section>
  </div>`;
  const list = root.querySelector("#notes-list");
  const title = root.querySelector("#note-title");
  const body = root.querySelector("#note-body");
  const status = root.querySelector("#save-status");
  const notesDirectory = "/home/guest/Documents";

  const refresh = async () => {
    const records = (await api.fs.list(notesDirectory))
      .filter(file => file.mimeType.startsWith("text/") && file.name.endsWith(".txt"))
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
      .filter(file => `${file.name} ${file.content}`.toLowerCase().includes(search.toLowerCase()));
    list.innerHTML = records.map(file => `<button class="note-link ${file.path === activePath ? "active" : ""}" data-path="${escapeHtml(file.path)}">
      <strong>${escapeHtml(file.name.replace(/\.txt$/, ""))}</strong><span>${escapeHtml(file.content.slice(0, 62).replace(/\s+/g, " ") || "No content yet")}</span></button>`).join("")
      || `<p class="muted" style="padding:8px">No notes yet. Create one to begin.</p>`;
  };
  const open = async path => {
    const record = await api.fs.read(path);
    activePath = path;
    title.value = path.slice(path.lastIndexOf("/") + 1).replace(/\.txt$/, "");
    body.value = record.content;
    status.textContent = "Saved";
    root.querySelector('[data-action="delete-note"]').disabled = false;
    updateCount();
    await refresh();
  };
  const updateCount = () => {
    const words = body.value.trim().match(/\S+/g)?.length ?? 0;
    root.querySelector("#note-count").textContent = `${words} word${words === 1 ? "" : "s"}`;
  };
  const save = async () => {
    if (!activePath) return;
    const nextTitle = title.value.trim() || "Untitled";
    const nextPath = `${notesDirectory}/${nextTitle.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")}.txt`;
    status.textContent = "Saving...";
    try {
      if (nextPath !== activePath && await api.fs.exists(nextPath)) {
        throw new Error("A note with that title already exists.");
      }
      await api.fs.write(nextPath, body.value, { mimeType: "text/plain" });
      if (activePath !== nextPath) await api.fs.remove(activePath);
      activePath = nextPath;
      status.textContent = "Saved";
      await refresh();
    } catch (error) {
      status.textContent = "Save failed";
      api.ui.notify(error.message, { type: "error" });
    }
  };
  const scheduleSave = () => {
    status.textContent = "Unsaved changes";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 450);
  };
  root.addEventListener("click", async event => {
    if (event.target.closest('[data-action="new-note"]')) {
      try {
        const path = `${notesDirectory}/Untitled ${Date.now()}.txt`;
        await api.fs.write(path, "", { mimeType: "text/plain" });
        await open(path);
        title.focus();
        title.select();
      } catch (error) { api.ui.notify(error.message, { type: "error" }); }
      return;
    }
    if (event.target.closest('[data-action="delete-note"]')) {
      if (!activePath || !window.confirm(`Delete "${title.value || "Untitled"}"?`)) return;
      clearTimeout(saveTimer);
      try {
        await api.fs.remove(activePath);
        activePath = null;
        title.value = "";
        body.value = "";
        status.textContent = "Saved";
        root.querySelector('[data-action="delete-note"]').disabled = true;
        const remaining = (await api.fs.list(notesDirectory)).find(file => file.mimeType.startsWith("text/") && file.name.endsWith(".txt"));
        if (remaining) await open(remaining.path);
        else await refresh();
        updateCount();
      } catch (error) { api.ui.notify(error.message, { type: "error" }); }
      return;
    }
    const note = event.target.closest(".note-link");
    if (note) {
      clearTimeout(saveTimer);
      if (activePath && status.textContent === "Unsaved changes") await save();
      try { await open(note.dataset.path); } catch (error) { api.ui.notify(error.message, { type: "error" }); }
    }
  });
  title.addEventListener("input", scheduleSave);
  body.addEventListener("input", () => { updateCount(); scheduleSave(); });
  root.querySelector("#notes-search").addEventListener("input", event => {
    search = event.target.value.trim();
    refresh().catch(error => api.ui.notify(error.message, { type: "error" }));
  });
  await refresh();
  const first = (await api.fs.list(notesDirectory)).find(file => file.mimeType.startsWith("text/") && file.name.endsWith(".txt"));
  if (first) await open(first.path);
}

export const notesApp = Object.freeze({
  id: "notes", name: "Notes", icon: "✎",
  description: "Write notes that save to your virtual disk.", mount: mountNotes
});
