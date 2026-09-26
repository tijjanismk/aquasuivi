import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/// Tables de saisie : soft delete par `deletedAt` (D12). Les référentiels
/// portent `actif` à la place et n'entrent pas dans cette liste.
const TABLES_SOFT_DELETE = new Set([
  'Ferme',
  'Infrastructure',
  'Cycle',
  'Lot',
  'Pesee',
  'Echantillon',
  'Mortalite',
  'Distribution',
  'Traitement',
  'Recolte',
  'Depense',
  'MesureEau',
]);

const LECTURES = new Set(['findFirst', 'findMany', 'findUnique', 'count', 'aggregate', 'groupBy']);

function creerClient(pool: Pool) {
  return new PrismaClient({ adapter: new PrismaPg(pool) }).$extends({
    query: {
      $allModels: {
        // Oublier ce filtre une seule fois fait réapparaître des lignes
        // supprimées dans les indicateurs — d'où l'extension plutôt que
        // la répétition à la main (D12).
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TABLES_SOFT_DELETE.has(model) || !LECTURES.has(operation)) {
            return query(args);
          }
          const a = args as { where?: Record<string, unknown> };
          return query({
            ...a,
            where: { deletedAt: null, ...a.where },
          });
        },
      },
    },
  });
}

type ClientEtendu = ReturnType<typeof creerClient>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });
  readonly client: ClientEtendu = creerClient(this.pool);

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
    await this.pool.end();
  }
}
