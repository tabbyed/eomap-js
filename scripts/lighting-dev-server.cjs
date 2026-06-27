// Local development only. Graphics stay in the user's EO installation.
// Usage: node scripts/lighting-dev-server.cjs <gfx-directory> [EMF-path]
const path = require("node:path");
const fs = require("node:fs");
const webpack = require("webpack");
const WebpackDevServer = require("webpack-dev-server");

const gfxDirectory = process.argv[2];
if (!gfxDirectory || !fs.existsSync(path.join(gfxDirectory, "gfx004.egf"))) {
  throw new Error("Pass your EO gfx directory, containing gfx004.egf.");
}
const port = Number(process.env.PORT || 4174);
const config = require("../webpack/web/web")({
  FORCE_CONNECTED_MODE_URL: "/",
  LIGHTING_DEMO_URL: process.argv[3] ? "/lighting-fixture.emf" : "",
});
const server = new WebpackDevServer(
  {
    host: "127.0.0.1",
    port,
    open: false,
    static: [
      {
        directory: path.resolve(gfxDirectory),
        publicPath: "/gfx",
        watch: false,
      },
      {
        directory: path.resolve(__dirname, "../src/core/assets/bundled"),
        publicPath: "/assets",
        watch: false,
      },
    ],
    setupMiddlewares(middlewares, devServer) {
      if (process.argv[3])
        devServer.app.get("/lighting-fixture.emf", (_request, response) =>
          response.sendFile(path.resolve(process.argv[3])),
        );
      return middlewares;
    },
  },
  webpack(config),
);
server
  .start()
  .then(() => console.log(`Lighting editor: http://127.0.0.1:${port}`));
