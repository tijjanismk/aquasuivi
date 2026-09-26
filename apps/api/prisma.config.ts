import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, env } from "@prisma/config";

// Le .env est à la racine du monorepo, pas à côté de ce fichier.
// Facultatif : en conteneur, DATABASE_URL vient de l'environnement.
try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"));
} catch {
  // pas de .env : variables d'environnement du système
}

export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
