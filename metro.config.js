const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const http = require("node:http");
const config = getDefaultConfig(__dirname);
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    if (!req.url.startsWith("/api/")) return middleware(req, res, next);
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: process.env.API_PORT || 3001,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Rabbit is reconnecting. Please try again." }),
      );
    });
    req.pipe(upstream);
  },
};
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
  extraThemes: ["dark"],
});
