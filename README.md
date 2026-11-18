# SatisCoreOS

SatisCoreOS is a browser-based desktop demo with an IndexedDB-backed virtual filesystem. It runs without a build step or third-party JavaScript dependencies.

## Version 1.2.0

The desktop includes a keyboard-friendly **Calculator**, a **Calendar** for daily plans, and a **Unit Converter** for common length, weight, and temperature conversions. The taskbar shows only pinned apps (Files, Notes, Calculator, and Browser by default) and apps that are open. Use the app library's **Pin** or **Unpin** control to customize pinned apps. Open **Task view** from the taskbar to switch between windows or show the desktop.

**App Studio** is a no-code way to make personal mini apps. Start from a template, choose a message, click counter, or checklist, and customize the icon and accent color. Edit or duplicate creations in App Studio; counters and checklist progress are saved in the current browser profile. Installed apps automatically appear in the responsive desktop icon grid, app library, and taskbar. Use the taskbar's **Apps** button or the launcher to open apps. Calendar events and custom app data are stored in the current browser profile.

## Run it

Because the app uses JavaScript modules, serve this folder over HTTP instead of opening `index.html` directly. For example, with Python installed:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000` in a modern browser.

## Files and backups

Files are stored in the browser's IndexedDB database named `catiscoreos` (retained to preserve data from earlier CatisCoreOS builds). They stay in that browser profile; clearing browser site data can remove them. Use **Settings → Export JSON backup** or **Power options → Export & shut down** to download a portable backup. Use **Import backup** to restore it; restoring replaces the current virtual disk.

## Apps and app API

Each built-in app has its own JavaScript module in `js/`: `files.js`, `notes.js`, `terminal.js`, `calculator.js`, `calendar.js`, `converter.js`, `system-api-app.js`, `settings.js`, and `browser.js`. Shared app helpers live in `app-utils.js`; `apps.js` registers the modules and renders the app launcher. Built-in apps receive a small API object as the second argument to their `mount(element, api)` function. The filesystem API supports text and binary read/write, `appendText`, recursive `copy` and `move`, `stat`, text `search`, folder listing/creation, removal, and backups. For example, `await api.fs.search("hello", { path: "/home/guest" })` finds matching text files. The Terminal supports `cd`, `ls -l`, `tree`, `cp`, `mv`, `rm -r`, `rmdir`, `find`, `stat`, `wc`, `head`, and `tail` alongside its existing commands; type `help` in Terminal for syntax. Other common helpers are `api.ui.notify(message)`, `api.apps.open(id)`, and `api.apps.list()`. The running OS is exposed as `window.SatisCoreOS`; its version is available at `window.SatisCoreOS.system.version`. The **System API** app has a concise example for registering a JavaScript app.

The **Browser** app displays websites in a sandboxed embedded frame. Some websites block embedding; use the open-in-new-tab control for those sites. Apps execute in the same JavaScript context as the OS. Only load apps you trust; this browser demo is not a security boundary or a replacement for a native operating system.
