import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
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

  /// Ration que fixe la pêche de contrôle en cours de saisie (D29) : biomasse
  /// au poids des échantillons du jour, palier conseillé. Un calcul, pas une
  /// écriture — d'où le 200 plutôt que 201.
  @Post('cycles/:id/ration')
  @HttpCode(200)
  ration(@Param('id') id: string, @Utilisateur() u: UtilisateurConnecte, @Body() corps: unknown) {
    const c = (corps ?? {}) as Record<string, unknown>;
    const date = typeof c['dateOperation'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c['dateOperation']) ? c['dateOperation'] : null;
    const lignes = Array.isArray(c['echantillons']) ? (c['echantillons'] as Record<string, unknown>[]) : null;
    const echantillons = lignes
      ?.map((e) => ({
        lotId: typeof e['lotId'] === 'string' && e['lotId'] ? e['lotId'] : null,
        nombre: Number(e['nombre']),
        poidsTotalG: Number(e['poidsTotalG']),
      }))
      .filter((e) => Number.isFinite(e.nombre) && e.nombre > 0 && Number.isFinite(e.poidsTotalG) && e.poidsTotalG > 0);
    if (!date || !echantillons) {
      throw new BadRequestException({ code: 'CHAMPS_INVALIDES', message: 'dateOperation (AAAA-MM-JJ) et echantillons attendus.' });
    }
    const peseeId = typeof c['peseeId'] === 'string' ? c['peseeId'] : undefined;
    return this.service.ration(id, u, { id: peseeId, dateOperation: date, echantillons });
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
