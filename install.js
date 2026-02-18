#!/usr/bin/env node

const { execFileSync } = require("child_process");
const { createWriteStream, chmodSync, mkdirSync, existsSync, unlinkSync } = require("fs");
const { get } = require("https");
const { join } = require("path");
const { pipeline } = require("stream/promises");
const { createGunzip } = require("zlib");
const tar = require("tar"); // We'll handle without tar dependency

const VERSION = require("./package.json").version;
const REPO = "4ier/notion-cli";

function getPlatform() {
  const platform = process.platform;
  const arch = process.arch;

  const osMap = { linux: "linux", darwin: "darwin", win32: "windows" };
  const archMap = { x64: "amd64", arm64: "arm64" };

  const os = osMap[platform];
  const cpu = archMap[arch];

  if (!os || !cpu) {
    console.error(`Unsupported platform: ${platform}/${arch}`);
    process.exit(1);
  }

  return { os, cpu };
}

function getDownloadURL(os, cpu) {
  const ext = os === "windows" ? "zip" : "tar.gz";
  return `https://github.com/${REPO}/releases/download/v${VERSION}/notion-cli_${VERSION}_${os}_${cpu}.${ext}`;
}

function download(url) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode} ${url}`));
        return;
      }
      resolve(res);
    }).on("error", reject);
  });
}

async function install() {
  const { os, cpu } = getPlatform();
  const url = getDownloadURL(os, cpu);
  const binDir = join(__dirname, "bin");
  const binName = os === "windows" ? "notion.exe" : "notion";
  const binPath = join(binDir, binName);

  if (existsSync(binPath)) {
    console.log("notion-cli already installed");
    return;
  }

  console.log(`Downloading notion-cli v${VERSION} for ${os}/${cpu}...`);

  mkdirSync(binDir, { recursive: true });

  const stream = await download(url);

  if (os === "windows") {
    // For zip, download to temp file and extract
    const tmpPath = join(binDir, "tmp.zip");
    const file = createWriteStream(tmpPath);
    await new Promise((resolve, reject) => {
      stream.pipe(file);
      file.on("finish", resolve);
      file.on("error", reject);
    });
    // Use unzip command or built-in
    try {
      execFileSync("unzip", ["-o", tmpPath, binName, "-d", binDir]);
    } catch {
      execFileSync("powershell", [
        "-Command",
        `Expand-Archive -Path '${tmpPath}' -DestinationPath '${binDir}' -Force`,
      ]);
    }
    unlinkSync(tmpPath);
  } else {
    // tar.gz: pipe through gunzip and extract
    const tmpPath = join(binDir, "tmp.tar.gz");
    const file = createWriteStream(tmpPath);
    await new Promise((resolve, reject) => {
      stream.pipe(file);
      file.on("finish", resolve);
      file.on("error", reject);
    });
    execFileSync("tar", ["xzf", tmpPath, "-C", binDir, binName]);
    unlinkSync(tmpPath);
  }

  if (os !== "windows") {
    chmodSync(binPath, 0o755);
  }

  console.log(`notion-cli v${VERSION} installed successfully`);
}

install().catch((err) => {
  console.error("Failed to install notion-cli:", err.message);
  console.error("You can install manually from https://github.com/4ier/notion-cli/releases");
  process.exit(1);
});
