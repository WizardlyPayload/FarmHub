#!/usr/bin/env node
/**
 * Browser smoke for a compiled NEW APP directory. Read-only against --compiled.
 * Uses a loopback mock API and a disposable browser profile, never the live app.
 * Usage: node tools/app/tests/compiled-ui-source-smoke.mjs --compiled <ui-v2-dir>
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const appRequire = createRequire(join(root, "FS25_FarmDashboard_App", "package.json"));
const { WebSocketServer } = appRequire("ws");
const timeoutMs = 15000;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function requireCompiledArg() {
  const args = process.argv.slice(2);
  assert.equal(args.length, 2, "Usage: --compiled <ui-v2-dir>");
  assert.equal(args[0], "--compiled", "Usage: --compiled <ui-v2-dir>");
  assert.ok(isAbsolute(args[1]), "--compiled must be an absolute directory path");
  return resolve(args[1]);
}

async function entryIdentity(compiledDir) {
  const indexPath = join(compiledDir, "index.html");
  const html = await fs.readFile(indexPath, "utf8");
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g)];
  assert.equal(scripts.length, 1, "compiled index.html must have one entry JS script");
  const entryUrl = scripts[0][1];
  assert.ok(entryUrl.startsWith("/assets/"), "entry must be a compiled local /assets/ JS file");
  const entryPath = resolve(compiledDir, `.${entryUrl}`);
  const rel = relative(compiledDir, entryPath);
  assert.ok(rel && !rel.startsWith("..") && !isAbsolute(rel), "entry escaped compiled directory");
  const js = await fs.readFile(entryPath);
  return { entryUrl, entryPath, entrySha256: createHash("sha256").update(js).digest("hex") };
}

function sourceRow(id, status = "snapshot") {
  return {
    id,
    name: id === "witcombe" ? "Witcombe Park Farm" : "Riverbend Springs",
    mode: "local",
    sourceBinding: {
      bindingId: randomUUID(),
      stateRevision: 1,
      stateStatus: status,
      publishedAt: "2026-10-09T00:00:00.000Z",
      exportIdentity: {
        careerId: `mock-career-${id}`,
        sessionId: `mock-session-${id}`,
        publicationSequence: 1,
        exportGeneration: 1,
      },
    },
  };
}

function sourcePayload(row) {
  return {
    sourceBinding: row.sourceBinding,
    dataSource: "lua_only",
    luaAvailable: true,
    xmlAvailable: false,
    mapTitle: row.name,
    savegameName: row.name,
    lastUpdated: new Date().toISOString(),
    farmInfo: [{ id: 1, name: "Mock Farm", money: 0 }],
    fields: [], vehicles: [], animals: [], productions: [],
    dataTimestamps: {
      lastLuaReceivedAt: new Date().toISOString(),
      lastXmlReceivedAt: null,
      isStale: false,
      confidence: "live",
    },
  };
}

function respondJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "http://127.0.0.1",
  });
  response.end(JSON.stringify(value));
}

async function startMockSite(compiledDir, entryUrl) {
  const state = { rows: [], dataRequests: [], serverRequests: 0, staticRequests: new Set() };
  const sockets = new WebSocketServer({ noServer: true });
  const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
    ".woff2": "font/woff2", ".webp": "image/webp",
  };
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/servers") {
        state.serverRequests += 1;
        respondJson(response, 200, state.rows);
        return;
      }
      if (url.pathname === "/api/data") {
        const id = url.searchParams.get("serverId");
        state.dataRequests.push(id);
        const row = state.rows.find((item) => item.id === id);
        respondJson(response, row ? 200 : 404, row ? sourcePayload(row) : { error: "unknown_mock_source" });
        return;
      }
      if (url.pathname === "/api/lan-ws-token") {
        respondJson(response, 200, { token: "mock-local-only" });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        respondJson(response, 200, {});
        return;
      }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { respondJson(response, 400, {}); return; }
      const file = resolve(compiledDir, `.${pathname === "/" ? "/index.html" : pathname}`);
      const rel = relative(compiledDir, file);
      if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
        respondJson(response, 403, {});
        return;
      }
      let content;
      try { content = await fs.readFile(file); } catch { respondJson(response, 404, {}); return; }
      state.staticRequests.add(pathname);
      response.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:; font-src 'self' data:",
      });
      response.end(content);
    })().catch((error) => {
      if (!response.headersSent) respondJson(response, 500, { error: String(error) });
      else response.destroy(error);
    });
  });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/") { socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
  });
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  return {
    state,
    url: `http://127.0.0.1:${port}/`,
    close: async () => {
      for (const client of sockets.clients) client.terminate();
      await new Promise((done) => sockets.close(done));
      await new Promise((done) => server.close(done));
    },
    assertEntryLoaded: () => assert.ok(state.staticRequests.has(entryUrl), "browser never requested compiled entry JS"),
  };
}

function browserBinary() {
  const candidates = [
    process.env.FARMDASH_SMOKE_BROWSER,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  return candidates;
}

async function waitForFile(file, child) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`isolated browser exited with code ${child.exitCode}`);
    try { return await fs.readFile(file, "utf8"); } catch { await sleep(75); }
  }
  throw new Error(`isolated browser did not create ${basename(file)} within ${timeoutMs}ms`);
}

async function openCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: yes, reject: no } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) no(new Error(`${message.error.code}: ${message.error.message}`));
    else yes(message.result || {});
  });
  socket.addEventListener("close", () => {
    for (const { reject } of pending.values()) reject(new Error("browser CDP socket closed"));
    pending.clear();
  });
  return {
    send(method, params = {}) {
      return new Promise((yes, no) => {
        const callId = ++id;
        pending.set(callId, { resolve: yes, reject: no });
        socket.send(JSON.stringify({ id: callId, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

async function startBrowser() {
  const profile = await fs.mkdtemp(join(tmpdir(), "farmhub-ui-smoke-"));
  let child = null;
  try {
    const candidates = browserBinary();
    let binary = null;
    for (const candidate of candidates) {
      try { await fs.access(candidate); binary = candidate; break; } catch { /* next local browser */ }
    }
    assert.ok(binary, "No local Edge/Chrome binary available for compiled-entry smoke");
    child = spawn(binary, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--disable-background-networking", "--disable-sync",
      "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
    ], { stdio: "ignore", windowsHide: true });
    const portFile = await waitForFile(join(profile, "DevToolsActivePort"), child);
    const port = Number(portFile.split(/\r?\n/)[0]);
    assert.ok(Number.isInteger(port) && port > 0, "browser returned invalid CDP port");
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((res) => res.json());
    const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    assert.ok(target, "browser created no isolated page target");
    const cdp = await openCdp(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", { urls: ["https://*"] });
    return {
      cdp,
      async close() {
        try { await cdp.send("Browser.close"); } catch { /* browser may already be closed */ }
        cdp.close();
        if (child.exitCode === null) child.kill();
        const rel = relative(tmpdir(), profile);
        if (rel.startsWith("..") || isAbsolute(rel) || !basename(profile).startsWith("farmhub-ui-smoke-")) {
          throw new Error("Refusing to remove a browser profile outside the temporary smoke directory");
        }
        try { await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
        catch { /* Windows may release the profile a moment after Browser.close. */ }
      },
    };
  } catch (error) {
    if (child?.exitCode === null) child.kill();
    throw error;
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`browser evaluation failed: ${result.exceptionDetails.text}`);
  return result.result?.value;
}

const snapshotExpression = `(() => {
  const select = document.querySelector('.fd-topbar__save-select');
  const bar = document.querySelector('.fd-topbar');
  return {
    hasSelect: !!select,
    value: select ? select.value : null,
    options: select ? Array.from(select.options, (option) => option.value) : [],
    saved: localStorage.getItem('farmdash_active_server_v1'),
    classic: localStorage.getItem('dashboard_active_server'),
    topbar: bar ? bar.textContent : '',
    body: document.body ? document.body.textContent.slice(0, 1000) : '',
  };
})()`;

async function waitForState(cdp, state, label, predicate) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(cdp, snapshotExpression);
      if (predicate(last)) return last;
    } catch { /* navigation may briefly destroy the prior JS context */ }
    await sleep(100);
  }
  throw new Error(`${label} timed out: ${JSON.stringify({ last, dataRequests: state.dataRequests, serverRequests: state.serverRequests })}`);
}

async function navigateSeeded(cdp, url, saved, classic = null) {
  await cdp.send("Page.navigate", { url: "about:blank" });
  await sleep(100);
  const seed = `localStorage.clear(); localStorage.setItem('farmdash_locale', 'en');`
    + (saved === null ? "" : `localStorage.setItem('farmdash_active_server_v1', ${JSON.stringify(saved)});`)
    + (classic === null ? "" : `localStorage.setItem('dashboard_active_server', ${JSON.stringify(classic)});`);
  const { identifier } = await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: seed });
  await cdp.send("Page.navigate", { url });
  return async () => cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
}

async function runCases(site, cdp) {
  const results = [];
  const riverbend = sourceRow("riverbend");
  const witcombe = sourceRow("witcombe");
  async function scenario(name, rows, saved, classic, verify) {
    site.state.rows = rows;
    site.state.dataRequests = [];
    const removeSeed = await navigateSeeded(cdp, `${site.url}?smoke=${encodeURIComponent(name)}`, saved, classic);
    try { await verify(); results.push({ name, result: "PASS" }); }
    finally { await removeSeed(); }
  }

  await scenario("valid-new-key", [riverbend, witcombe], "witcombe", null, async () => {
    const page = await waitForState(cdp, site.state, "valid new key", (p) =>
      p.hasSelect && p.value === "witcombe" && site.state.dataRequests.includes("witcombe"));
    assert.equal(page.saved, "witcombe");
    assert.deepEqual(site.state.dataRequests.filter((id) => id !== "witcombe"), []);
  });

  await scenario("classic-only-migration", [riverbend, witcombe], null, "witcombe", async () => {
    const page = await waitForState(cdp, site.state, "classic key migration", (p) =>
      p.hasSelect && p.value === "witcombe" && p.saved === "witcombe" && site.state.dataRequests.includes("witcombe"));
    assert.equal(page.classic, "witcombe");
    assert.deepEqual(site.state.dataRequests.filter((id) => id !== "witcombe"), []);
  });

  await scenario("two-sources-no-key", [riverbend, witcombe], null, null, async () => {
    const page = await waitForState(cdp, site.state, "explicit chooser", (p) =>
      p.hasSelect && p.options.includes("riverbend") && p.options.includes("witcombe"));
    await sleep(350);
    assert.equal(page.value, "", "multi-source should render an explicit empty choice");
    assert.equal((await evaluate(cdp, snapshotExpression)).saved, null, "no preference may be written silently");
    assert.deepEqual(site.state.dataRequests, [], "no source data may load before choice");
  });

  await scenario("saved-id-pending", [riverbend], "witcombe", null, async () => {
    const first = await waitForState(cdp, site.state, "pending saved ID", (p) =>
      p.hasSelect && p.options.includes("riverbend"));
    await sleep(350);
    assert.equal(first.value, "", "Riverbend must not replace pending Witcombe");
    assert.equal((await evaluate(cdp, snapshotExpression)).saved, "witcombe");
    assert.deepEqual(site.state.dataRequests, [], "Riverbend data must not be fetched");
    site.state.rows = [riverbend, witcombe];
    await cdp.send("Page.reload", { ignoreCache: true });
    const second = await waitForState(cdp, site.state, "saved ID return", (p) =>
      p.hasSelect && p.value === "witcombe" && site.state.dataRequests.includes("witcombe"));
    assert.equal(second.saved, "witcombe");
    assert.deepEqual(site.state.dataRequests.filter((id) => id !== "witcombe"), []);
  });

  const heldWitcombe = sourceRow("witcombe", "held");
  await scenario("held-binding-no-false-live", [riverbend, heldWitcombe], "witcombe", null, async () => {
    const page = await waitForState(cdp, site.state, "held provenance badge", (p) =>
      p.hasSelect && p.value === "witcombe" && site.state.dataRequests.includes("witcombe")
      && p.topbar.includes("Held snapshot"));
    assert.ok(!page.topbar.includes("Live API"), "held publication must not claim Live API");
    assert.ok(!page.topbar.includes("Snap XML"), "Lua-only held publication must not claim XML");
  });

  return results;
}

async function main() {
  const compiledDir = requireCompiledArg();
  const identity = await entryIdentity(compiledDir);
  const site = await startMockSite(compiledDir, identity.entryUrl);
  let browser = null;
  try {
    browser = await startBrowser();
    const cases = await runCases(site, browser.cdp);
    site.assertEntryLoaded();
    console.log(JSON.stringify({
      result: "PASS", compiledDir, entryJs: identity.entryUrl,
      entrySha256: identity.entrySha256, cases,
      api: { serverRequests: site.state.serverRequests, finalDataRequests: site.state.dataRequests },
    }, null, 2));
  } finally {
    await browser?.close();
    await site.close();
  }
}

main().catch((error) => {
  console.error(`COMPILED_UI_SMOKE_FAIL: ${error.stack || error}`);
  process.exitCode = 1;
});
