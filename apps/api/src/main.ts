import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { FrontiereInterceptor } from './common/frontiere.interceptor.js';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';

// Le .env est à la racine du monorepo. PrismaService ne lit DATABASE_URL
// qu'à l'instanciation, donc ce chargement précède bien son usage.
process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'));

const app = await NestFactory.create<NestExpressApplication>(AppModule);
// 100 ko par défaut : un push de retour de terrain (jusqu'à 1 000 changements) dépasse.
app.useBodyParser('json', { limit: '5mb' });
app.setGlobalPrefix('api');
app.useGlobalInterceptors(new FrontiereInterceptor());
app.useGlobalFilters(new PrismaExceptionFilter());
// Origines autorisées (admin, PWA), séparées par des virgules. Sans valeur,
// tout est accepté : c'est le mode développement, où Vite change de port.
const origines = (process.env['AQUA_ORIGINES'] ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.enableCors({ origin: origines.length > 0 ? origines : true, exposedHeaders: ['x-total-count'] });
// Derrière le proxy HTTPS (Caddy), l'adresse du client arrive dans
// X-Forwarded-For : sans cela, tout le monde aurait l'adresse du proxy et
// la limite de tentatives bloquerait le pays entier d'un coup.
if (process.env['AQUA_DERRIERE_PROXY'] === '1') app.set('trust proxy', 1);

const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
console.log(`API Aqua-Suivi sur http://localhost:${port}/api`);
