import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { SimulationsService } from './simulations.service.js';
import { Utilisateur, type UtilisateurConnecte } from '../auth/garde.js';

@Controller('simulations')
export class SimulationsController {
  constructor(private readonly service: SimulationsService) {}

  /// Calcul seul, sans rien enregistrer : on essaie des hypothèses.
  @Post('calculer')
  @HttpCode(200)
  calculer(@Body() corps: unknown) {
    return this.service.calculer(corps);
  }

  @Post()
  enregistrer(@Body() corps: unknown, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.enregistrer(corps, u);
  }

  @Get()
  lister(@Utilisateur() u: UtilisateurConnecte) {
    return this.service.lister(u);
  }

  @Get(':id')
  lire(@Param('id') id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.lire(id, u);
  }

  @Delete(':id')
  supprimer(@Param('id') id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.supprimer(id, u);
  }
}
