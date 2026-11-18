# SatisCoreOS

SatisCoreOS is a browser-based desktop demo with an IndexedDB-backed virtual filesystem. It runs without a build step or third-party JavaScript dependencies.

## Version 1.2.0

The desktop includes **App Studio**, a no-code way to make personal mini apps. Start from a template, choose a message, click counter, or checklist, and customize the icon and accent color. Edit or duplicate creations in App Studio; counters and checklist progress are saved in the current browser profile. Installed apps automatically appear in the responsive desktop icon grid, app library, and taskbar. Use the taskbar's **Apps** button or the launcher to open App Studio. Open apps can be focused, restored, or minimized from their taskbar buttons.

## Run it

Because the app uses JavaScript modules, serve this folder over HTTP instead of opening `index.html` directly. For example, with Python installed:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000` in a modern browser.

## Files and backups

Files are stored in the browser's IndexedDB database named `catiscoreos` (retained to preserve data from earlier CatisCoreOS builds). They stay in that browser profile; clearing browser site data can remove them. Use **Settings → Export JSON backup** or **Power options → Export & shut down** to download a portable backup. Use **Import backup** to restore it; restoring replaces the current virtual disk.

## Apps and app API

Each built-in app has its own JavaScript module in `js/`: `files.js`, `notes.js`, `terminal.js`, `system-api-app.js`, `settings.js`, and `browser.js`. Shared app helpers live in `app-utils.js`; `apps.js` registers the modules and renders the app launcher. Built-in apps receive a small API object as the second argument to their `mount(element, api)` function. Common helpers are `api.ui.notify(message)`, `api.apps.open(id)`, `api.apps.list()`, and `api.fs` for file operations. The running OS is exposed as `window.SatisCoreOS`; its version is available at `window.SatisCoreOS.system.version`. The **System API** app has a concise example for registering a JavaScript app.

The **Browser** app displays websites in a sandboxed embedded frame. Some websites block embedding; use the open-in-new-tab control for those sites. Apps execute in the same JavaScript context as the OS. Only load apps you trust; this browser demo is not a security boundary or a replacement for a native operating system.
