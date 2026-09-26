import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReferentielsController } from './referentiels/referentiels.controller.js';
import { ReferentielsService } from './referentiels/referentiels.service.js';
import { GeographieController } from './geographie/geographie.controller.js';
import { SaisieController } from './saisie/saisie.controller.js';
import { SaisieService } from './saisie/saisie.service.js';
import { ControlesService } from './saisie/controles.service.js';
import { SyncController } from './sync/sync.controller.js';
import { SyncService } from './sync/sync.service.js';
import { CyclesController } from './cycles/cycles.controller.js';
import { CyclesService } from './cycles/cycles.service.js';
import { SanteController } from './sante.controller.js';
import { ConfigController } from './config.controller.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { GardeJwt } from './auth/garde.js';

/// Lu au démarrage, pas à l'import : le .env est chargé par main.ts après
/// l'évaluation des modules. Un secret absent ou d'exemple arrête l'API
/// plutôt que de signer des jetons que n'importe qui pourrait forger.
function secretJwt(): string {
  const secret = process.env['JWT_SECRET'] ?? '';
  if (secret.length < 32 || secret === 'a-remplacer') {
    throw new Error('JWT_SECRET absent ou trop court (32 caractères minimum). Voir .env.example.');
  }
  return secret;
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({ useFactory: () => ({ secret: secretJwt() }) }),
  ],
  controllers: [
    AuthController,
    SanteController,
    ConfigController,
    ReferentielsController,
    GeographieController,
    SaisieController,
    CyclesController,
    SyncController,
  ],
  providers: [
    AuthService,
    ReferentielsService,
    SaisieService,
    ControlesService,
    SyncService,
    CyclesService,
    // Tout est fermé par défaut ; `@Publique()` ouvre une route (D18).
    { provide: APP_GUARD, useClass: GardeJwt },
  ],
})
export class AppModule {}
