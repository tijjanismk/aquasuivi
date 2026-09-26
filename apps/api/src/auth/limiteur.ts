import { HttpException, HttpStatus } from '@nestjs/common';

/// Limite de tentatives en mémoire, par clé (adresse IP, identifiant…).
///
/// Suffisant pour une seule instance d'API, ce qui est le déploiement prévu
/// (docker-compose). Plusieurs instances derrière un répartiteur devraient
/// partager ce compteur — dans PostgreSQL ou Redis.
export class Limiteur {
  private readonly essais = new Map<string, number[]>();

  constructor(
    private readonly maximum: number,
    private readonly fenetreMs: number,
    private readonly message: string,
  ) {}

  /// Refuse si la clé a déjà atteint le maximum dans la fenêtre.
  verifier(cle: string) {
    const recents = this.recents(cle);
    if (recents.length >= this.maximum) {
      const attente = Math.ceil((recents[0]! + this.fenetreMs - Date.now()) / 60000);
      throw new HttpException(
        { code: 'TROP_DE_TENTATIVES', message: `${this.message} Réessayez dans ${attente} min.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  noter(cle: string) {
    const recents = this.recents(cle);
    recents.push(Date.now());
    this.essais.set(cle, recents);
    // Ménage paresseux : la table ne grossit pas indéfiniment.
    if (this.essais.size > 10_000) {
      for (const [k] of this.essais) if (this.recents(k).length === 0) this.essais.delete(k);
    }
  }

  oublier(cle: string) {
    this.essais.delete(cle);
  }

  private recents(cle: string) {
    const limite = Date.now() - this.fenetreMs;
    return (this.essais.get(cle) ?? []).filter((t) => t > limite);
  }
}

const entier = (nom: string, defaut: number) => {
  const n = Number.parseInt(process.env[nom] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : defaut;
};

/// Lus à la première utilisation, après le chargement du .env par main.ts.
let limiteurs: { connexion: Limiteur; inscription: Limiteur } | undefined;

export function lesLimiteurs() {
  limiteurs ??= {
    // Échecs de connexion par couple adresse × identifiant : freine la force
    // brute sans verrouiller le compte pour tout le monde.
    connexion: new Limiteur(
      entier('AQUA_LIMITE_CONNEXIONS', 10),
      15 * 60_000,
      'Trop de tentatives de connexion.',
    ),
    // Inscriptions par adresse : freine la création de comptes en masse. Un
    // village entier peut partager une adresse (routeur 4G), d'où une marge.
    inscription: new Limiteur(
      entier('AQUA_LIMITE_INSCRIPTIONS', 30),
      60 * 60_000,
      'Trop d’inscriptions depuis ce réseau.',
    ),
  };
  return limiteurs;
}
