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
// Admin servi par Vite en développement. À restreindre avant toute mise en ligne.
app.enableCors({ origin: true, exposedHeaders: ['x-total-count'] });

const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
console.log(`API Aqua-Suivi sur http://localhost:${port}/api`);
