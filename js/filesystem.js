const DB_NAME = "catiscoreos";
const DB_VERSION = 1;
const STORE_NAME = "files";
const BACKUP_FORMAT = "catiscoreos-filesystem";
const BACKUP_VERSION = 1;

function normalizePath(path) {
  if (typeof path !== "string" || !path.trim()) throw new TypeError("A file path is required.");
  const segments = path.replaceAll("\\", "/").split("/");
  const normalized = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!normalized.length) throw new Error("Paths cannot go above the virtual disk root.");
      normalized.pop();
      continue;
    }
    if (segment.includes("\0")) throw new Error("Paths cannot contain null characters.");
    normalized.push(segment);
  }
  return `/${normalized.join("/")}`;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Filesystem transaction was aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Filesystem transaction failed."));
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export class VirtualFileSystem {
  #database;

  async open() {
    if (this.#database) return this;
    this.#database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "path" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open the virtual filesystem."));
      request.onblocked = () => reject(new Error("Filesystem upgrade is blocked by another open SatisCoreOS tab."));
    });
    return this;
  }

  async #store(mode, operation) {
    await this.open();
    const transaction = this.#database.transaction(STORE_NAME, mode);
    const completion = transactionDone(transaction);
    let result;
    try {
      result = await operation(transaction.objectStore(STORE_NAME));
    } catch (error) {
      try { transaction.abort(); } catch { /* The transaction may already have completed. */ }
      await completion.catch(() => undefined);
      throw error;
    }
    await completion;
    return result;
  }

  async read(path) {
    const key = normalizePath(path);
    return this.#store("readonly", store => requestResult(store.get(key))).then(record => {
      if (!record) throw new Error(`File not found: ${key}`);
      return { ...record };
    });
  }

  async readText(path) {
    const record = await this.read(path);
    if (record.encoding === "base64") throw new Error(`File is not text: ${record.path}`);
    return record.content;
  }

  async write(path, content, options = {}) {
    const key = normalizePath(path);
    if (key === "/") throw new Error("The virtual disk root is not a file.");
    let storedContent;
    let encoding;
    if (typeof content === "string") {
      storedContent = content;
      encoding = "text";
    } else if (content instanceof Blob) {
      storedContent = bytesToBase64(new Uint8Array(await content.arrayBuffer()));
      encoding = "base64";
    } else if (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) {
      const bytes = content instanceof ArrayBuffer
        ? new Uint8Array(content)
        : new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
      storedContent = bytesToBase64(bytes);
      encoding = "base64";
    } else {
      throw new TypeError("File content must be text, a Blob, or a byte array.");
    }
    const record = {
      path: key,
      content: storedContent,
      encoding,
      mimeType: options.mimeType || "text/plain",
      modifiedAt: new Date().toISOString()
    };
    await this.#store("readwrite", store => requestResult(store.put(record)));
    return { ...record };
  }

  async readBlob(path) {
    const record = await this.read(path);
    if (record.encoding !== "base64") return new Blob([record.content], { type: record.mimeType });
    return new Blob([base64ToBytes(record.content)], { type: record.mimeType });
  }

  async remove(path) {
    const key = normalizePath(path);
    if (key === "/") throw new Error("The virtual disk root cannot be removed.");
    await this.#store("readwrite", store => requestResult(store.delete(key)));
  }

  async list(path = "/") {
    const directory = normalizePath(path);
    const prefix = directory === "/" ? "/" : `${directory}/`;
    const records = await this.#store("readonly", store => requestResult(store.getAll()));
    const entries = new Map();
    for (const record of records) {
      if (!record.path.startsWith(prefix)) continue;
      const remainder = record.path.slice(prefix.length);
      const segments = remainder.split("/");
      if (record.mimeType === "application/x-catiscoreos-directory" && segments.length === 2 && segments[1] === ".directory") {
        entries.set(segments[0], { ...record, name: segments[0], isDirectory: true });
      } else if (segments.length > 1) {
        const name = segments[0];
        if (!entries.has(name)) {
          entries.set(name, {
            path: `${prefix}${name}/.directory`,
            name,
            content: "",
            encoding: "text",
            mimeType: "application/x-catiscoreos-directory",
            modifiedAt: record.modifiedAt,
            isDirectory: true
          });
        }
      } else if (record.mimeType !== "application/x-catiscoreos-directory") {
        entries.set(record.path, { ...record, name: remainder, isDirectory: false });
      }
    }
    return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async mkdir(path) {
    const directory = normalizePath(path);
    if (directory === "/") return;
    const marker = `${directory}/.directory`;
    if (await this.exists(marker)) return;
    await this.write(marker, "", { mimeType: "application/x-catiscoreos-directory" });
  }

  async exists(path) {
    const key = normalizePath(path);
    const record = await this.#store("readonly", store => requestResult(store.get(key)));
    return Boolean(record);
  }

  async exportBackup() {
    const files = await this.#store("readonly", store => requestResult(store.getAll()));
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      files: files.sort((a, b) => a.path.localeCompare(b.path))
    };
  }

  async importBackup(backup) {
    if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION || !Array.isArray(backup.files)) {
      throw new Error("This is not a supported SatisCoreOS filesystem backup.");
    }
    const paths = new Set();
    const files = backup.files.map(file => {
      if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
        throw new Error("The backup contains an invalid file record.");
      }
      const path = normalizePath(file.path);
      if (path === "/" || paths.has(path)) throw new Error("The backup contains an invalid or duplicate path.");
      if (file.encoding !== undefined && file.encoding !== "text" && file.encoding !== "base64") {
        throw new Error(`The backup contains an unsupported encoding for ${path}.`);
      }
      if (file.encoding === "base64") {
        try { atob(file.content); } catch { throw new Error(`The backup contains invalid binary data for ${path}.`); }
      }
      paths.add(path);
      return {
        path,
        content: file.content,
        encoding: file.encoding ?? "text",
        mimeType: typeof file.mimeType === "string" ? file.mimeType : "text/plain",
        modifiedAt: typeof file.modifiedAt === "string" ? file.modifiedAt : new Date().toISOString()
      };
    });
    await this.#store("readwrite", store => new Promise((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onerror = () => reject(clearRequest.error ?? new Error("Could not clear the existing filesystem."));
      clearRequest.onsuccess = () => {
        for (const file of files) {
          const request = store.put(file);
          request.onerror = () => reject(request.error ?? new Error(`Could not restore ${file.path}.`));
        }
        resolve();
      };
    }));
    return files.length;
  }

  async usage() {
    const files = await this.#store("readonly", store => requestResult(store.getAll()));
    return {
      files: files.filter(file => !file.path.endsWith("/.directory")).length,
      characters: files.reduce((total, file) => total + (file.encoding === "base64" ? 0 : file.content.length), 0)
    };
  }
}

export const filesystemConstants = Object.freeze({ BACKUP_FORMAT, BACKUP_VERSION });
