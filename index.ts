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

// Handle requests with the Bun server
serve({
  port: PORT,
  fetch: async (req) => {
    const url = new URL(req.url);

    // Root Endpoint: Display API documentation
    if (req.method === "GET" && url.pathname === "/") {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>URL Shortener API</title>
            <style>
              body {
                font-family: system-ui, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                background: #f7fafc;
                margin: 0;
              }
              .container {
                text-align: center;
                padding: 2rem;
                border-radius: 12px;
                background: white;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
              }
              h1 {
                font-size: 2rem;
                margin-bottom: 1rem;
              }
              p {
                margin: 0.5rem 0;
              }
              code {
                background: #edf2f7;
                padding: 0.2rem 0.4rem;
                border-radius: 4px;
                font-size: 0.95rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🚀 Welcome to the URL Shortener API!</h1>
              <p>Use <code>POST /shorten</code> with JSON body:</p>
              <p><code>{ "url": "https://example.com", "ttl": 3600 }</code></p>
              <p>Then access your shortened URL via <code>GET /:shortId</code></p>
            </div>
          </body>
        </html>
      `;
      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    }

    // Shorten URL: POST /shorten
    if (req.method === "POST" && url.pathname === "/shorten") {
      try {
        const body = await req.json();
        const { url: originalUrl, ttl } = body;

        if (!originalUrl) {
          return new Response("URL is required", { status: 400 });
        }

        const shortId = nanoid(8); // short 8-char ID
        const redisClient = getRedisClient(shortId);

        await redisClient.set(shortId, originalUrl, {
          EX: ttl || 3600, // Default TTL of 1 hour
        });

        return Response.json({
          shortUrl: `http://localhost:${PORT}/${shortId}`,
        });
      } catch (err) {
        console.error(err);
        return new Response("Invalid request", { status: 400 });
      }
    }

    // Redirect: GET /:shortId
    if (req.method === "GET" && url.pathname.length > 1) {
      const shortId = url.pathname.slice(1);
      const redisClient = getRedisClient(shortId);
      const originalUrl = await redisClient.get(shortId);

      if (!originalUrl) {
        return new Response("URL not found", { status: 404 });
      }

      return Response.redirect(originalUrl, 302);
    }

    // Fallback: Handle not found
    return new Response("Not found", { status: 404 });
  },
});

console.log(`🚀 Server running on http://localhost:${PORT}`);
