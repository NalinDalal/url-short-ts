import { serve } from "bun";
import { createClient, RedisClientType } from "redis";
import { nanoid } from "nanoid"; // shortid alternative
import dotenv from "dotenv";

dotenv.config();

const PORT = parseInt(process.env.PORT || "3000", 10);

const redisClients: RedisClientType[] = [
  createClient({
    url: `redis://${process.env.REDIS_HOST_1}:${process.env.REDIS_PORT_1}`,
  }),
  createClient({
    url: `redis://${process.env.REDIS_HOST_2}:${process.env.REDIS_PORT_2}`,
  }),
  createClient({
    url: `redis://${process.env.REDIS_HOST_3}:${process.env.REDIS_PORT_3}`,
  }),
];

// Connect all clients
await Promise.all(redisClients.map((client) => client.connect()));
console.log("✅ All Redis clients connected");

// Hash function to distribute keys
function getRedisClient(key: string): RedisClientType {
  const hash = key.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return redisClients[hash % redisClients.length];
}

// --- OpenAPI spec ---
const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "URL Shortener API",
    version: "1.0.0",
  },
  servers: [{ url: `http://localhost:${PORT}` }],
  paths: {
    "/shorten": {
      post: {
        summary: "Shorten a long URL",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  url: { type: "string", example: "https://example.com" },
                  ttl: { type: "integer", example: 3600 },
                },
                required: ["url"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Shortened URL",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    shortUrl: {
                      type: "string",
                      example: "http://localhost:3000/abc123",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/{shortId}": {
      get: {
        summary: "Redirect to the original URL",
        parameters: [
          {
            name: "shortId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "302": { description: "Redirects to original URL" },
          "404": { description: "Short URL not found" },
        },
      },
      delete: {
        summary: "Delete a short URL",
        parameters: [
          {
            name: "shortId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Short URL deleted" },
          "404": { description: "Short URL not found" },
        },
      },
    },
  },
};

// --- Bun server ---
serve({
  port: PORT,
  fetch: async (req) => {
    const url = new URL(req.url);

    // Serve Swagger UI
    if (req.method === "GET" && url.pathname === "/docs") {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Swagger Docs</title>
            <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
          </head>
          <body>
            <div id="swagger-ui"></div>
            <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
            <script>
              SwaggerUIBundle({
                url: '/openapi.json',
                dom_id: '#swagger-ui'
              });
            </script>
          </body>
        </html>
      `;
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // Serve OpenAPI spec
    if (req.method === "GET" && url.pathname === "/openapi.json") {
      return Response.json(openApiSpec);
    }

    // Root endpoint
    if (req.method === "GET" && url.pathname === "/") {
      return new Response(
        `<h1>🚀 URL Shortener API</h1><p>See <a href="/docs">/docs</a> for Swagger UI</p>`,
        { headers: { "Content-Type": "text/html" } },
      );
    }

    // Shorten URL
    if (req.method === "POST" && url.pathname === "/shorten") {
      try {
        const body = await req.json();
        const { url: originalUrl, ttl } = body;

        if (!originalUrl) {
          return new Response(JSON.stringify({ error: "URL is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const shortId = nanoid(8);
        const redisClient = getRedisClient(shortId);

        await redisClient.set(shortId, originalUrl, {
          EX: ttl || 3600,
        });

        return Response.json({
          shortUrl: `http://localhost:${PORT}/${shortId}`,
        });
      } catch {
        return new Response(JSON.stringify({ error: "Invalid request" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Redirect
    if (req.method === "GET" && url.pathname.length > 1) {
      const shortId = url.pathname.slice(1);
      const redisClient = getRedisClient(shortId);
      const originalUrl = await redisClient.get(shortId);

      if (!originalUrl) {
        return new Response("URL not found", { status: 404 });
      }

      return Response.redirect(originalUrl, 302);
    }

    // Delete
    if (req.method === "DELETE" && url.pathname.length > 1) {
      const shortId = url.pathname.slice(1);
      const redisClient = getRedisClient(shortId);

      const deleted = await redisClient.del(shortId);

      if (deleted === 0) {
        return new Response(
          JSON.stringify({ message: "Short URL not found" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({ message: "Short URL deleted successfully" }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Fallback
    return new Response("Not found", { status: 404 });
  },
});

console.log(`🚀 Server running on http://localhost:${PORT}`);
console.log(`📖 Swagger docs at http://localhost:${PORT}/docs`);
