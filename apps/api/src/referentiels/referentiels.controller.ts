import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  estRessource,
  ReferentielsService,
  type SegmentRessource,
} from './referentiels.service.js';
import { Roles } from '../auth/garde.js';

function segment(valeur: string): SegmentRessource {
  if (!estRessource(valeur)) throw new BadRequestException(`Référentiel inconnu : ${valeur}`);
  return valeur;
}

function entier(valeur: string | undefined, defaut: number): number {
  const n = Number.parseInt(valeur ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : defaut;
}

/// Lecture pour tout compte connecté : la PWA en a besoin hors ligne. Écriture
/// réservée à l'administrateur — un référentiel faux fausse toutes les fermes.
@Controller('referentiels')
export class ReferentielsController {
  constructor(private readonly service: ReferentielsService) {}

  @Get(':ressource')
  async lister(
    @Param('ressource') ressource: string,
    @Query('_start') debut: string,
    @Query('_end') fin: string,
    @Query('_sort') tri: string,
    @Query('_order') ordre: string,
    @Query('q') recherche: string,
    @Query('inactifs') inactifs: string,
    @Res({ passthrough: true }) reponse: Response,
  ) {
    const resultat = await this.service.lister(segment(ressource), {
      debut: entier(debut, 0),
      fin: entier(fin, 25),
      ...(tri ? { tri } : {}),
      ordre: ordre?.toLowerCase() === 'desc' ? 'desc' : 'asc',
      ...(recherche ? { recherche } : {}),
      inclureInactifs: inactifs === 'true',
    });
    // Refine lit le total dans cet en-tête pour paginer.
    reponse.setHeader('x-total-count', String(resultat.total));
    reponse.setHeader('access-control-expose-headers', 'x-total-count');
    return resultat.lignes;
  }

  @Get(':ressource/:id')
  lire(@Param('ressource') ressource: string, @Param('id') id: string) {
    return this.service.lire(segment(ressource), id);
  }

  @Roles('ADMIN')
  @Post(':ressource')
  creer(@Param('ressource') ressource: string, @Body() corps: unknown) {
    return this.service.creer(segment(ressource), corps);
  }

  @Roles('ADMIN')
  @Patch(':ressource/:id')
  modifier(
    @Param('ressource') ressource: string,
    @Param('id') id: string,
    @Body() corps: unknown,
  ) {
    return this.service.modifier(segment(ressource), id, corps);
  }

  @Roles('ADMIN')
  @Delete(':ressource/:id')
  desactiver(@Param('ressource') ressource: string, @Param('id') id: string) {
    return this.service.desactiver(segment(ressource), id);
  }
}
