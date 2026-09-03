import { pool } from "@workspace/db";
import { runSchemaMigrations } from "@workspace/db/migrate";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  // Upgrade older databases in place before serving. Routes depend on the
  // current schema (e.g. project_assets.confirmed) and `db push` is dev-only,
  // so a deployed database provisioned at an earlier revision is brought up to
  // date here — and a failure aborts startup instead of serving broken routes.
  const { ensured } = await runSchemaMigrations(pool);
  logger.info({ migrations: ensured }, "Database schema migrations ensured");

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
