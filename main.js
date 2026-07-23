"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const utils = require("@iobroker/adapter-core");

const execFileAsync = promisify(execFile);
const OPENEMS_RELEASE_API = "https://api.github.com/repos/OpenEMS/openems/releases/latest";
const ADOPTIUM_API = "https://api.adoptium.net/v3/assets/latest/21/hotspot";
const MIN_FREE_BYTES = 450 * 1024 * 1024;
const CORE_CONFIGS = {
  "Core/AppManager.config": `:org.apache.felix.configadmin.revision:=L"1"
alias="Core.AppManager"
id="_appManager"
service.bundleLocation="?"
service.pid="Core.AppManager"
`,
  "Core/ComponentManager.config": `:org.apache.felix.configadmin.revision:=L"1"
alias="Core.ComponentManager"
id="_componentManager"
service.bundleLocation="?"
service.pid="Core.ComponentManager"
`,
  "Core/Cycle.config": `:org.apache.felix.configadmin.revision:=L"1"
alias="Core.Cycle"
id="_cycle"
service.bundleLocation="?"
service.pid="Core.Cycle"
`,
  "Core/Energy.config": `:org.apache.felix.configadmin.revision:=L"1"
alias="Core.Energy"
id="_energy"
service.bundleLocation="?"
service.pid="Core.Energy"
`,
  "Core/Meta.config": `:org.apache.felix.configadmin.revision:=L"1"
alias="Core.Meta"
id="_meta"
service.bundleLocation="?"
service.pid="Core.Meta"
`,
  "Core/PredictorManager.config": `:org.apache.felix.configadmin.revision:=L"1"
alias="Core.PredictorManager"
id="_predictorManager"
service.bundleLocation="?"
service.pid="Core.PredictorManager"
`,
  "Core/SerialNumber.config": `:org.apache.felix.configadmin.revision:=L"1"
alias="Core.SerialNumber"
id="_serialNumber"
service.bundleLocation="?"
service.pid="Core.SerialNumber"
`,
  "Core/Sum.config": `:org.apache.felix.configadmin.revision:=L"1"
alias="Core.Sum"
id="_sum"
service.bundleLocation="?"
service.pid="Core.Sum"
`,
  "Scheduler/AllAlphabetically/default.config": `:org.apache.felix.configadmin.revision:=L"2"
alias=""
controllers.ids=[ \\
  "", \\
  ]
enabled=B"true"
id="scheduler0"
service.factoryPid="Scheduler.AllAlphabetically"
service.pid="Scheduler.AllAlphabetically.default"
`
};

function normalizeVersion(value) {
  const match = String(value || "").match(/(\d{4}\.\d{1,2}\.\d+)/);
  return match ? match[1] : String(value || "").replace(/^v/, "");
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, {
      headers: {
        Accept: url.includes("api.github.com") ? "application/vnd.github+json" : "*/*",
        "User-Agent": "ioBroker.openems"
      }
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        request(new URL(response.headers.location, url).href, options).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} bei ${url}`));
        return;
      }
      if (options.file) {
        const output = fs.createWriteStream(options.file, { mode: 0o600 });
        response.pipe(output);
        output.once("finish", () => output.close(() => resolve(options.file)));
        output.once("error", reject);
      } else {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      }
    });
    req.setTimeout(options.timeout || 120000, () => req.destroy(new Error(`Zeitüberschreitung bei ${url}`)));
    req.once("error", reject);
  });
}

async function requestJson(url) {
  return JSON.parse((await request(url, { timeout: 30000 })).toString("utf8"));
}

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  const input = fs.createReadStream(file);
  for await (const chunk of input) hash.update(chunk);
  return hash.digest("hex");
}

function assetByName(release, name) {
  return (release.assets || []).find(asset => asset.name === name);
}

function expectedDigest(asset) {
  const match = String(asset && asset.digest || "").match(/^sha256:([a-f0-9]{64})$/i);
  return match ? match[1].toLowerCase() : "";
}

function tcpReachable(host, port, timeout = 1500) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const done = result => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

class OpenemsAdapter extends utils.Adapter {
  constructor(options = {}) {
    super({ ...options, name: "openems" });
    this.edgeProcess = null;
    this.uiServer = null;
    this.operation = null;
    this.stopping = false;
    this.startedAt = 0;
    this.healthTimer = null;
    this.updateTimer = null;
    this.on("ready", () => this.onReady().catch(error => this.setError(error)));
    this.on("stateChange", (id, state) => this.onStateChange(id, state));
    this.on("unload", callback => this.onUnload(callback));
  }

  async onReady() {
    this.dataDir = utils.getAbsoluteInstanceDataDir(this);
    this.runtimeDir = path.join(this.dataDir, "runtime");
    this.configDir = path.join(this.dataDir, "config");
    this.openemsDataDir = path.join(this.dataDir, "data");
    this.javaDir = path.join(this.runtimeDir, "java");
    this.edgeJar = path.join(this.runtimeDir, "openems-edge.jar");
    this.uiDir = path.join(this.runtimeDir, "ui");
    this.manifestFile = path.join(this.runtimeDir, "installed.json");
    await fsp.mkdir(this.runtimeDir, { recursive: true });
    await fsp.mkdir(this.configDir, { recursive: true });
    await fsp.mkdir(this.openemsDataDir, { recursive: true });
    await this.createObjects();
    await this.subscribeStatesAsync("control.*");
    await this.publishUrl();
    await this.refreshInstallation();

    if (this.config.installOnSave === true) await this.installLatest(false);
    if (this.isInstalled() && this.config.autoStart !== false) await this.startOpenems();

    this.healthTimer = this.setInterval(() => this.updateHealth().catch(error => this.log.debug(error.message)), 10000);
    const hours = Math.max(0, Number(this.config.checkUpdatesHours) || 0);
    if (hours) {
      this.updateTimer = this.setInterval(() => this.checkLatest().catch(error => this.setError(error)), hours * 3600000);
      await this.checkLatest().catch(error => this.setError(error));
    }
  }

  async createObjects() {
    for (const [id, name] of Object.entries({
      info: "Information",
      runtime: "Laufzeit",
      control: "Steuerung"
    })) await this.setObjectNotExistsAsync(id, { type: "channel", common: { name }, native: {} });

    const states = [
      ["info.connection", "OpenEMS Edge erreichbar", "boolean", "indicator.connected", true, false, false],
      ["info.installed", "OpenEMS installiert", "boolean", "indicator", true, false, false],
      ["info.running", "OpenEMS Edge läuft", "boolean", "indicator.running", true, false, false],
      ["info.version", "Installierte OpenEMS-Version", "string", "info.version", true, false, ""],
      ["info.latestVersion", "Aktuelle OpenEMS-Version", "string", "info.version", true, false, ""],
      ["info.updateAvailable", "Update verfügbar", "boolean", "indicator.maintenance", true, false, false],
      ["info.url", "OpenEMS-Weboberfläche", "string", "url", true, false, ""],
      ["info.status", "Status", "string", "text", true, false, ""],
      ["info.lastError", "Letzter Fehler", "string", "text", true, false, ""],
      ["info.lastCheck", "Letzte Prüfung", "string", "date", true, false, ""],
      ["runtime.pid", "Prozess-ID", "number", "value", true, false, 0],
      ["runtime.javaVersion", "Java-Version", "string", "info.version", true, false, ""],
      ["runtime.uptime", "Laufzeit", "number", "value.interval", true, false, 0, "s"],
      ["runtime.rss", "Arbeitsspeicher des Edge-Prozesses", "number", "value.memory", true, false, 0, "MiB"],
      ["runtime.websocketPort", "Edge-Websocket-Port", "number", "info.port", true, false, 8075],
      ["runtime.uiPort", "UI-Port", "number", "info.port", true, false, 8090],
      ["control.installOrUpdate", "OpenEMS installieren oder aktualisieren", "boolean", "button", false, true, false],
      ["control.start", "OpenEMS starten", "boolean", "button.start", false, true, false],
      ["control.stop", "OpenEMS stoppen", "boolean", "button.stop", false, true, false],
      ["control.restart", "OpenEMS neu starten", "boolean", "button.restart", false, true, false]
    ];
    for (const [id, name, type, role, read, write, def, unit] of states) {
      const common = { name, type, role, read, write, def };
      if (unit) common.unit = unit;
      await this.extendObjectAsync(id, { type: "state", common, native: {} });
      if (read && !write && !(await this.getStateAsync(id))) await this.setStateAsync(id, def, true);
    }
  }

  isInstalled() {
    return fs.existsSync(path.join(this.javaDir, "bin", "java"))
      && fs.existsSync(this.edgeJar)
      && fs.existsSync(path.join(this.uiDir, "index.html"))
      && fs.existsSync(this.manifestFile);
  }

  async refreshInstallation() {
    const installed = this.isInstalled();
    await this.setStateAsync("info.installed", installed, true);
    if (!installed) {
      await this.setStateAsync("info.version", "", true);
      return;
    }
    try {
      const manifest = JSON.parse(await fsp.readFile(this.manifestFile, "utf8"));
      await this.setStateAsync("info.version", normalizeVersion(manifest.version), true);
      const { stdout, stderr } = await execFileAsync(path.join(this.javaDir, "bin", "java"), ["-version"], { timeout: 10000 });
      const match = `${stdout} ${stderr}`.match(/version "([^"]+)"/);
      await this.setStateAsync("runtime.javaVersion", match ? match[1] : `${stdout} ${stderr}`.trim(), true);
    } catch (error) {
      await this.setError(error);
    }
  }

  async checkLatest() {
    const release = await requestJson(OPENEMS_RELEASE_API);
    const latest = normalizeVersion(release.tag_name);
    const current = String((await this.getStateAsync("info.version"))?.val || "");
    await this.setStateAsync("info.latestVersion", latest, true);
    await this.setStateAsync("info.updateAvailable", Boolean(current && latest && current !== latest), true);
    await this.setStateAsync("info.lastCheck", new Date().toISOString(), true);
    return { release, latest };
  }

  async installLatest(force = false) {
    if (this.operation) return this.operation;
    this.operation = this.doInstall(force).finally(() => { this.operation = null; });
    return this.operation;
  }

  async doInstall(force) {
    await this.setStateAsync("info.lastError", "", true);
    await this.setStatus("OpenEMS-Version wird geprüft");
    const { release, latest } = await this.checkLatest();
    const current = String((await this.getStateAsync("info.version"))?.val || "");
    if (!force && this.isInstalled() && current === latest) {
      await this.setStatus(`OpenEMS ${latest} ist bereits installiert`);
      return;
    }
    const edgeAsset = assetByName(release, "openems-edge.jar");
    const uiAsset = assetByName(release, "openems-ui.tar.xz");
    if (!edgeAsset || !uiAsset) throw new Error("OpenEMS Edge oder UI fehlt im offiziellen Release");

    const free = fs.statfsSync(this.dataDir).bavail * fs.statfsSync(this.dataDir).bsize;
    if (free < MIN_FREE_BYTES) throw new Error("Zu wenig Speicherplatz: mindestens 450 MB frei erforderlich");

    const architecture = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "aarch64" : "";
    if (!architecture) throw new Error(`Nicht unterstützte Architektur: ${process.arch}`);
    const adoptiumUrl = `${ADOPTIUM_API}?architecture=${architecture}&heap_size=normal&image_type=jre&jvm_impl=hotspot&os=linux&vendor=eclipse`;
    const javaAssets = await requestJson(adoptiumUrl);
    const javaPackage = javaAssets[0] && javaAssets[0].binary && javaAssets[0].binary.package;
    if (!javaPackage || !javaPackage.link || !javaPackage.checksum) throw new Error("Keine passende offizielle Java-21-Laufzeit gefunden");

    const staging = path.join(this.dataDir, `staging-${Date.now()}`);
    const downloads = path.join(staging, "downloads");
    const newRuntime = path.join(staging, "runtime");
    const javaArchive = path.join(downloads, "java.tar.gz");
    const edgeDownload = path.join(downloads, "openems-edge.jar");
    const uiArchive = path.join(downloads, "openems-ui.tar.xz");
    await fsp.mkdir(downloads, { recursive: true });
    await fsp.mkdir(path.join(newRuntime, "java"), { recursive: true });
    await fsp.mkdir(path.join(newRuntime, "ui"), { recursive: true });

    const wasRunning = Boolean(this.edgeProcess || this.uiServer);
    try {
      await this.setStatus(`Java 21 für ${process.arch} wird heruntergeladen`);
      await request(javaPackage.link, { file: javaArchive, timeout: 300000 });
      if ((await sha256(javaArchive)).toLowerCase() !== String(javaPackage.checksum).toLowerCase()) {
        throw new Error("Prüfsumme der Java-Laufzeit stimmt nicht");
      }

      await this.setStatus(`OpenEMS Edge ${latest} wird heruntergeladen`);
      await request(edgeAsset.browser_download_url, { file: edgeDownload, timeout: 300000 });
      const edgeDigest = expectedDigest(edgeAsset);
      if (edgeDigest && (await sha256(edgeDownload)).toLowerCase() !== edgeDigest) throw new Error("Prüfsumme von OpenEMS Edge stimmt nicht");

      await this.setStatus(`OpenEMS UI ${latest} wird heruntergeladen`);
      await request(uiAsset.browser_download_url, { file: uiArchive, timeout: 300000 });
      const uiDigest = expectedDigest(uiAsset);
      if (uiDigest && (await sha256(uiArchive)).toLowerCase() !== uiDigest) throw new Error("Prüfsumme der OpenEMS UI stimmt nicht");

      await execFileAsync("tar", ["-xzf", javaArchive, "--strip-components=1", "-C", path.join(newRuntime, "java")], { timeout: 180000 });
      await execFileAsync("tar", ["-xJf", uiArchive, "--no-same-owner", "--strip-components=1", "-C", path.join(newRuntime, "ui")], { timeout: 180000 });
      await fsp.copyFile(edgeDownload, path.join(newRuntime, "openems-edge.jar"));
      await fsp.writeFile(path.join(newRuntime, "installed.json"), JSON.stringify({
        version: latest,
        installedAt: new Date().toISOString(),
        edgeAsset: edgeAsset.browser_download_url,
        uiAsset: uiAsset.browser_download_url,
        javaAsset: javaPackage.link
      }, null, 2) + "\n");

      if (!fs.existsSync(path.join(newRuntime, "java", "bin", "java"))) throw new Error("Java-Binary fehlt nach dem Entpacken");
      if (!fs.existsSync(path.join(newRuntime, "ui", "index.html"))) throw new Error("OpenEMS UI fehlt nach dem Entpacken");
      if (wasRunning) await this.stopOpenems();

      const backup = path.join(this.dataDir, "runtime.previous");
      await fsp.rm(backup, { recursive: true, force: true });
      if (fs.existsSync(this.runtimeDir)) await fsp.rename(this.runtimeDir, backup);
      try {
        await fsp.rename(newRuntime, this.runtimeDir);
      } catch (error) {
        if (fs.existsSync(backup)) await fsp.rename(backup, this.runtimeDir);
        throw error;
      }
      await fsp.rm(backup, { recursive: true, force: true });
    } finally {
      await fsp.rm(staging, { recursive: true, force: true });
    }

    await this.refreshInstallation();
    await this.setStateAsync("info.updateAvailable", false, true);
    await this.setStatus(`OpenEMS ${latest} wurde installiert`);
    if (wasRunning || this.config.autoStart !== false) await this.startOpenems();
  }

  async startOpenems() {
    if (!this.isInstalled()) throw new Error("OpenEMS ist noch nicht installiert");
    if (!this.uiServer) await this.startUiServer();
    if (this.edgeProcess) return;

    const java = path.join(this.javaDir, "bin", "java");
    const maxMemory = Math.min(2048, Math.max(256, Number(this.config.maxMemoryMb) || 512));
    await this.ensureDefaultConfiguration();
    await this.setStatus("OpenEMS Edge wird gestartet");
    const child = spawn(java, [
      "-Xms128m",
      `-Xmx${maxMemory}m`,
      "-Dosgi.clean=true",
      "-Dorg.apache.felix.eventadmin.Timeout=0",
      "-Dorg.apache.felix.http.host=0.0.0.0",
      "-Dorg.apache.felix.http.port=8080",
      `-Dfelix.cm.dir=${this.configDir}`,
      `-Dopenems.data.dir=${this.openemsDataDir}`,
      "-Djava.net.preferIPv4Stack=true",
      "-XX:+HeapDumpOnOutOfMemoryError",
      "-XX:+ExitOnOutOfMemoryError",
      "-jar",
      this.edgeJar
    ], {
      cwd: this.runtimeDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.edgeProcess = child;
    this.startedAt = Date.now();
    child.stdout.on("data", data => this.log.debug(`[OpenEMS] ${String(data).trim()}`));
    child.stderr.on("data", data => this.log.info(`[OpenEMS] ${String(data).trim()}`));
    child.once("error", error => this.setError(error));
    child.once("exit", async (code, signal) => {
      if (this.edgeProcess !== child) return;
      this.edgeProcess = null;
      this.startedAt = 0;
      await this.setStateAsync("info.running", false, true);
      await this.setStateAsync("info.connection", false, true);
      await this.setStateAsync("runtime.pid", 0, true);
      if (!this.stopping) await this.setStatus(`OpenEMS Edge beendet (${signal || code})`);
    });
    await this.setStateAsync("runtime.pid", child.pid || 0, true);
    await this.setStateAsync("info.running", true, true);
    await this.updateHealth();
  }

  async ensureDefaultConfiguration() {
    for (const [relative, content] of Object.entries(CORE_CONFIGS)) {
      const target = path.join(this.configDir, relative);
      if (fs.existsSync(target)) continue;
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, content, "utf8");
    }
    const port = Math.min(65535, Math.max(1024, Number(this.config.edgeWebsocketPort) || 8075));
    const websocketFile = path.join(this.configDir, "Controller", "Api", "Websocket", "default.config");
    await fsp.mkdir(path.dirname(websocketFile), { recursive: true });
    await fsp.writeFile(websocketFile, `:org.apache.felix.configadmin.revision:=L"1"
alias=""
apiTimeout=I"60"
enabled=B"true"
id="ctrlApiWebsocket0"
port=I"${port}"
service.factoryPid="Controller.Api.Websocket"
service.pid="Controller.Api.Websocket.default"
`, "utf8");
  }

  async startUiServer() {
    const port = Math.min(65535, Math.max(1024, Number(this.config.uiPort) || 8090));
    this.uiServer = http.createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
        let file = path.resolve(this.uiDir, relative);
        if (!file.startsWith(path.resolve(this.uiDir) + path.sep)) throw new Error("Ungültiger Pfad");
        let stat;
        try { stat = await fsp.stat(file); } catch { file = path.join(this.uiDir, "index.html"); stat = await fsp.stat(file); }
        if (stat.isDirectory()) file = path.join(file, "index.html");
        const extension = path.extname(file).toLowerCase();
        const mime = {
          ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
          ".woff": "font/woff", ".woff2": "font/woff2"
        }[extension] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime, "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=86400" });
        fs.createReadStream(file).pipe(res);
      } catch (error) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
      }
    });
    await new Promise((resolve, reject) => {
      this.uiServer.once("error", reject);
      this.uiServer.listen(port, "0.0.0.0", resolve);
    });
    await this.setStateAsync("runtime.uiPort", port, true);
  }

  async updateHealth() {
    const wsPort = Math.min(65535, Math.max(1024, Number(this.config.edgeWebsocketPort) || 8075));
    const connected = Boolean(this.edgeProcess) && await tcpReachable("127.0.0.1", wsPort);
    await this.setStateAsync("info.connection", connected, true);
    await this.setStateAsync("info.running", Boolean(this.edgeProcess), true);
    await this.setStateAsync("runtime.websocketPort", wsPort, true);
    await this.setStateAsync("runtime.uptime", this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0, true);
    if (this.edgeProcess && this.edgeProcess.pid && process.platform === "linux") {
      try {
        const status = await fsp.readFile(`/proc/${this.edgeProcess.pid}/status`, "utf8");
        const match = status.match(/^VmRSS:\s+(\d+)\s+kB/im);
        await this.setStateAsync("runtime.rss", match ? Math.round(Number(match[1]) / 1024 * 10) / 10 : 0, true);
      } catch { /* process may have exited */ }
    }
    if (connected) await this.setStatus("OpenEMS Edge und UI laufen");
  }

  async stopOpenems() {
    const child = this.edgeProcess;
    this.edgeProcess = null;
    if (child) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise(resolve => child.once("exit", resolve)),
        new Promise(resolve => globalThis.setTimeout(resolve, 15000))
      ]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    if (this.uiServer) {
      const server = this.uiServer;
      this.uiServer = null;
      await new Promise(resolve => server.close(resolve));
    }
    this.startedAt = 0;
    await this.setStateAsync("runtime.pid", 0, true);
    await this.setStateAsync("runtime.uptime", 0, true);
    await this.setStateAsync("runtime.rss", 0, true);
    await this.setStateAsync("info.running", false, true);
    await this.setStateAsync("info.connection", false, true);
    await this.setStatus("OpenEMS wurde gestoppt");
  }

  async onStateChange(id, state) {
    if (!state || state.ack || !state.val) return;
    const action = id.split(".").pop();
    try {
      if (action === "installOrUpdate") await this.installLatest(true);
      if (action === "start") await this.startOpenems();
      if (action === "stop") await this.stopOpenems();
      if (action === "restart") {
        await this.stopOpenems();
        await this.startOpenems();
      }
    } catch (error) {
      await this.setError(error);
    } finally {
      await this.setStateAsync(id, false, true);
    }
  }

  async publishUrl() {
    const hostObject = await this.getForeignObjectAsync(`system.host.${this.host}`);
    const host = hostObject && hostObject.common && hostObject.common.hostname || this.host;
    const port = Math.min(65535, Math.max(1024, Number(this.config.uiPort) || 8090));
    await this.setStateAsync("info.url", `http://${host}:${port}`, true);
  }

  async setStatus(text) {
    await this.setStateAsync("info.status", String(text), true);
    this.log.info(String(text));
  }

  async setError(error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    await this.setStateAsync("info.lastError", message, true);
    this.log.error(message);
  }

  async onUnload(callback) {
    this.stopping = true;
    try {
      if (this.healthTimer) this.clearInterval(this.healthTimer);
      if (this.updateTimer) this.clearInterval(this.updateTimer);
      await this.stopOpenems();
      callback();
    } catch {
      callback();
    }
  }
}

if (require.main !== module) module.exports = options => new OpenemsAdapter(options);
else new OpenemsAdapter();
