import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/garde.js';
import { AdministrationService, type Pagination } from './administration.service.js';

function entier(valeur: string | undefined, defaut: number): number {
  const n = Number.parseInt(valeur ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : defaut;
}

/// Mêmes conventions de liste que le reste de l'API (Refine simple-rest).
function pagination(q: Record<string, string>): Pagination {
  return {
    debut: entier(q['_start'], 0),
    fin: entier(q['_end'], 25),
    ...(q['_sort'] ? { tri: q['_sort'] } : {}),
    ordre: q['_order']?.toLowerCase() === 'desc' ? 'desc' : 'asc',
  };
}

function total(reponse: Response, n: number) {
  reponse.setHeader('x-total-count', String(n));
  reponse.setHeader('access-control-expose-headers', 'x-total-count');
}

@Roles('ADMIN')
@Controller('admin')
export class AdministrationController {
  constructor(private readonly service: AdministrationService) {}

  // --- Utilisateurs ---
  @Get('utilisateurs')
  async utilisateurs(@Query() q: Record<string, string>, @Res({ passthrough: true }) r: Response) {
    const { lignes, total: n } = await this.service.listerUtilisateurs(pagination(q), {
      ...(q['q'] ? { q: q['q'] } : {}),
      ...(q['role'] ? { role: q['role'] } : {}),
      ...(q['actif'] ? { actif: q['actif'] } : {}),
    });
    total(r, n);
    return lignes;
  }

  @Get('utilisateurs/:id')
  utilisateur(@Param('id') id: string) {
    return this.service.lireUtilisateur(id);
  }

  @Post('utilisateurs')
  creerUtilisateur(@Body() corps: unknown) {
    return this.service.creerUtilisateur(corps);
  }

  @Patch('utilisateurs/:id')
  modifierUtilisateur(@Param('id') id: string, @Body() corps: unknown) {
    return this.service.modifierUtilisateur(id, corps);
  }

  @Delete('utilisateurs/:id')
  desactiverUtilisateur(@Param('id') id: string) {
    return this.service.desactiverUtilisateur(id);
  }

  // --- Affectations ---
  @Get('acces')
  async acces(@Query() q: Record<string, string>, @Res({ passthrough: true }) r: Response) {
    const { lignes, total: n } = await this.service.listerAcces(pagination(q), {
      ...(q['userId'] ? { userId: q['userId'] } : {}),
      ...(q['fermeId'] ? { fermeId: q['fermeId'] } : {}),
      ...(q['niveau'] ? { niveau: q['niveau'] } : {}),
    });
    total(r, n);
    return lignes;
  }

  @Get('acces/:id')
  unAcces(@Param('id') id: string) {
    return this.service.lireAcces(id);
  }

  @Post('acces')
  creerAcces(@Body() corps: unknown) {
    return this.service.creerAcces(corps);
  }

  @Patch('acces/:id')
  modifierAcces(@Param('id') id: string, @Body() corps: unknown) {
    return this.service.modifierAcces(id, corps);
  }

  @Delete('acces/:id')
  supprimerAcces(@Param('id') id: string) {
    return this.service.supprimerAcces(id);
  }

  // --- Conflits ---
  @Get('conflits')
  async conflits(@Query() q: Record<string, string>, @Res({ passthrough: true }) r: Response) {
    const { lignes, total: n } = await this.service.listerConflits(pagination(q), {
      ...(q['resolu'] ? { resolu: q['resolu'] } : {}),
      ...(q['tableCible'] ? { tableCible: q['tableCible'] } : {}),
    });
    total(r, n);
    return lignes;
  }

  @Patch('conflits/:id')
  marquerConflit(@Param('id') id: string, @Body() corps: unknown) {
    return this.service.marquerConflit(id, corps);
  }
}
