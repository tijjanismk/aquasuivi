import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Publique, Utilisateur, type UtilisateurConnecte } from './garde.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Publique()
  @Post('inscription')
  inscrire(@Body() corps: unknown, @Ip() ip: string) {
    return this.service.inscrire(corps, ip);
  }

  @Publique()
  @HttpCode(200)
  @Post('connexion')
  connecter(@Body() corps: unknown, @Ip() ip: string) {
    return this.service.connecter(corps, ip);
  }

  /// Publique : c'est précisément quand le jeton d'accès a expiré qu'on l'appelle.
  @Publique()
  @HttpCode(200)
  @Post('rafraichir')
  rafraichir(@Body() corps: unknown) {
    return this.service.rafraichir(corps);
  }

  @Publique()
  @HttpCode(200)
  @Post('deconnexion')
  deconnecter(@Body() corps: unknown) {
    return this.service.deconnecter(corps);
  }

  @Get('moi')
  moi(@Utilisateur() u: UtilisateurConnecte) {
    return this.service.moi(u.id);
  }
}
