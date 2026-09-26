import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { versSortie } from './domaine.js';

/// Frontière de sortie du domaine : `Decimal` en nombre, dates de terrain en
/// « AAAA-MM-JJ ». Voir `domaine.ts` pour le pourquoi de chacune.
@Injectable()
export class FrontiereInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((valeur) => versSortie(valeur)));
  }
}
