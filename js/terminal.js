async function mountTerminal(root, api) {
  root.innerHTML = `<div class="terminal-app"><div class="terminal-output" id="terminal-output"></div>
    <label class="terminal-input-row"><span>guest@satiscore:~$</span><input class="terminal-input" id="terminal-input" autocomplete="off" spellcheck="false" aria-label="Terminal command"></label></div>`;
  const output = root.querySelector("#terminal-output");
  const input = root.querySelector("#terminal-input");
  const history = [];
  let historyIndex = 0;
  const print = (text, kind = "") => {
    const line = document.createElement("div");
    line.className = `terminal-line ${kind}`;
    line.textContent = text;
    output.append(line);
    if (output.childElementCount > 300) output.firstElementChild.remove();
    output.scrollTop = output.scrollHeight;
  };
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
    print(`guest@satiscore:~$ ${raw}`);
    const [command, ...args] = raw.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    const values = args.map(value => value.replace(/^"|"$/g, ""));
    try {
      switch (command) {
        case "help":
          print("help · pwd · date · ls [path] · cat <path> · write <path> <text> · mkdir <path> · rm <path> · apps · open <app-id> · clear");
          break;
        case "pwd": print("/home/guest"); break;
        case "date": print(new Date().toLocaleString()); break;
        case "ls": {
          const records = await api.fs.list(values[0] ?? "/home/guest");
          print(records.map(file => file.name).join("  ") || "(empty)");
          break;
        }
        case "cat":
          if (!values[0]) throw new Error("Usage: cat <path>");
          print(await api.fs.readText(values[0]));
          break;
        case "write":
          if (values.length < 2) throw new Error('Usage: write <path> "text content"');
          await api.fs.write(values[0], values.slice(1).join(" "));
          print("File saved.");
          break;
        case "mkdir":
          if (!values[0]) throw new Error("Usage: mkdir <path>");
          await api.fs.mkdir(values[0]);
          print("Folder created.");
          break;
        case "rm":
          if (!values[0]) throw new Error("Usage: rm <path>");
          await api.fs.remove(values[0]);
          print("File removed.");
          break;
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
