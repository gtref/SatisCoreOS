import { escapeHtml, recordName, formatDate, appButton } from "./app-utils.js";

async function mountFiles(root, api) {
  let directory = "/home/guest";
  let search = "";
  let sortBy = "name";
  root.innerHTML = `
    <div class="files-app">
      <aside class="side-nav">
        <p class="side-nav-label">Locations</p>
        <button class="folder-link active" data-directory="/home/guest">⌂ &nbsp;Home</button>
        <button class="folder-link" data-directory="/home/guest/Documents">▤ &nbsp;Documents</button>
        <button class="folder-link" data-directory="/home/guest/Pictures">▧ &nbsp;Pictures</button>
        <button class="folder-link" data-directory="/system">⚙ &nbsp;System</button>
      </aside>
      <section class="files-main">
        <div class="app-toolbar"><button class="button button-secondary" data-action="parent" aria-label="Go to parent folder">↑</button><div class="path-crumb" id="files-path"></div>
          <label class="file-search"><span>⌕</span><input id="file-search" type="search" placeholder="Search this folder" aria-label="Search files"></label>
          <select class="file-sort" id="file-sort" aria-label="Sort files"><option value="name">Name</option><option value="type">Type</option><option value="modified">Recent</option></select>
          ${appButton("New folder", "new-folder", true)}${appButton("Upload", "upload", true)}</div>
        <div class="file-list" id="file-list"></div>
      </section>
    </div>`;
  const fileList = root.querySelector("#file-list");
  const pathLabel = root.querySelector("#files-path");

  const refresh = async () => {
    const files = await api.fs.list(directory);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    files.sort((a, b) => {
      if (sortBy === "modified") return b.modifiedAt.localeCompare(a.modifiedAt);
      if (sortBy === "type") return a.mimeType.localeCompare(b.mimeType) || collator.compare(a.name, b.name);
      return collator.compare(a.name, b.name);
    });
    const filteredFiles = files.filter(file => file.name.toLowerCase().includes(search.toLowerCase()));
    pathLabel.innerHTML = `<span>Disk</span> &nbsp;›&nbsp; ${escapeHtml(directory)}`;
    root.querySelector('[data-action="parent"]').disabled = directory === "/";
    if (!filteredFiles.length) {
      fileList.innerHTML = `<div class="empty-state"><strong>${search ? "No matching files" : "This folder is empty"}</strong>${search ? "Try a different search." : "Upload a file or create a folder to get started."}</div>`;
      return;
    }
    fileList.innerHTML = `<div class="file-list-head"><span>Name</span><span>Kind</span><span>Modified</span></div>${filteredFiles.map(file => {
      const isDirectory = file.mimeType === "application/x-catiscoreos-directory";
      const shownName = isDirectory ? file.name.replace(/\/\.directory$/, "") : file.name;
      if (!shownName) return "";
      return `<div class="file-row" data-path="${escapeHtml(file.path)}" data-kind="${isDirectory ? "directory" : "file"}">
        <span class="file-name"><span>${isDirectory ? "▰" : "▧"}</span>${escapeHtml(shownName)}</span>
        <span class="file-meta">${isDirectory ? "Folder" : escapeHtml(file.mimeType.split("/").pop() || "File")}</span>
        <span class="file-meta">${escapeHtml(formatDate(file.modifiedAt))}</span></div>`;
    }).join("")}`;
  };
  await refresh();
  root.querySelector("#file-search").addEventListener("input", event => {
    search = event.target.value.trim();
    refresh().catch(error => api.ui.notify(error.message, { type: "error" }));
  });
  root.querySelector("#file-sort").addEventListener("change", event => {
    sortBy = event.target.value;
    refresh().catch(error => api.ui.notify(error.message, { type: "error" }));
  });

  root.addEventListener("click", async event => {
    if (event.target.closest('[data-action="parent"]')) {
      if (directory !== "/") {
        directory = directory.slice(0, directory.lastIndexOf("/")) || "/";
        const selected = [...root.querySelectorAll("[data-directory]")].find(button => button.dataset.directory === directory);
        root.querySelectorAll(".folder-link").forEach(button => button.classList.toggle("active", button === selected));
        try { await refresh(); } catch (error) { api.ui.notify(error.message, { type: "error" }); }
      }
      return;
    }
    const directoryButton = event.target.closest("[data-directory]");
    if (directoryButton) {
      directory = directoryButton.dataset.directory;
      root.querySelectorAll(".folder-link").forEach(button => button.classList.toggle("active", button === directoryButton));
      try { await refresh(); } catch (error) { api.ui.notify(error.message, { type: "error" }); }
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "upload") {
      api.ui.pickFiles(async files => {
        try {
          for (const file of files) {
            const content = file.type.startsWith("text/") || /\.(md|json|csv|xml|ya?ml)$/i.test(file.name)
              ? await file.text()
              : file;
            await api.fs.write(`${directory}/${file.name}`, content, { mimeType: file.type || "application/octet-stream" });
          }
          await refresh();
          api.ui.notify(`Added ${files.length} file${files.length === 1 ? "" : "s"}.`);
        } catch (error) { api.ui.notify(error.message, { type: "error" }); }
      });
    } else if (action === "new-folder") {
      const name = window.prompt("Folder name");
      if (name?.trim()) {
        try { await api.fs.mkdir(`${directory}/${name.trim()}`); await refresh(); }
        catch (error) { api.ui.notify(error.message, { type: "error" }); }
      }
    }
    const row = event.target.closest(".file-row");
    if (row) {
      if (row.dataset.kind === "directory") {
        directory = row.dataset.path.replace(/\/\.directory$/, "");
        try { await refresh(); } catch (error) { api.ui.notify(error.message, { type: "error" }); }
      } else {
        try {
          const record = await api.fs.read(row.dataset.path);
          if (record.encoding === "base64") api.ui.downloadFile(await api.fs.readBlob(record.path), record.name, record.mimeType);
          else api.ui.openTextFile(record);
        } catch (error) { api.ui.notify(error.message, { type: "error" }); }
      }
    }
  });
  root.addEventListener("contextmenu", async event => {
    const row = event.target.closest(".file-row");
    if (!row || row.dataset.kind !== "file") return;
    event.preventDefault();
    if (window.confirm(`Delete ${recordName(row.dataset.path)}?`)) {
      try { await api.fs.remove(row.dataset.path); await refresh(); }
      catch (error) { api.ui.notify(error.message, { type: "error" }); }
    }
  });
}

export const filesApp = Object.freeze({
  id: "files", name: "My Files", icon: "▤",
  description: "Browse and manage your virtual disk.", mount: mountFiles
});
