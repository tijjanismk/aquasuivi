import { Controller, Get, Param } from '@nestjs/common';
import { CyclesService } from './cycles.service.js';
import { Utilisateur, type UtilisateurConnecte } from '../auth/garde.js';

@Controller()
export class CyclesController {
  constructor(private readonly service: CyclesService) {}

  @Get('cycles/:id/indicateurs')
  indicateurs(@Param('id') id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.indicateurs(id, u);
  }

  @Get('cycles/:id/alertes')
  alertes(@Param('id') id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.alertes(id, u);
  }

  /// Tableau de bord : les cycles en cours qui demandent un geste (étape 8).
  @Get('alertes')
  alertesEnCours(@Utilisateur() u: UtilisateurConnecte) {
    return this.service.alertesEnCours(u);
  }
}
