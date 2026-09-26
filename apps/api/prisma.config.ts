import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, env } from "@prisma/config";

// Le .env est à la racine du monorepo, pas à côté de ce fichier.
process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"));

export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
