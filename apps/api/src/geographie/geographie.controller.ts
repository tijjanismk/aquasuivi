import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/// Lecture seule : la géographie est une donnée de référence chargée par
/// migration/seed, pas administrée depuis l'admin (D10 ne la couvre pas).
@Controller('geographie')
export class GeographieController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('regions')
  regions() {
    return this.prisma.client.region.findMany({ orderBy: { nom: 'asc' } });
  }

  @Get('cercles')
  cercles(@Query('regionId') regionId?: string) {
    return this.prisma.client.cercle.findMany({
      ...(regionId ? { where: { regionId } } : {}),
      orderBy: { nom: 'asc' },
    });
  }

  @Get('communes')
  communes(@Query('cercleId') cercleId?: string) {
    return this.prisma.client.commune.findMany({
      ...(cercleId ? { where: { cercleId } } : {}),
      orderBy: { nom: 'asc' },
    });
  }
}
