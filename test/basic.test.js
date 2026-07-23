"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("metadata names and versions match", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const io = JSON.parse(fs.readFileSync(path.join(root, "io-package.json"), "utf8"));
  assert.equal(pkg.name, "iobroker.openems");
  assert.equal(io.common.name, "openems");
  assert.equal(pkg.version, io.common.version);
});

test("admin configuration provides an instance link port", () => {
  const io = JSON.parse(fs.readFileSync(path.join(root, "io-package.json"), "utf8"));
  assert.equal(io.common.localLinks._default.link, "http://%ip%:%uiPort%");
  assert.equal(io.native.installOnSave, false);
});

test("documentation is available in English and German", () => {
  assert.ok(fs.statSync(path.join(root, "README.md")).size > 500);
  assert.ok(fs.statSync(path.join(root, "README_DE.md")).size > 500);
});
