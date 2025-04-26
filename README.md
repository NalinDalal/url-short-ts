# url-short-ts

To install dependencies:

```bash
bun install
bun add redis dotenv nanoid
```

update `.env.local` to `.env`

To run:

```bash
bun run index.ts
#or
bun start
```

This project was created using `bun init` in bun v1.2.10. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

upon runnig this, hit the -> `http://localhost:3000/shorten` endpoint on
postman, upon hitting it, give the body as:
```json
{
  "url": "https://youtube.com",
  "ttl": 3600
}
```

reverts back the required short url
