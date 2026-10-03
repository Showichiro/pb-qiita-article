import app from "./index";
import { syncArticles } from "./services/qiita/syncArticles";

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: { DB: D1Database; QIITA_API_KEY: string },
  ) {
    const result = await syncArticles(env.DB, env.QIITA_API_KEY);
    console.log("Qiita sync completed", result);
  },
};
