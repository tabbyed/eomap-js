// The application is bundled as ES modules; Node tests/benchmarks use the same
// core modules through the project's existing Babel dependency.
const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");
const core = path.resolve(__dirname, "../src/core") + path.sep;
const original = require.extensions[".js"];
require.extensions[".js"] = (module, filename) => {
  if (!filename.startsWith(core)) return original(module, filename);
  module._compile(
    babel.transformSync(fs.readFileSync(filename, "utf8"), {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      // Match webpack: static class fields (e.g. FaxCode) initialise after
      // their class binding exists, so the gfx decoders also load in Node.
      plugins: [
        ["@babel/plugin-proposal-decorators", { decoratorsBeforeExport: true }],
        ["@babel/plugin-proposal-class-properties"],
      ],
      filename,
    }).code,
    filename,
  );
};
