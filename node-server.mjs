// node-server.mjs — wraps the TanStack Start Cloudflare-style fetch handler
// into a plain Node.js HTTP server for Railway/Render/VPS deployment.
import http from "http";
import { createRequire } from "module";

const port = process.env.PORT || 3000;

async function main() {
  const { default: handler } = await import("./dist/server/server.js");

  const server = http.createServer(async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const host = req.headers["host"] || "localhost";
      const url = new URL(req.url, `${protocol}://${host}`);

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value == null) continue;
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyBuffer = Buffer.concat(chunks);
      const body = ["GET", "HEAD"].includes(req.method ?? "GET")
        ? undefined
        : bodyBuffer.length > 0
        ? bodyBuffer
        : undefined;

      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body,
      });

      const response = await handler.fetch(request, {}, {});

      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));

      const buf = await response.arrayBuffer();
      res.end(Buffer.from(buf));
    } catch (err) {
      console.error("Server error:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
