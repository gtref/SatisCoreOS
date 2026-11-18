function mountApi(root, api) {
  root.innerHTML = `<div class="api-app">
    <p class="eyebrow">BUILD YOUR OWN</p><h2 class="app-heading">A tiny app API</h2>
    <p class="muted">For a no-code start, open App Studio. To write a little JavaScript, register an app with one object and one mount function.</p>
    <section class="api-section"><h3>Make an app</h3><pre class="api-code">window.SatisCoreOS.apps.register({
  id: "hello", name: "Hello", icon: "✦",
  description: "A tiny example app",
  mount(element, api) {
    element.innerHTML = "&lt;button&gt;Say hello&lt;/button&gt;";
    element.querySelector("button").onclick = () =&gt;
      api.ui.notify("Hello from your app!");
  }
});</pre></section>
    <section class="api-section"><h3>Everyday helpers</h3><pre class="api-code">api.ui.notify("Hello!");
api.apps.open("notes");
const files = await api.fs.list("/home/guest");
await api.fs.write("/home/guest/hello.txt", "Hello!");</pre>
      <p class="muted">Apps can also read files with <code>api.fs.readText(path)</code>, create folders with <code>api.fs.mkdir(path)</code>, and remove files with <code>api.fs.remove(path)</code>.</p>
    </section>
    <section class="api-section"><h3>More tools</h3><p class="muted">Use <code>api.apps.list()</code> to discover apps. The filesystem also supports binary files, usage details, and backup import/export. <code>api.system.version</code> reports the current version (${api.system.version}).</p></section>
    <section class="api-section"><h3>Good to know</h3><p class="muted">This is a browser-based desktop, not a security boundary. Apps run in the same page context; only load code you trust. Files stay in this browser profile until exported or cleared.</p></section>
  </div>`;
  root.dataset.appCount = String(api.apps.list().length);
}

export const systemApiApp = Object.freeze({
  id: "api", name: "System API", icon: "{ }",
  description: "Build apps with the SatisCoreOS API.", mount: mountApi
});
