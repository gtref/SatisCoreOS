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

  async remove(path, { recursive = false } = {}) {
    const key = normalizePath(path);
    if (key === "/") throw new Error("The virtual disk root cannot be removed.");
    await this.#store("readwrite", async store => {
      const records = await requestResult(store.getAll());
      const direct = records.find(record => record.path === key);
      const descendants = records.filter(record => record.path.startsWith(`${key}/`));
      const marker = descendants.find(record => record.path === `${key}/.directory`);
      const isDirectory = Boolean(marker || descendants.length);
      if (direct && isDirectory) throw new Error(`Path is both a file and directory: ${key}`);
      if (isDirectory && descendants.some(record => record !== marker) && !recursive) {
        throw new Error(`Directory is not empty: ${key}`);
      }
      if (isDirectory) {
        for (const record of descendants) store.delete(record.path);
      } else {
        store.delete(key);
      }
    });
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
    try {
      const current = await this.stat(directory);
      if (current.isDirectory) return;
      throw new Error(`A file already exists at ${directory}.`);
    } catch (error) {
      if (!error.message.startsWith("Path not found:")) throw error;
    }
    const marker = `${directory}/.directory`;
    await this.write(marker, "", { mimeType: "application/x-catiscoreos-directory" });
  }

  async exists(path) {
    const key = normalizePath(path);
    if (key === "/") return true;
    const record = await this.#store("readonly", store => requestResult(store.get(key)));
    if (record) return true;
    return this.#store("readonly", async store => (await requestResult(store.getAll())).some(file => file.path.startsWith(`${key}/`)));
  }

  async stat(path) {
    const key = normalizePath(path);
    if (key === "/") {
      return { path: key, name: "", isDirectory: true, encoding: "text", mimeType: "application/x-catiscoreos-directory", modifiedAt: null, size: 0 };
    }
    const records = await this.#store("readonly", store => requestResult(store.getAll()));
    const direct = records.find(record => record.path === key);
    const children = records.filter(record => record.path.startsWith(`${key}/`));
    const marker = children.find(record => record.path === `${key}/.directory`);
    const isDirectory = Boolean(marker || children.length);
    if (direct && isDirectory) throw new Error(`Path is both a file and directory: ${key}`);
    const record = direct ?? marker;
    if (!record && !isDirectory) throw new Error(`Path not found: ${key}`);
    if (isDirectory) {
      const directoryRecords = children.filter(item => item !== marker);
      return {
        path: key,
        name: key.slice(key.lastIndexOf("/") + 1),
        isDirectory: true,
        encoding: "text",
        mimeType: "application/x-catiscoreos-directory",
        modifiedAt: directoryRecords.map(item => item.modifiedAt).filter(Boolean).sort().at(-1) ?? marker?.modifiedAt ?? null,
        size: 0
      };
    }
    const size = record.encoding === "base64"
      ? base64ToBytes(record.content).byteLength
      : new TextEncoder().encode(record.content).byteLength;
    return {
      path: key,
      name: key.slice(key.lastIndexOf("/") + 1),
      isDirectory: false,
      encoding: record.encoding,
      mimeType: record.mimeType,
      modifiedAt: record.modifiedAt,
      size
    };
  }

  async appendText(path, content) {
    if (typeof content !== "string") throw new TypeError("Text to append must be a string.");
    const key = normalizePath(path);
    const record = await this.read(key);
    if (record.encoding !== "text") throw new Error(`File is not text: ${key}`);
    return this.write(key, record.content + content, { mimeType: record.mimeType });
  }

  async search(query, { path = "/", caseSensitive = false, limit = 100 } = {}) {
    if (typeof query !== "string" || !query.trim()) throw new TypeError("A non-empty search query is required.");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new RangeError("Search limit must be an integer between 1 and 1000.");
    }
    const directory = normalizePath(path);
    const prefix = directory === "/" ? "/" : `${directory}/`;
    const needle = caseSensitive ? query : query.toLocaleLowerCase();
    const records = await this.#store("readonly", store => requestResult(store.getAll()));
    return records
      .filter(record => record.encoding === "text" &&
        record.mimeType !== "application/x-catiscoreos-directory" &&
        record.path.startsWith(prefix) &&
        (caseSensitive ? record.content : record.content.toLocaleLowerCase()).includes(needle))
      .slice(0, limit)
      .map(record => ({
        path: record.path,
        name: record.path.slice(record.path.lastIndexOf("/") + 1),
        mimeType: record.mimeType,
        modifiedAt: record.modifiedAt,
        snippet: record.content.slice(Math.max(0, (caseSensitive ? record.content : record.content.toLocaleLowerCase()).indexOf(needle) - 40),
          (caseSensitive ? record.content : record.content.toLocaleLowerCase()).indexOf(needle) + query.length + 80).replace(/\s+/g, " ")
      }));
  }

  async copy(source, destination) {
    return this.#transfer(source, destination, false);
  }

  async move(source, destination) {
    return this.#transfer(source, destination, true);
  }

  async #transfer(source, destination, removeSource) {
    const sourcePath = normalizePath(source);
    const destinationPath = normalizePath(destination);
    if (sourcePath === "/" || destinationPath === "/") {
      throw new Error("The virtual disk root cannot be copied, moved, or replaced.");
    }
    if (sourcePath === destinationPath) throw new Error("Source and destination are the same path.");
    return this.#store("readwrite", async store => {
      const records = await requestResult(store.getAll());
      const direct = records.find(record => record.path === sourcePath);
      const sourceRecords = records.filter(record => record.path.startsWith(`${sourcePath}/`));
      const isDirectory = sourceRecords.some(record => record.path === `${sourcePath}/.directory` || record.path.startsWith(`${sourcePath}/`));
      if (direct && isDirectory) throw new Error(`Path is both a file and directory: ${sourcePath}`);
      if (!direct && !isDirectory) throw new Error(`Path not found: ${sourcePath}`);
      if (isDirectory && destinationPath.startsWith(`${sourcePath}/`)) {
        throw new Error("A directory cannot be copied or moved inside itself.");
      }

      const entries = isDirectory ? sourceRecords : [direct];
      const destinationRecords = records.filter(record =>
        record.path === destinationPath || record.path.startsWith(`${destinationPath}/`)
      );
      if (destinationRecords.length) throw new Error(`Destination already exists: ${destinationPath}`);

      const changes = entries.map(record => ({
        oldPath: record.path,
        record: {
          ...record,
          path: isDirectory
            ? `${destinationPath}${record.path.slice(sourcePath.length)}`
            : destinationPath,
          ...(removeSource ? {} : { modifiedAt: new Date().toISOString() })
        }
      }));
      if (removeSource) {
        for (const change of changes) store.delete(change.oldPath);
      }
      for (const change of changes) store.put(change.record);
      return { path: destinationPath, isDirectory, entries: changes.length };
    });
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
