function tokenizeCommand(source) {
  const tokens = [];
  let token = "";
  let quote = null;
  let started = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
      else if (character === "\\" && quote === '"' && index + 1 < source.length) token += source[++index];
      else token += character;
      started = true;
    } else if (character === '"' || character === "'") {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) tokens.push(token);
      token = "";
      started = false;
    } else {
      token += character;
      started = true;
    }
  }
  if (quote) throw new Error("Unclosed quote in command.");
  if (started) tokens.push(token);
  return tokens;
}

async function mountTerminal(root, api) {
  root.innerHTML = `<div class="terminal-app"><div class="terminal-output" id="terminal-output"></div>
    <label class="terminal-input-row"><span>guest@satiscore:~$</span><input class="terminal-input" id="terminal-input" autocomplete="off" spellcheck="false" aria-label="Terminal command"></label></div>`;
  const output = root.querySelector("#terminal-output");
  const input = root.querySelector("#terminal-input");
  const history = [];
  let historyIndex = 0;
  let currentDirectory = "/home/guest";
  const promptText = () => `guest@satiscore:${currentDirectory.replace("/home/guest", "~")}$`;
  const updatePrompt = () => {
    root.querySelector(".terminal-input-row span").textContent = promptText();
  };
  const resolvePath = path => {
    if (path === "~") return "/home/guest";
    if (path.startsWith("~/")) return `/home/guest/${path.slice(2)}`;
    return path.startsWith("/") ? path : `${currentDirectory}/${path}`;
  };
  const destinationPath = async (source, destination) => {
    const target = resolvePath(destination);
    try {
      if ((await api.fs.stat(target)).isDirectory) {
        return `${target.replace(/\/$/, "")}/${source.replace(/\\/g, "/").split("/").filter(Boolean).at(-1)}`;
      }
    } catch (error) {
      if (!error.message.startsWith("Path not found:")) throw error;
    }
    return target;
  };
  const print = (text, kind = "") => {
    const line = document.createElement("div");
    line.className = `terminal-line ${kind}`;
    line.textContent = text;
    output.append(line);
    if (output.childElementCount > 300) output.firstElementChild.remove();
    output.scrollTop = output.scrollHeight;
  };
  updatePrompt();
  print(`SatisCoreOS ${api.system.version} shell · type \`help\` to see available commands`, "muted-line");
  print("Commands operate only on your browser's virtual filesystem.", "muted-line");

  input.addEventListener("keydown", async event => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      if (event.key === "ArrowUp") historyIndex = Math.max(0, historyIndex - 1);
      else historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] ?? "";
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    if (event.key !== "Enter") return;
    const raw = input.value.trim();
    input.value = "";
    if (!raw) return;
    if (history.at(-1) !== raw) history.push(raw);
    historyIndex = history.length;
    print(`${promptText()} ${raw}`);
    try {
      const [command, ...values] = tokenizeCommand(raw);
      if (!command) return;
      switch (command) {
        case "help":
          print("help · pwd · cd [path] · date · ls [-l] [path] · tree [path] · cat <path> · write <path> <text> · append <path> <text> · touch <path> · mkdir <path> · cp <source> <destination> · mv <source> <destination> · rm [-r] <path> · rmdir <path> · find <text> [path] · stat <path> · wc <path> · head <path> [lines] · tail <path> [lines] · apps · open <app-id> · clear");
          break;
        case "pwd": print(currentDirectory); break;
        case "date": print(new Date().toLocaleString()); break;
        case "cd": {
          if (values.length > 1) throw new Error("Usage: cd [path]");
          const path = resolvePath(values[0] ?? "/home/guest");
          const info = await api.fs.stat(path);
          if (!info.isDirectory) throw new Error(`Not a directory: ${path}`);
          currentDirectory = info.path;
          updatePrompt();
          break;
        }
        case "ls": {
          const longFormat = values[0] === "-l";
          const path = resolvePath(values[longFormat ? 1 : 0] ?? currentDirectory);
          const records = await api.fs.list(path);
          if (!longFormat) print(records.map(file => `${file.name}${file.isDirectory ? "/" : ""}`).join("  ") || "(empty)");
          else {
            const details = await Promise.all(records.map(async file => {
              const size = file.isDirectory ? 0 : (await api.fs.stat(file.path)).size;
              return `${file.isDirectory ? "dir " : "file"}\t${String(size).padStart(7)}\t${file.name}${file.isDirectory ? "/" : ""}`;
            }));
            print(details.join("\n") || "(empty)");
          }
          break;
        }
        case "cat":
          if (!values[0]) throw new Error("Usage: cat <path>");
          print(await api.fs.readText(resolvePath(values[0])));
          break;
        case "write":
          if (values.length < 2) throw new Error('Usage: write <path> "text content"');
          await api.fs.write(resolvePath(values[0]), values.slice(1).join(" "));
          print("File saved.");
          break;
        case "append":
          if (values.length < 2) throw new Error('Usage: append <path> "text content"');
          await api.fs.appendText(resolvePath(values[0]), values.slice(1).join(" "));
          print("Text appended.");
          break;
        case "touch": {
          if (values.length !== 1) throw new Error("Usage: touch <path>");
          const path = resolvePath(values[0]);
          try {
            const info = await api.fs.stat(path);
            if (info.isDirectory) throw new Error(`Is a directory: ${path}`);
          } catch (error) {
            if (!error.message.startsWith("Path not found:")) throw error;
            await api.fs.write(path, "");
          }
          print("File ready.");
          break;
        }
        case "mkdir":
          if (!values[0]) throw new Error("Usage: mkdir <path>");
          await api.fs.mkdir(resolvePath(values[0]));
          print("Folder created.");
          break;
        case "cp":
        case "mv": {
          if (values.length !== 2) throw new Error(`Usage: ${command} <source> <destination>`);
          const source = resolvePath(values[0]);
          const destination = await destinationPath(source, values[1]);
          const result = command === "cp"
            ? await api.fs.copy(source, destination)
            : await api.fs.move(source, destination);
          print(`${command === "cp" ? "Copied" : "Moved"} ${result.entries} entr${result.entries === 1 ? "y" : "ies"}.`);
          break;
        }
        case "rm": {
          const recursive = values[0] === "-r";
          const pathValue = values[recursive ? 1 : 0];
          if (!pathValue || values.length !== (recursive ? 2 : 1)) throw new Error("Usage: rm [-r] <path>");
          await api.fs.remove(resolvePath(pathValue), { recursive });
          print("Path removed.");
          break;
        }
        case "rmdir": {
          if (values.length !== 1) throw new Error("Usage: rmdir <path>");
          const path = resolvePath(values[0]);
          if (!(await api.fs.stat(path)).isDirectory) throw new Error(`Not a directory: ${path}`);
          await api.fs.remove(path);
          print("Directory removed.");
          break;
        }
        case "find": {
          if (!values[0]) throw new Error("Usage: find <text> [path]");
          const matches = await api.fs.search(values[0], { path: resolvePath(values[1] ?? currentDirectory) });
          print(matches.map(file => `${file.path}\n  ${file.snippet}`).join("\n") || "No matches.");
          break;
        }
        case "stat": {
          if (!values[0]) throw new Error("Usage: stat <path>");
          const info = await api.fs.stat(resolvePath(values[0]));
          print(`${info.isDirectory ? "Directory" : "File"}: ${info.path}\nSize: ${info.size} bytes\nType: ${info.mimeType}\nModified: ${info.modifiedAt ?? "—"}`);
          break;
        }
        case "wc": {
          if (!values[0]) throw new Error("Usage: wc <path>");
          const text = await api.fs.readText(resolvePath(values[0]));
          const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
          const words = text.trim() ? text.trim().split(/\s+/).length : 0;
          print(`${lines} lines  ${words} words  ${text.length} characters`);
          break;
        }
        case "head":
        case "tail": {
          if (!values[0] || (values[1] !== undefined && !/^\d+$/.test(values[1]))) {
            throw new Error(`Usage: ${command} <path> [lines]`);
          }
          const count = Math.min(500, Number(values[1] ?? 10));
          const lines = (await api.fs.readText(resolvePath(values[0]))).split(/\r\n|\r|\n/);
          print((command === "head" ? lines.slice(0, count) : lines.slice(-count)).join("\n"));
          break;
        }
        case "tree": {
          if (values.length > 1) throw new Error("Usage: tree [path]");
          const start = resolvePath(values[0] ?? currentDirectory);
          const rootInfo = await api.fs.stat(start);
          if (!rootInfo.isDirectory) throw new Error(`Not a directory: ${start}`);
          const rows = [rootInfo.path];
          const pending = [{ path: rootInfo.path, prefix: "", depth: 0 }];
          while (pending.length && rows.length < 500) {
            const { path, prefix, depth } = pending.pop();
            if (depth >= 8) continue;
            const children = await api.fs.list(path);
            for (const [index, child] of children.entries()) {
              if (rows.length >= 500) break;
              const last = index === children.length - 1;
              rows.push(`${prefix}${last ? "└── " : "├── "}${child.name}${child.isDirectory ? "/" : ""}`);
              if (child.isDirectory) pending.push({ path: child.path.replace(/\/\.directory$/, ""), prefix: `${prefix}${last ? "    " : "│   "}`, depth: depth + 1 });
            }
          }
          if (rows.length >= 500) rows.push("… (tree output limited to 500 entries)");
          print(rows.join("\n"));
          break;
        }
        case "apps":
          print(api.apps.list().map(app => `${app.id} — ${app.name}`).join("\n"));
          break;
        case "open":
          if (!values[0]) throw new Error("Usage: open <app-id>");
          await api.apps.open(values[0]);
          print(`Opened ${values[0]}.`);
          break;
        case "clear": output.replaceChildren(); break;
        default: throw new Error(`Unknown command: ${command}. Type help for available commands.`);
      }
    } catch (error) { print(error.message, "error-line"); }
  });
  input.focus();
}

export const terminalApp = Object.freeze({
  id: "terminal", name: "Terminal", icon: "›_",
  description: "Explore your virtual disk with commands.", mount: mountTerminal
});
