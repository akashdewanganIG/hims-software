/**
 * drizzle-kit configuration: `npm run db:generate` writes migrations from
 * lib/server/db/schema.ts into ./drizzle, `npm run db:studio` browses the
 * data. Migrations are applied by `npm run db:migrate` (scripts/db/migrate.ts).
 */
import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env");
} catch {
  // Environment supplied by the shell or CI.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Migrations and Studio need a direct (non-pooled) connection on Neon.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
  strict: true,
  verbose: true,
});
