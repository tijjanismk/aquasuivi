import { Controller, Get } from '@nestjs/common';
import { Publique } from './auth/garde.js';
import { PrismaService } from './prisma/prisma.service.js';

@Publique()
@Controller('sante')
export class SanteController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async etat() {
    const [especes, typesInfrastructure, aliments, produitsSanitaires, paliers] =
      await Promise.all([
        this.prisma.client.espece.count(),
        this.prisma.client.typeInfrastructure.count(),
        this.prisma.client.aliment.count(),
        this.prisma.client.produitSanitaire.count(),
        this.prisma.client.palierRationnement.count(),
      ]);
    return {
      base: 'ok',
      referentiels: { especes, typesInfrastructure, aliments, produitsSanitaires, paliers },
    };
  }
}
