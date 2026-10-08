import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/// Contraintes SQL écrites à la main (migration contraintes_metier). Sans
/// cette table, une règle métier rejetée par la base remonterait en 500.
///
/// Chaque entrée porte un `code` **stable** en plus du message : l'application
/// doit être bilingue, et une interface anglaise doit pouvoir traduire sans
/// analyser une phrase française.
const CONTRAINTES: Record<string, { code: string; message: string }> = {
  cycles_un_seul_ouvert_par_infrastructure: {
    code: 'CYCLE_DEJA_OUVERT',
    message:
      "Cette infrastructure a déjà un cycle ouvert. Clôturez-le avant d'en ouvrir un autre.",
  },
  echantillon_nombre_positif: {
    code: 'ECHANTILLON_NOMBRE_INVALIDE',
    message: 'Un échantillon doit porter sur au moins un poisson.',
  },
  pesee_taux_plausible: {
    code: 'PESEE_TAUX_HORS_BORNES',
    message: 'Le taux de rationnement doit être compris entre 0 et 10 %.',
  },
  palier_taux_plausible: {
    code: 'PALIER_TAUX_HORS_BORNES',
    message: 'Le taux du palier doit être compris entre 0 et 30 %.',
  },
  mortalite_valeurs_positives: {
    code: 'VALEUR_NEGATIVE',
    message: 'Le nombre de morts et le remplacement ne peuvent pas être négatifs.',
  },
  distribution_ration_ou_quantite: {
    code: 'CHAMP_REQUIS',
    message: 'Indiquez la ration journalière ou la quantité distribuée.',
  },
  cycle_cloture_apres_charge: {
    code: 'CYCLE_CLOTURE_AVANT_CHARGE',
    message: 'La date de clôture ne peut pas précéder la date de mise en charge.',
  },
};

/// Le nom de la contrainte se trouve tantôt dans le message, tantôt dans
/// l'erreur du pilote — on cherche dans les deux.
function contrainteViolee(erreur: Prisma.PrismaClientKnownRequestError) {
  const texte = `${erreur.message} ${JSON.stringify(erreur.meta ?? {})}`;
  const nom = Object.keys(CONTRAINTES).find((c) => texte.includes(c));
  return nom ? CONTRAINTES[nom] : undefined;
}

/// Avec les adaptateurs Prisma 7, `meta.target` est vide et le message brut
/// aussi : le nom de la contrainte n'arrive que par l'erreur du pilote, sous
/// la forme d'un nom d'index PostgreSQL (`Aliment_nom_key`).
function champsUniques(erreur: Prisma.PrismaClientKnownRequestError): string {
  const cible = erreur.meta?.['target'];
  if (Array.isArray(cible) && cible.length > 0) return cible.join(', ');
  if (typeof cible === 'string' && cible) return cible;

  const cause = (
    erreur.meta?.['driverAdapterError'] as
      | { cause?: { constraint?: { fields?: string[]; index?: string }; table?: string } }
      | undefined
  )?.cause;
  if (cause?.constraint?.fields?.length) return cause.constraint.fields.join(', ');

  const index = cause?.constraint?.index;
  if (index) {
    const sansTable = cause.table && index.startsWith(`${cause.table}_`)
      ? index.slice(cause.table.length + 1)
      : index;
    return sansTable.replace(/_(key|pkey|idx)$/, '').replaceAll('_', ', ');
  }
  return 'un champ unique';
}

export interface ErreurTraduite {
  statut: number;
  code: string;
  message: string;
  champs?: string;
}

const journal = new Logger('PrismaExceptionFilter');

/// Traduction d'une erreur Prisma en refus lisible, à code stable. Partagée
/// entre le filtre HTTP et la synchronisation, qui refuse ligne par ligne au
/// lieu d'échouer en bloc.
export function traduireErreurPrisma(exception: unknown): ErreurTraduite | null {
  if (exception instanceof Prisma.PrismaClientValidationError) {
    // Le détail de Prisma est verbeux et expose le schéma : on le garde
    // côté serveur, sans quoi un refus de ce genre est indiagnosticable.
    journal.warn(exception.message.replace(/\s+/g, ' ').slice(0, 500));
    return {
      statut: HttpStatus.BAD_REQUEST,
      code: 'CHAMPS_INVALIDES',
      message: 'Champs invalides ou inconnus pour cette ressource.',
    };
  }
  if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) return null;

  const metier = contrainteViolee(exception);
  if (metier) return { statut: HttpStatus.UNPROCESSABLE_ENTITY, ...metier };

  switch (exception.code) {
    case 'P2002': {
      const champs = champsUniques(exception);
      return {
        statut: HttpStatus.CONFLICT,
        code: 'VALEUR_DEJA_UTILISEE',
        message: `Valeur déjà utilisée pour : ${champs}.`,
        champs,
      };
    }
    case 'P2003':
      return {
        statut: HttpStatus.CONFLICT,
        code: 'LIGNE_REFERENCEE',
        message: 'Cette ligne est référencée ailleurs et ne peut pas être modifiée ainsi.',
      };
    case 'P2025':
      return { statut: HttpStatus.NOT_FOUND, code: 'LIGNE_INTROUVABLE', message: 'Ligne introuvable.' };
    default:
      journal.error(
        `Prisma ${exception.code}: ${exception.message} ${JSON.stringify(exception.meta ?? {})}`,
      );
      return {
        statut: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'ERREUR_BASE',
        message: 'Erreur de base de données.',
      };
  }
}

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const e = traduireErreurPrisma(exception)!;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(e.statut)
      .json({ statusCode: e.statut, code: e.code, message: e.message, ...(e.champs ? { champs: e.champs } : {}) });
  }
}
