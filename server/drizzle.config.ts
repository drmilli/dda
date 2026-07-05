import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Migrations run against the DIRECT (unpooled) connection.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
