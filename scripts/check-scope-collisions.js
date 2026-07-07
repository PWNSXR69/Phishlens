#!/usr/bin/env node
/**
 * check-scope-collisions.js
 * ---------------------------------------------------------
 * This exists because the same bug bit this project THREE times:
 * two files that each look correct on their own throw a
 * SyntaxError only once Chrome loads them into one shared global
 * scope — importScripts() in the service worker, multiple entries
 * in a manifest content_scripts "js" array, or multiple <script>
 * tags in a popup all create this same kind of shared scope.
 *
 * `node --check somefile.js` can NEVER catch this, because it
 * checks exactly one file in isolation. The collision doesn't
 * exist until the files are combined in the real load order.
 *
 * The fix: actually simulate that load order — concatenate the
 * files in the exact sequence Chrome would load them — and
 * COMPILE (not execute) the result. Redeclaration errors
 * (`Identifier 'x' has already been declared`) are a parse-time
 * error, so compiling is enough; we never need to run chrome.*
 * calls or mock the DOM to catch this.
 * ---------------------------------------------------------
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let failed = false;

function compileCheck(label, relativeFiles) {
  const source = relativeFiles
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"))
    .join("\n;\n");
  try {
    new vm.Script(source, { filename: label });
    console.log(`✓ ${label}`);
    console.log(`  load order: ${relativeFiles.join(" -> ")}`);
  } catch (err) {
    failed = true;
    console.error(`✗ ${label}`);
    console.error(`  load order: ${relativeFiles.join(" -> ")}`);
    console.error(`  ${err.name}: ${err.message}`);
  }
}

// ---------- 1. Content script bundle (manifest.json content_scripts) ----------
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
for (const entry of manifest.content_scripts) {
  compileCheck("content_scripts bundle", entry.js);
}

// ---------- 2. Service worker bundle (background.js's importScripts calls) ----------
const bg = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
const importedFiles = [...bg.matchAll(/importScripts\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
compileCheck("service worker bundle", [...importedFiles, "background.js"]);

// ---------- 3. Popup bundle (popup.html's <script src="..."> tags, in order) ----------
const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
const popupScripts = [...popupHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
compileCheck("popup bundle", popupScripts);

if (failed) {
  console.error("\nOne or more shared-scope bundles failed to compile. Fix the");
  console.error("collision above before shipping — it will crash in the browser");
  console.error("exactly the way it just crashed here, with no execution needed.");
  process.exit(1);
} else {
  console.log("\nAll shared-scope bundles compile cleanly.");
}
