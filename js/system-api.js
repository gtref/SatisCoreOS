import { VirtualFileSystem } from "./filesystem.js";

export const SATISCOREOS_VERSION = "1.2.0";

export class SatisSystem {
  #apps = new Map();
  #openApp;
  #notify;

  constructor({ openApp, notify } = {}) {
    this.fs = new VirtualFileSystem();
    this.#openApp = openApp ?? (() => { throw new Error("The app window manager is not ready."); });
    this.#notify = notify ?? (() => {});
    this.system = Object.freeze({
      name: "SatisCoreOS",
      version: SATISCOREOS_VERSION,
      platform: "browser",
      getInfo: () => ({ name: "SatisCoreOS", version: SATISCOREOS_VERSION, platform: "browser" }),
      export: () => this.fs.exportBackup(),
      import: backup => this.fs.importBackup(backup)
    });
    this.ui = Object.freeze({
      notify: (message, options) => this.#notify(message, options),
      openApp: id => this.openApp(id)
    });
    this.apps = Object.freeze({
      register: app => this.registerApp(app),
      list: () => this.listApps(),
      open: id => this.openApp(id),
      remove: id => this.unregisterApp(id)
    });
  }

  registerApp(app) {
    if (!app || typeof app.id !== "string" || !app.id.trim() || typeof app.name !== "string" || typeof app.mount !== "function") {
      throw new TypeError("Apps must provide a non-empty id, name, and mount(element, api) function.");
    }
    if (this.#apps.has(app.id)) throw new Error(`An app with id "${app.id}" is already registered.`);
    const registration = Object.freeze({
      id: app.id,
      name: app.name,
      icon: app.icon ?? "□",
      description: app.description ?? "",
      mount: app.mount
    });
    this.#apps.set(registration.id, registration);
    globalThis.dispatchEvent?.(new CustomEvent("satiscoreos:apps-changed"));
    return registration;
  }

  listApps() {
    return [...this.#apps.values()].map(({ mount, ...metadata }) => ({ ...metadata }));
  }

  createAppApi(helpers = {}) {
    const ui = Object.freeze({
      ...helpers,
      notify: (message, options) => this.#notify(message, options),
      openApp: id => this.openApp(id)
    });
    return Object.freeze({
      fs: this.fs,
      system: this.system,
      apps: this.apps,
      ui
    });
  }

  unregisterApp(id) {
    if (!this.#apps.delete(id)) return false;
    globalThis.dispatchEvent?.(new CustomEvent("satiscoreos:apps-changed"));
    return true;
  }

  async openApp(id) {
    const app = this.#apps.get(id);
    if (!app) throw new Error(`Unknown app: ${id}`);
    return this.#openApp(app);
  }
}
