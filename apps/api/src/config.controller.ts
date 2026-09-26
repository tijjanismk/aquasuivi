import { Controller, Get } from '@nestjs/common';
import { Publique } from './auth/garde.js';

/// Langue et devise actives, servies au client plutôt que codées en dur chez
/// lui. L'application doit devenir bilingue et multidevise ; on livre le
/// français et le franc CFA d'abord, mais le point de vérité existe déjà.
///
/// Attention : la **devise de stockage** n'est pas tranchée. Les montants sont
/// aujourd'hui enregistrés sans devise, donc implicitement en XOF. Voir la
/// décision en attente dans AI_CONTEXT/DECISIONS.md avant d'en ajouter une
/// seconde — ce n'est pas qu'une affaire de formatage.
@Publique()
@Controller('config')
export class ConfigController {
  @Get()
  config() {
    return {
      langue: process.env['AQUA_LANGUE'] ?? 'fr',
      languesDisponibles: ['fr'],
      devise: process.env['AQUA_DEVISE'] ?? 'XOF',
      devisesDisponibles: ['XOF'],
    };
  }
}
