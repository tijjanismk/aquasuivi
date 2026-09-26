import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { RoleUtilisateur } from '@prisma/client';

export interface UtilisateurConnecte {
  id: string;
  role: RoleUtilisateur;
  regionId: string | null;
}

export interface ContenuJeton {
  sub: string;
  role: RoleUtilisateur;
  regionId: string | null;
}

const PUBLIQUE = 'aqua:publique';
const ROLES = 'aqua:roles';

/// Route ouverte sans jeton. Tout le reste est fermé par défaut : oublier ce
/// décorateur bloque une route, l'oublier dans l'autre sens l'exposerait.
export const Publique = () => SetMetadata(PUBLIQUE, true);

/// Restreint une route à certains rôles, en plus de l'authentification.
export const Roles = (...roles: RoleUtilisateur[]) => SetMetadata(ROLES, roles);

type RequeteAuthentifiee = Request & { utilisateur?: UtilisateurConnecte };

export const Utilisateur = createParamDecorator(
  (_: unknown, contexte: ExecutionContext): UtilisateurConnecte => {
    const u = contexte.switchToHttp().getRequest<RequeteAuthentifiee>().utilisateur;
    if (!u) throw new UnauthorizedException();
    return u;
  },
);

@Injectable()
export class GardeJwt implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const cibles = [contexte.getHandler(), contexte.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIQUE, cibles)) return true;

    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    const [schema, jeton] = (requete.headers.authorization ?? '').split(' ');
    if (schema !== 'Bearer' || !jeton) {
      throw new UnauthorizedException({ code: 'NON_AUTHENTIFIE', message: 'Connexion requise.' });
    }

    let contenu: ContenuJeton;
    try {
      contenu = await this.jwt.verifyAsync<ContenuJeton>(jeton);
    } catch {
      // Code distinct : le client sait qu'il doit rafraîchir, pas reconnecter.
      throw new UnauthorizedException({ code: 'JETON_INVALIDE', message: 'Session expirée.' });
    }
    requete.utilisateur = { id: contenu.sub, role: contenu.role, regionId: contenu.regionId };

    const roles = this.reflector.getAllAndOverride<RoleUtilisateur[] | undefined>(ROLES, cibles);
    if (roles && !roles.includes(contenu.role)) {
      throw new ForbiddenException({ code: 'ROLE_INSUFFISANT', message: 'Action réservée.' });
    }
    return true;
  }
}
