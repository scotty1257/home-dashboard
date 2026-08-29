import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const { app } = buildApp(config);

async function start(): Promise<void> {
  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`Home dashboard API listening on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
