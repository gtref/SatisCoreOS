function normalizeUrl(value) {
  const input = value.trim();
  if (!input) throw new Error("Enter a web address to browse.");
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(input);
  if (hasScheme && !/^https?:/i.test(input)) {
    throw new Error("The browser only supports HTTP and HTTPS addresses.");
  }
  const looksLikeHost = /^(localhost|(?:[\w-]+\.)+[\w-]+|(?:\d{1,3}\.){3}\d{1,3})(:\d+)?(?:\/|$)/i.test(input);
  const destination = hasScheme
    ? input
    : looksLikeHost
      ? `https://${input}`
      : `https://duckduckgo.com/?q=${encodeURIComponent(input)}`;
  const url = new URL(destination);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The browser only supports HTTP and HTTPS addresses.");
  }
  return url.href;
}

async function mountBrowser(root, api) {
  root.innerHTML = `<div class="browser-app">
    <div class="browser-toolbar">
      <button class="browser-control" data-browser="back" aria-label="Back" title="Back">←</button>
      <button class="browser-control" data-browser="forward" aria-label="Forward" title="Forward">→</button>
      <button class="browser-control" data-browser="reload" aria-label="Reload" title="Reload">⟳</button>
      <form class="browser-address-form" id="browser-address-form">
        <span>⌕</span>
        <input id="browser-address" type="text" inputmode="url" autocomplete="url" spellcheck="false" placeholder="Search or enter a website address" aria-label="Search or website address">
        <button class="browser-go" type="submit">Go</button>
      </form>
      <button class="browser-control" data-browser="external" aria-label="Open in new tab" title="Open in new tab">↗</button>
    </div>
    <p class="browser-notice" id="browser-status" aria-live="polite">Some websites block embedded browsing. Use ↗ to open those sites in a new tab.</p>
    <iframe class="browser-frame" title="Web page" sandbox="allow-forms allow-scripts allow-downloads" referrerpolicy="strict-origin-when-cross-origin"></iframe>
  </div>`;
  const address = root.querySelector("#browser-address");
  const form = root.querySelector("#browser-address-form");
  const frame = root.querySelector(".browser-frame");
  const status = root.querySelector("#browser-status");
  const history = [];
  let historyIndex = -1;

  const updateControls = () => {
    root.querySelector('[data-browser="back"]').disabled = historyIndex <= 0;
    root.querySelector('[data-browser="forward"]').disabled = historyIndex >= history.length - 1;
    root.querySelector('[data-browser="reload"]').disabled = historyIndex < 0;
    root.querySelector('[data-browser="external"]').disabled = historyIndex < 0;
  };
  const navigate = value => {
    let url;
    try { url = normalizeUrl(value); }
    catch (error) {
      api.ui.notify(error.message, { type: "error" });
      return;
    }
    history.splice(historyIndex + 1);
    history.push(url);
    historyIndex = history.length - 1;
    address.value = url;
    status.textContent = "Loading page…";
    root.classList.add("is-loading");
    frame.src = url;
    updateControls();
  };

  form.addEventListener("submit", event => {
    event.preventDefault();
    navigate(address.value);
  });
  root.addEventListener("click", event => {
    const control = event.target.closest("[data-browser]")?.dataset.browser;
    if (control === "back" && historyIndex > 0) {
      historyIndex -= 1;
      address.value = history[historyIndex];
      frame.src = history[historyIndex];
    } else if (control === "forward" && historyIndex < history.length - 1) {
      historyIndex += 1;
      address.value = history[historyIndex];
      frame.src = history[historyIndex];
    } else if (control === "reload" && historyIndex >= 0) {
      frame.src = history[historyIndex];
    } else if (control === "external" && historyIndex >= 0) {
      window.open(history[historyIndex], "_blank", "noopener,noreferrer");
    }
    updateControls();
  });
  frame.addEventListener("load", () => {
    updateControls();
    root.classList.remove("is-loading");
    status.textContent = "Page loaded. Some websites block embedded browsing; use ↗ to open in a new tab.";
  });
  address.addEventListener("keydown", event => {
    if (event.key === "Escape") address.value = history[historyIndex] ?? "";
  });
  updateControls();
}

export const browserApp = Object.freeze({
  id: "browser",
  name: "Browser",
  icon: "◎",
  description: "Browse websites in an isolated embedded window.",
  mount: mountBrowser
});
