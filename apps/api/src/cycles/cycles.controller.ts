import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
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

  /// Production et résultats par région, cercle ou commune, sur les fermes
  /// que l'utilisateur peut lire.
  @Get('consolidation')
  consolidation(
    @Utilisateur() u: UtilisateurConnecte,
    @Query('niveau') niveau = 'region',
    @Query('depuis') depuis?: string,
    @Query('jusqua') jusqua?: string,
  ) {
    if (!['region', 'cercle', 'commune'].includes(niveau)) {
      throw new BadRequestException({ code: 'CHAMPS_INVALIDES', message: 'niveau : region, cercle ou commune.' });
    }
    const date = /^\d{4}-\d{2}-\d{2}$/;
    if ((depuis && !date.test(depuis)) || (jusqua && !date.test(jusqua))) {
      throw new BadRequestException({ code: 'CHAMPS_INVALIDES', message: 'Dates au format AAAA-MM-JJ.' });
    }
    return this.service.consolidation(u, niveau as 'region' | 'cercle' | 'commune', depuis, jusqua);
  }

  /// Tableau de bord : les cycles en cours qui demandent un geste (étape 8).
  @Get('alertes')
  alertesEnCours(@Utilisateur() u: UtilisateurConnecte) {
    return this.service.alertesEnCours(u);
  }
}
