import { SatisSystem } from "./system-api.js";
import { registerBuiltInApps, renderLauncher } from "./apps.js";
import { registerSavedApps } from "./app-builder.js";

const $ = selector => document.querySelector(selector);
const windowLayer = $("#window-layer");
const launcher = $("#launcher");
const appGrid = $("#app-grid");
const taskbarApps = $("#taskbar-apps");
const taskView = $("#task-view");
const taskViewPanel = $("#task-view-panel");
const toastRegion = $("#toast-region");
const windows = new Map();
const DEFAULT_PINNED_APPS = ["files", "notes", "browser", "calculator"];
const PINNED_APPS_KEY = "satiscoreos-pinned-apps";
let activeWindow = null;
let pendingBackup = null;
let zIndex = 6;

function notify(message, { type = "success", timeout = 3200 } = {}) {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.textContent = message;
  toastRegion.append(toast);
  setTimeout(() => {
    toast.classList.add("toast-leaving");
    setTimeout(() => toast.remove(), 180);
  }, timeout);
}

function loadPinnedApps() {
  const raw = localStorage.getItem(PINNED_APPS_KEY);
  if (raw === null) return DEFAULT_PINNED_APPS;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    throw new Error("Pinned app settings are not valid JSON.");
  }
  if (!Array.isArray(saved) || saved.some(id => typeof id !== "string")) {
    throw new Error("Pinned app settings have an unsupported format.");
  }
  return saved;
}

let pinnedApps;
try {
  pinnedApps = new Set(loadPinnedApps());
} catch (error) {
  pinnedApps = new Set(DEFAULT_PINNED_APPS);
  notify(`Pinned apps could not be loaded: ${error.message}`, { type: "error" });
}

function refreshDesktopShortcuts() {
  const shortcuts = $("#desktop-shortcuts");
  shortcuts.innerHTML = os.apps.list().map(app => {
    const iconClass = {
      "app-builder": "builder-icon",
      calculator: "calculator-icon",
      calendar: "calendar-icon",
      converter: "converter-icon",
      files: "files-icon",
      notes: "notes-icon",
      terminal: "terminal-icon",
      api: "api-icon",
      settings: "settings-icon",
      browser: "browser-icon"
    }[app.id] ?? "custom-icon";
    return `<button class="shortcut" data-app="${escapeHtml(app.id)}" title="${escapeHtml(app.description)}">
      <span class="shortcut-icon ${iconClass}">${escapeHtml(app.icon)}</span><span>${escapeHtml(app.name)}</span></button>`;
  }).join("");
}

const os = new SatisSystem({
  openApp: app => mountAppWindow(app),
  notify
});
registerBuiltInApps(os);
try {
  registerSavedApps(os);
} catch (error) {
  notify(`Saved apps could not be loaded: ${error.message}`, { type: "error", timeout: 7000 });
}

function refreshLauncher(query = "") {
  renderLauncher(appGrid, os.apps.list(), id => {
    launcher.classList.add("hidden");
    $("#dock-launcher").setAttribute("aria-expanded", "false");
    $("#brand-button").setAttribute("aria-expanded", "false");
    taskViewPanel.classList.add("hidden");
    taskView.setAttribute("aria-expanded", "false");
    os.apps.open(id).catch(error => notify(error.message, { type: "error" }));
  }, query, pinnedApps, toggleAppPin);
}

function toggleAppPin(appId) {
  const wasPinned = pinnedApps.has(appId);
  if (wasPinned) pinnedApps.delete(appId);
  else pinnedApps.add(appId);
  try {
    localStorage.setItem(PINNED_APPS_KEY, JSON.stringify([...pinnedApps]));
  } catch (error) {
    if (wasPinned) pinnedApps.add(appId);
    else pinnedApps.delete(appId);
    notify(`Pin setting could not be saved: ${error.message}`, { type: "error" });
    return;
  }
  refreshLauncher($("#app-search").value);
  refreshTaskbar();
}

function refreshTaskbar() {
  const apps = os.apps.list().filter(app => pinnedApps.has(app.id) || windows.has(app.id));
  taskbarApps.innerHTML = apps.map(app => {
    const frame = windows.get(app.id);
    const running = Boolean(frame);
    const minimized = Boolean(frame?.classList.contains("hidden"));
    const active = activeWindow === app.id && !minimized;
    return `<button class="dock-app ${running ? "is-running" : ""} ${active ? "is-active" : ""} ${minimized ? "is-minimized" : ""}"
      data-app="${escapeHtml(app.id)}" aria-label="${escapeHtml(app.name)}${running ? minimized ? ", minimized" : ", open" : ""}"
      aria-pressed="${active}" title="${escapeHtml(app.name)}${running ? minimized ? " · Minimized" : " · Open" : ""}">
      <span class="taskbar-app-icon">${escapeHtml(app.icon)}</span><span class="taskbar-app-label">${escapeHtml(app.name)}</span></button>`;
  }).join("");
  refreshTaskView();
}

function refreshTaskView() {
  const openWindows = [...windows.entries()]
    .filter(([, frame]) => !frame.classList.contains("window-closing"));
  const content = taskViewPanel.querySelector(".task-view-windows");
  content.innerHTML = openWindows.map(([id, frame]) => `<button type="button" class="task-view-card ${activeWindow === id && !frame.classList.contains("hidden") ? "is-active" : ""}" data-task-view-app="${escapeHtml(id)}" aria-label="${escapeHtml(frame.dataset.appName)}${frame.classList.contains("hidden") ? ", minimized" : ""}">
    <span class="task-view-card-icon">${escapeHtml(frame.dataset.appIcon)}</span>
    <span class="task-view-card-name">${escapeHtml(frame.dataset.appName)}</span>
    <span class="task-view-card-state">${frame.classList.contains("hidden") ? "Minimized" : activeWindow === id ? "In front" : "Open"}</span>
  </button>`).join("") || `<p class="task-view-empty">No open windows. Launch an app to get started.</p>`;
  taskView.setAttribute("aria-expanded", String(!taskViewPanel.classList.contains("hidden")));
  const minimizeAll = taskViewPanel.querySelector("#show-desktop");
  minimizeAll.disabled = openWindows.every(([, frame]) => frame.classList.contains("hidden"));
}

function setActiveWindow(appId) {
  const frame = windows.get(appId);
  if (!frame) return;
  frame.classList.remove("hidden", "minimized");
  frame.style.zIndex = String(++zIndex);
  activeWindow = appId;
  $("#active-app-label").textContent = frame.dataset.appName;
  refreshTaskbar();
}

function activateTopWindow() {
  const topWindow = [...windows.entries()]
    .filter(([, frame]) => !frame.classList.contains("hidden") && !frame.classList.contains("window-closing"))
    .sort(([, first], [, second]) => Number(second.style.zIndex) - Number(first.style.zIndex))[0];
  if (topWindow) {
    setActiveWindow(topWindow[0]);
    return;
  }
  activeWindow = null;
  $("#active-app-label").textContent = "Desktop";
  refreshTaskbar();
}

function toggleTaskView() {
  const isOpening = taskViewPanel.classList.contains("hidden");
  launcher.classList.add("hidden");
  $("#dock-launcher").setAttribute("aria-expanded", "false");
  $("#brand-button").setAttribute("aria-expanded", "false");
  taskViewPanel.classList.toggle("hidden", !isOpening);
  taskView.setAttribute("aria-expanded", String(isOpening));
  if (isOpening) refreshTaskView();
}

async function mountAppWindow(app) {
  const existing = windows.get(app.id);
  if (existing) {
    setActiveWindow(app.id);
    return;
  }
  const frame = document.createElement("section");
  frame.className = "app-window";
  frame.dataset.appId = app.id;
  frame.dataset.appName = app.name;
  frame.dataset.appIcon = app.icon;
  frame.style.zIndex = String(++zIndex);
  frame.innerHTML = `<header class="window-titlebar">
      <div class="window-title"><span class="window-title-icon">${escapeHtml(app.icon)}</span><span>${escapeHtml(app.name)}</span></div>
      <div class="window-controls"><button data-window-minimize aria-label="Minimize" title="Minimize">−</button><button data-window-maximize aria-label="Maximize" title="Maximize">□</button><button class="window-close" data-window-close aria-label="Close" title="Close">×</button></div>
    </header><div class="window-content"></div>`;
  windowLayer.append(frame);
  windows.set(app.id, frame);
  activeWindow = app.id;
  $("#active-app-label").textContent = app.name;
  refreshTaskbar();
  frame.addEventListener("pointerdown", () => {
    frame.style.zIndex = String(++zIndex);
    activeWindow = app.id;
    $("#active-app-label").textContent = frame.dataset.appName;
    refreshTaskbar();
  });
  frame.querySelector("[data-window-close]").addEventListener("click", () => {
    if (frame.classList.contains("window-closing")) return;
    frame.classList.add("window-closing");
    const finishClose = event => {
      if (event.target !== frame) return;
      frame.removeEventListener("animationend", finishClose);
      frame.remove();
      windows.delete(app.id);
      if (activeWindow === app.id) activateTopWindow();
      else refreshTaskbar();
    };
    frame.addEventListener("animationend", finishClose);
  });
  frame.querySelector("[data-window-minimize]").addEventListener("click", () => {
    frame.classList.add("hidden");
    if (activeWindow === app.id) activateTopWindow();
    else refreshTaskbar();
  });
  let savedPosition = null;
  frame.querySelector("[data-window-maximize]").addEventListener("click", () => {
    const maximizeButton = frame.querySelector("[data-window-maximize]");
    if (frame.classList.contains("maximized")) {
      frame.classList.remove("maximized");
      if (savedPosition) {
        frame.style.left = savedPosition.left;
        frame.style.top = savedPosition.top;
        frame.style.transform = savedPosition.transform;
      }
      savedPosition = null;
      requestAnimationFrame(fitWindowsToViewport);
    } else {
      savedPosition = {
        left: frame.style.left,
        top: frame.style.top,
        transform: frame.style.transform
      };
      frame.style.removeProperty("left");
      frame.style.removeProperty("top");
      frame.style.removeProperty("transform");
      frame.classList.add("maximized");
    }
    maximizeButton.setAttribute("aria-label", frame.classList.contains("maximized") ? "Restore" : "Maximize");
  });
  makeDraggable(frame, frame.querySelector(".window-titlebar"));
  const appApi = os.createAppApi({
    downloadFile: (blob, filename, mimeType) => downloadFile(filename, blob, mimeType),
    pickFiles: callback => {
      const picker = $("#file-picker");
      picker.onchange = () => {
        const files = [...picker.files];
        picker.value = "";
        if (files.length) callback(files);
      };
      picker.click();
    },
    openTextFile: record => openTextFile(record),
    exportBackup: () => exportBackup(),
    importBackup: () => chooseBackup()
  });
  try {
    await app.mount(frame.querySelector(".window-content"), appApi);
  } catch (error) {
    frame.querySelector(".window-content").innerHTML = `<div class="empty-state"><strong>Could not start ${escapeHtml(app.name)}</strong>${escapeHtml(error.message)}</div>`;
    console.error(`App "${app.id}" failed to mount:`, error);
    notify(`${app.name} could not be opened.`, { type: "error" });
  }
  return frame;
}

function makeDraggable(frame, handle) {
  let startX, startY, startLeft, startTop;
  handle.addEventListener("pointerdown", event => {
    if (event.target.closest(".window-controls") || frame.classList.contains("maximized")) return;
    const rect = frame.getBoundingClientRect();
    const layerRect = windowLayer.getBoundingClientRect();
    frame.dataset.userPositioned = "true";
    frame.style.transform = "none";
    frame.style.left = `${rect.left - layerRect.left}px`;
    frame.style.top = `${rect.top - layerRect.top}px`;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left - layerRect.left;
    startTop = rect.top - layerRect.top;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", event => {
    if (!handle.hasPointerCapture(event.pointerId) || startX === undefined) return;
    const left = Math.min(windowLayer.clientWidth - 80, Math.max(-frame.offsetWidth + 100, startLeft + event.clientX - startX));
    const top = Math.min(windowLayer.clientHeight - 42, Math.max(0, startTop + event.clientY - startY));
    frame.style.left = `${left}px`;
    frame.style.top = `${top}px`;
  });
  handle.addEventListener("pointerup", event => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    startX = undefined;
  });
}

function fitWindowsToViewport() {
  for (const frame of windows.values()) {
    if (frame.classList.contains("maximized") || frame.classList.contains("hidden")) continue;
    if (frame.dataset.userPositioned !== "true") {
      frame.style.removeProperty("left");
      frame.style.removeProperty("top");
      frame.style.removeProperty("transform");
      continue;
    }
    const rect = frame.getBoundingClientRect();
    const layer = windowLayer.getBoundingClientRect();
    const maxLeft = Math.max(0, windowLayer.clientWidth - frame.offsetWidth);
    const maxTop = Math.max(0, windowLayer.clientHeight - frame.offsetHeight);
    const left = Math.max(0, Math.min(rect.left - layer.left, maxLeft));
    const top = Math.max(0, Math.min(rect.top - layer.top, maxTop));
    frame.style.left = `${left}px`;
    frame.style.top = `${top}px`;
    frame.style.transform = "none";
  }
}

window.addEventListener("resize", fitWindowsToViewport);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

async function openTextFile(record) {
  if (!record.mimeType.startsWith("text/")) {
    notify("Preview is available for text files only.", { type: "error" });
    return;
  }
  const frame = await mountAppWindow({
    id: `text-viewer-${record.path}`,
    name: record.path.split("/").pop(),
    icon: "▧",
    mount: root => {
      root.innerHTML = `<div style="height:100%;display:flex;flex-direction:column"><div class="app-toolbar"><span class="path-crumb">${escapeHtml(record.path)}</span><button class="button button-secondary" id="download-text">Download</button></div><pre style="padding:18px 22px;margin:0;white-space:pre-wrap;overflow:auto;color:#d4d2df;font:12px/1.7 var(--mono)">${escapeHtml(record.content)}</pre></div>`;
      root.querySelector("#download-text").addEventListener("click", () => downloadFile(record.name, record.content, record.mimeType));
    }
  });
  frame.style.width = "min(680px,calc(100vw - 36px))";
}

function downloadFile(filename, content, mimeType = "application/json") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportBackup() {
  const backup = await os.fs.exportBackup();
  downloadFile(`SatisCoreOS-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2));
  notify(`Backup exported (${backup.files.length} filesystem entries).`);
}

function chooseBackup() {
  const picker = $("#backup-picker");
  picker.onchange = async () => {
    const file = picker.files?.[0];
    picker.value = "";
    if (!file) return;
    try {
      pendingBackup = JSON.parse(await file.text());
      $("#import-confirm-dialog").showModal();
    } catch (error) {
      notify(`Could not read backup: ${error.message}`, { type: "error" });
    }
  };
  picker.click();
}

async function seedFilesystem() {
  const welcomePath = "/home/guest/Welcome.txt";
  const readmePath = "/home/guest/Documents/Getting Started.txt";
  if (!await os.fs.exists(welcomePath)) {
    await os.fs.write(welcomePath, "Welcome to SatisCoreOS!\n\nYour files live in this browser's IndexedDB storage. Use My Files to browse, Notes to write, or Terminal to explore.\n\nOpen App Studio to create a little app without code, or System API to explore the developer tools.", { mimeType: "text/plain" });
  } else {
    const welcome = await os.fs.readText(welcomePath);
    if (welcome.includes("CatisCoreOS")) {
      await os.fs.write(welcomePath, welcome.replaceAll("CatisCoreOS", "SatisCoreOS"));
    }
  }
  if (!await os.fs.exists(readmePath)) {
    await os.fs.write(readmePath, "Getting started\n\n• Open My Files to upload files and organize your virtual disk.\n• Use Notes to create and autosave plain-text notes.\n• Open Terminal and type help to see filesystem commands.\n• Visit System API for the app developer guide.\n• Use Power options or Settings to export a portable JSON backup.\n\nTip: browser storage is local to this browser profile. Export backups regularly.", { mimeType: "text/plain" });
  }
  await os.fs.mkdir("/home/guest/Documents");
  await os.fs.mkdir("/home/guest/Pictures");
  await os.fs.mkdir("/system");
}

function showLauncher() {
  const open = launcher.classList.contains("hidden");
  if (open) {
    taskViewPanel.classList.add("hidden");
    taskView.setAttribute("aria-expanded", "false");
  }
  launcher.classList.toggle("hidden", !open);
  $("#dock-launcher").setAttribute("aria-expanded", String(open));
  $("#brand-button").setAttribute("aria-expanded", String(open));
  if (open) {
    refreshLauncher($("#app-search").value);
    $("#app-search").focus();
  }
}

$("#brand-button").addEventListener("click", showLauncher);
$("#dock-launcher").addEventListener("click", showLauncher);
taskView.addEventListener("click", toggleTaskView);
$("#task-view-close").addEventListener("click", () => {
  taskViewPanel.classList.add("hidden");
  taskView.setAttribute("aria-expanded", "false");
});
taskViewPanel.addEventListener("click", event => {
  if (event.target.closest("#show-desktop")) {
    for (const frame of windows.values()) frame.classList.add("hidden");
    activeWindow = null;
    $("#active-app-label").textContent = "Desktop";
    taskViewPanel.classList.add("hidden");
    taskView.setAttribute("aria-expanded", "false");
    refreshTaskbar();
    return;
  }
  const card = event.target.closest("[data-task-view-app]");
  if (!card) return;
  taskViewPanel.classList.add("hidden");
  taskView.setAttribute("aria-expanded", "false");
  setActiveWindow(card.dataset.taskViewApp);
});
$("#launcher-close").addEventListener("click", () => {
  launcher.classList.add("hidden");
  $("#dock-launcher").setAttribute("aria-expanded", "false");
  $("#brand-button").setAttribute("aria-expanded", "false");
});
$("#app-search").addEventListener("input", event => refreshLauncher(event.target.value));
$("#launcher-power").addEventListener("click", () => {
  launcher.classList.add("hidden");
  $("#dock-launcher").setAttribute("aria-expanded", "false");
  $("#brand-button").setAttribute("aria-expanded", "false");
  taskViewPanel.classList.add("hidden");
  taskView.setAttribute("aria-expanded", "false");
  $("#power-dialog").showModal();
});
taskbarApps.addEventListener("click", event => {
  const button = event.target.closest("[data-app]");
  if (!button) return;
  taskViewPanel.classList.add("hidden");
  taskView.setAttribute("aria-expanded", "false");
  const frame = windows.get(button.dataset.app);
  if (frame && activeWindow === button.dataset.app && !frame.classList.contains("hidden")) {
    frame.classList.add("hidden");
    activateTopWindow();
    return;
  }
  os.apps.open(button.dataset.app).catch(error => notify(error.message, { type: "error" }));
});
$("#desktop-shortcuts").addEventListener("click", event => {
  const button = event.target.closest("[data-app]");
  if (button) {
    taskViewPanel.classList.add("hidden");
    taskView.setAttribute("aria-expanded", "false");
    os.apps.open(button.dataset.app).catch(error => notify(error.message, { type: "error" }));
  }
});
$("#power-button").addEventListener("click", () => $("#power-dialog").showModal());
$("#import-backup-button").addEventListener("click", chooseBackup);
$("#shutdown-button").addEventListener("click", async () => {
  try {
    await exportBackup();
    $("#power-dialog").close();
    document.querySelector("#os").insertAdjacentHTML("beforeend", `<section class="screen-off"><div><span class="brand-mark">S</span><h2>SatisCoreOS is shut down</h2><p>Your virtual disk backup has been downloaded.</p><button class="button button-primary" id="power-on-button">Power on</button></div></section>`);
    $("#power-on-button").addEventListener("click", () => {
      $(".screen-off").remove();
      notify("Welcome back.");
    });
  } catch (error) { notify(`Shutdown backup failed: ${error.message}`, { type: "error" }); }
});
$("#restart-button").addEventListener("click", () => {
  $("#power-dialog").close();
  windows.forEach(frame => frame.remove());
  windows.clear();
  activeWindow = null;
  $("#active-app-label").textContent = "Desktop";
  refreshTaskbar();
  notify("SatisCoreOS restarted.");
});
$("#confirm-import-button").addEventListener("click", async () => {
  try {
    const count = await os.fs.importBackup(pendingBackup);
    pendingBackup = null;
    $("#import-confirm-dialog").close();
    notify(`Restored ${count} filesystem entries.`);
    const filesWindow = windows.get("files");
    if (filesWindow) {
      filesWindow.remove();
      windows.delete("files");
      await os.apps.open("files");
    }
  } catch (error) {
    notify(`Import failed: ${error.message}`, { type: "error" });
  }
});
document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
$("#import-confirm-dialog").addEventListener("close", () => { pendingBackup = null; });
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    showLauncher();
  }
  if (event.key === "Escape" && !launcher.classList.contains("hidden")) {
    launcher.classList.add("hidden");
    $("#dock-launcher").setAttribute("aria-expanded", "false");
    $("#brand-button").setAttribute("aria-expanded", "false");
  }
  if (event.key === "Escape" && !taskViewPanel.classList.contains("hidden")) {
    taskViewPanel.classList.add("hidden");
    taskView.setAttribute("aria-expanded", "false");
  }
});
function updateClock() {
  $("#clock").textContent = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date());
  $("#clock-date").textContent = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date());
}
updateClock();
setInterval(updateClock, 30_000);
refreshLauncher();
refreshDesktopShortcuts();
refreshTaskbar();
window.SatisCoreOS = os;
window.addEventListener("satiscoreos:apps-changed", () => {
  const registeredIds = new Set(os.apps.list().map(app => app.id));
  for (const [id, frame] of windows) {
    if (registeredIds.has(id)) continue;
    frame.remove();
    windows.delete(id);
    if (activeWindow === id) activateTopWindow();
  }
  refreshDesktopShortcuts();
  refreshLauncher($("#app-search").value);
  refreshTaskbar();
});

try {
  await os.fs.open();
  await seedFilesystem();
  notify("Welcome to SatisCoreOS.");
} catch (error) {
  console.error("SatisCoreOS failed to initialize:", error);
  notify(`Filesystem could not start: ${error.message}`, { type: "error", timeout: 7000 });
}
