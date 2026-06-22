import express from "express";
import chokidar from "chokidar";
import { WebSocketServer } from "ws";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "graphify-out");
const GRAPH_JSON = path.join(OUT_DIR, "graph.json");
const GRAPH_HTML = path.join(OUT_DIR, "graph.html");
const PORT = Number(process.env.GRAPHIFY_LIVE_PORT || 5501);

const app = express();

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
}

function runGraphifyHtmlExport() {
  return new Promise((resolve, reject) => {
    // GRAPH_JSON is always our own computed path (never external input), but
    // quote it for the win32 shell since path.join can still contain spaces.
    const isWin = process.platform === "win32";
    const args = ["export", "html", "--graph", isWin ? `"${GRAPH_JSON}"` : GRAPH_JSON];
    const child = spawn("graphify", args, {
      cwd: ROOT,
      shell: isWin,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`graphify export html failed with code ${code}`));
    });
  });
}

const liveReloadScript = `
<script>
(() => {
  const ws = new WebSocket("ws://" + location.host + "/__graphify_live");

  ws.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "graph-updated") {
        console.log("[graphify-live] graph updated, reloading...");
        location.reload();
      }
    } catch (error) {
      console.warn("[graphify-live] invalid message", error);
    }
  });

  ws.addEventListener("close", () => {
    console.warn("[graphify-live] disconnected");
  });
})();
</script>
`;

function injectLiveReload(html) {
  if (html.includes("__graphify_live")) return html;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${liveReloadScript}</body>`);
  }

  return html + liveReloadScript;
}

app.get(["/", "/graph.html"], (req, res) => {
  if (!fs.existsSync(GRAPH_HTML)) {
    res.status(404).send(`
      <h1>graph.html not found</h1>
      <p>Run: <code>graphify export html --graph graphify-out/graph.json</code></p>
    `);
    return;
  }

  const html = fs.readFileSync(GRAPH_HTML, "utf8");
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(injectLiveReload(html));
});

app.use(
  express.static(OUT_DIR, {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-store");
    },
  })
);

const server = app.listen(PORT, () => {
  console.log(`[graphify-live] Open http://localhost:${PORT}`);
});

const wss = new WebSocketServer({
  server,
  path: "/__graphify_live",
});

function broadcast(payload) {
  const message = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

let lastHash = fileHash(GRAPH_JSON);
let timer = null;
let exporting = false;

function scheduleRefresh() {
  clearTimeout(timer);

  timer = setTimeout(async () => {
    if (exporting) return;

    const nextHash = fileHash(GRAPH_JSON);
    if (!nextHash || nextHash === lastHash) return;

    lastHash = nextHash;
    exporting = true;

    try {
      console.log("[graphify-live] graph.json changed");
      await runGraphifyHtmlExport();

      broadcast({
        type: "graph-updated",
        hash: nextHash,
        time: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[graphify-live]", error);
    } finally {
      exporting = false;
    }
  }, 800);
}

chokidar
  .watch(GRAPH_JSON, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 700,
      pollInterval: 100,
    },
  })
  .on("add", scheduleRefresh)
  .on("change", scheduleRefresh);

console.log(`[graphify-live] Watching ${GRAPH_JSON}`);
