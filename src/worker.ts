import app from "./index";
import { importQiitaGeneration } from "./services/generationPublisher";

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: { DB: D1Database; QIITA_API_KEY: string },
  ) {
    const result = await importQiitaGeneration(
      {
        db: env.DB,
        ownerId: crypto.randomUUID(),
        maxChunkRows: 50,
        maxChunkStatements: 80,
      },
      { token: env.QIITA_API_KEY },
    );
    console.log("Qiita sync completed", result);
  },
};
