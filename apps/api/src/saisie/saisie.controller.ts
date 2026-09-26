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
import { SaisieService } from './saisie.service.js';
import { Utilisateur, type UtilisateurConnecte } from '../auth/garde.js';
import { estRessourceSaisie, RESSOURCES, type SegmentSaisie } from './saisie.config.js';

const PARAMETRES_RESERVES = new Set(['_start', '_end', '_sort', '_order']);

function segment(valeur: string): SegmentSaisie {
  if (!estRessourceSaisie(valeur)) {
    throw new BadRequestException(`Ressource inconnue : ${valeur}`);
  }
  return valeur;
}

function entier(valeur: string | undefined, defaut: number): number {
  const n = Number.parseInt(valeur ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : defaut;
}

@Controller('saisie')
export class SaisieController {
  constructor(private readonly service: SaisieService) {}

  @Get(':ressource')
  async lister(
    @Param('ressource') ressource: string,
    @Query() requete: Record<string, string>,
    @Res({ passthrough: true }) reponse: Response,
    @Utilisateur() u: UtilisateurConnecte,
  ) {
    const cible = segment(ressource);
    const filtres = Object.fromEntries(
      Object.entries(requete).filter(([cle]) => !PARAMETRES_RESERVES.has(cle)),
    );
    const resultat = await this.service.lister(cible, {
      debut: entier(requete['_start'], 0),
      fin: entier(requete['_end'], 25),
      ...(requete['_sort'] ? { tri: requete['_sort'] } : {}),
      ordre: requete['_order']?.toLowerCase() === 'desc' ? 'desc' : 'asc',
      filtres,
    }, u);
    reponse.setHeader('x-total-count', String(resultat.total));
    reponse.setHeader('access-control-expose-headers', 'x-total-count');
    return resultat.lignes;
  }

  @Get(':ressource/:id')
  lire(
    @Param('ressource') ressource: string,
    @Param('id') id: string,
    @Utilisateur() u: UtilisateurConnecte,
  ) {
    return this.service.lire(segment(ressource), id, u);
  }

  /// L'identifiant peut venir du client : deux téléphones hors réseau doivent
  /// pouvoir créer des lignes sans collision (D3). À défaut, la base en pose un.
  @Post(':ressource')
  creer(
    @Param('ressource') ressource: string,
    @Body() corps: Record<string, unknown>,
    @Utilisateur() u: UtilisateurConnecte,
  ) {
    return this.service.creer(segment(ressource), corps, u);
  }

  @Patch(':ressource/:id')
  modifier(
    @Param('ressource') ressource: string,
    @Param('id') id: string,
    @Body() corps: Record<string, unknown>,
    @Utilisateur() u: UtilisateurConnecte,
  ) {
    return this.service.modifier(segment(ressource), id, corps, u);
  }

  @Delete(':ressource/:id')
  supprimer(
    @Param('ressource') ressource: string,
    @Param('id') id: string,
    @Utilisateur() u: UtilisateurConnecte,
  ) {
    return this.service.supprimer(segment(ressource), id, u);
  }
}

export const RESSOURCES_SAISIE = Object.keys(RESSOURCES);
