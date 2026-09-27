const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
require("../scripts/register-core.cjs");

// src/core/lighting is also the eo-lighting package, which game clients
// install on their own. It must stand alone and describe itself truly.
const root = path.resolve(__dirname, "../src/core/lighting");

function modules(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return modules(file);
    return entry.name.endsWith(".js") ? [file] : [];
  });
}

test("the package imports nothing from outside itself, always by full file name", () => {
  for (const file of modules()) {
    const source = fs.readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(/from\s+"([^"]+)"/g)) {
      const where = `${path.relative(root, file)} imports ${specifier}`;
      assert.ok(specifier.startsWith("."), `${where}: a dependency`);
      assert.ok(specifier.endsWith(".js"), `${where}: no file extension`);
      const target = path.resolve(path.dirname(file), specifier);
      assert.ok(target.startsWith(root + path.sep), `${where}: outside`);
      assert.ok(fs.existsSync(target), `${where}: missing`);
    }
  }
});

test("index.d.ts declares exactly what index.js exports", () => {
  const exported = Object.keys(require(path.join(root, "index.js"))).sort();
  const declarations = fs.readFileSync(path.join(root, "index.d.ts"), "utf8");
  const declared = [
    ...declarations.matchAll(/export declare (?:const|function|class) (\w+)/g),
  ]
    .map(([, name]) => name)
    .sort();
  assert.deepEqual([...new Set(declared)], exported);
});

test("the manifest points at the entry, its types and the licence", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  assert.equal(manifest.name, "eo-lighting");
  assert.equal(manifest.type, "module");
  assert.equal(manifest.license, "MIT");
  const entry = manifest.exports["."];
  for (const file of [entry.default, entry.types, manifest.types, "LICENSE"])
    assert.ok(fs.existsSync(path.join(root, file)), file);
});
