import { Controller, Get, Param } from '@nestjs/common';
import { CyclesService } from './cycles.service.js';
import { Utilisateur, type UtilisateurConnecte } from '../auth/garde.js';

@Controller('cycles')
export class CyclesController {
  constructor(private readonly service: CyclesService) {}

  @Get(':id/indicateurs')
  indicateurs(@Param('id') id: string, @Utilisateur() u: UtilisateurConnecte) {
    return this.service.indicateurs(id, u);
  }
}
