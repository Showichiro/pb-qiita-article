# PB-QIITA-APP

## Technology Stack
This project uses the following technologies:

| Category              | Name                       | URL                                              |
|-----------------------|----------------------------|--------------------------------------------------|
| Framework/libraries   | Hono                       | [Hono](https://honojs.dev/)                      |
|                       | Zod                        | [Zod](https://zod.dev/)                          |
|                       | Drizzle-ORM                | [Drizzle-ORM](https://orm.drizzle.team/)         |
|                       | tailwindcss                | [tailwindcss](https://tailwindcss.com/)          |
|                       | daisy UI                   | [daisy UI](https://daisyui.com/)                 |
|                       | Vite                       | [Vite](https://vitejs.dev/)                      |
|                       | Vitest                     | [Vitest](https://vitest.dev/)                    |
|                       | Biome                      | [Biome](https://biome.dev/)                      |
| Database              | Cloudflare D1 Database     | [Cloudflare D1 Database](https://developers.cloudflare.com/d1/) |
| Hosting               | Cloudflare Pages           | [Cloudflare Pages](https://pages.cloudflare.com/)|
|                       | Cloudflare Workers         | [Cloudflare Workers](https://workers.cloudflare.com/)           |

## Development

### Environment Setup

#### Required Tools
- [Bun](https://bun.sh/)

#### Bun Installation
Please refer to the official documentation for instructions on installing Bun.
- [Official BunJS Site](https://bun.sh/docs/installation)

#### Installation Steps
1. Install BunJS. Refer to the official documentation above for installation methods.
2. Navigate to the project's root directory.
3. Install dependencies.

```shell
bun install
```

4. DB setup

```shell
bun run schema:apply
```

5. Insert data into DB.

```shell
for sql in ../../data/**/*.sql; do bun wrangler d1 execute pb-qiita-articles --local --file $sql; done
```

### dev server
 Start the development server.
```shell
bun run dev
```

### test
Run tests.
```shell
bun run test
```

### lint

Lint and format code.
```shell
bun run lint
```

### format

Format code.

```shell
bun run format
```

## production

[Production Link](https://pb-qiita-articles.pages.dev)
