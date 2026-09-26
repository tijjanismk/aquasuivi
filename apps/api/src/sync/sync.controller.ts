import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { SyncService } from './sync.service.js';
import { Utilisateur, type UtilisateurConnecte } from '../auth/garde.js';

/// Synchronisation de la PWA (étape 5). Le client pousse d'abord son journal
/// local, puis tire : il reçoit ainsi la version arbitrée de ses propres lignes.
@Controller('sync')
export class SyncController {
  constructor(private readonly service: SyncService) {}

  @Get('pull')
  pull(
    @Utilisateur() u: UtilisateurConnecte,
    @Query('depuis') depuis?: string,
    @Query('appareilId') appareilId?: string,
  ) {
    return this.service.pull(u, depuis, appareilId);
  }

  @Post('push')
  @HttpCode(200)
  push(@Utilisateur() u: UtilisateurConnecte, @Body() corps: unknown) {
    return this.service.push(u, corps);
  }
}
