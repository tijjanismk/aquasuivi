import { useState } from 'react';
import { useDelete, useList, type CrudFilter } from '@refinedev/core';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, Plus, Search } from 'lucide-react';
import type { Champ, Ressource } from '@/description';
import { champsEnListe } from '@/description';
import { libelleLigne } from '@/ressources';
import { messageErreur } from '@/erreurs';
import { formaterDate, formaterMontant, formaterNombre, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/composants/ui/button';
import { Input } from '@/composants/ui/champ';
import { Alerte, Badge, Card } from '@/composants/ui/divers';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/composants/ui/table';

/// L'API renvoie la ligne liée sous le nom de la relation, pas sous celui de
/// la clé étrangère : `especeId` → `espece`, `typeInfrastructureId` → `typeInfrastructure`.
function cleRelation(champ: string) {
  return champ.endsWith('Id') ? champ.slice(0, -2) : champ;
}

function estNumerique(champ: Champ) {
  return champ.type === 'nombre' || champ.type === 'entier' || champ.type === 'monnaie';
}

function cellule(champ: Champ, ligne: Record<string, unknown>) {
  if (champ.type === 'relation') {
    const liee = ligne[cleRelation(champ.nom)] as Record<string, unknown> | undefined;
    const texte = libelleLigne(liee, champ.libelleLie ?? 'nom');
    return texte || <span className="text-muted-foreground">{t('valeur.vide')}</span>;
  }

  const valeur = ligne[champ.nom];
  if (valeur === null || valeur === undefined || valeur === '') {
    return <span className="text-muted-foreground">{t('valeur.vide')}</span>;
  }
  if (champ.type === 'booleen') {
    return (
      <Badge variant={valeur ? 'secondary' : 'muted'}>
        {t(valeur ? 'valeur.oui' : 'valeur.non')}
      </Badge>
    );
  }
  if (champ.type === 'date') return formaterDate(String(valeur));
  if (champ.type === 'enum') {
    const texte = String(valeur);
    return <Badge variant="outline">{texte.charAt(0) + texte.slice(1).toLowerCase().replaceAll('_', ' ')}</Badge>;
  }
  // La devise vient de la configuration, jamais du libellé de colonne.
  if (champ.type === 'monnaie') return formaterMontant(Number(valeur));
  if (estNumerique(champ)) return formaterNombre(Number(valeur));
  return String(valeur);
}

export interface ProprietesTableau {
  ressource: Ressource;
  /// Filtres de portée — typiquement la clé du parent.
  filtres?: Record<string, string>;
  /// Où mène le lien « Ajouter ». Absent = pas de bouton.
  cheminNouveau?: string;
  /// Fabrique le lien d'une ligne : fiche détaillée si elle existe,
  /// formulaire de modification sinon.
  lienLigne: (id: string) => string;
  /// Libellé de l'action principale d'une ligne.
  libelleLien?: string;
  /// Champ de recherche texte. L'API des référentiels l'accepte (`q`) ;
  /// les tables de saisie, filtrées par leur parent, n'en ont pas besoin.
  avecRecherche?: boolean;
  taillePage?: number;
  compact?: boolean;
}

export function TableauRessource({
  ressource,
  filtres = {},
  cheminNouveau,
  lienLigne,
  libelleLien,
  avecRecherche = false,
  taillePage = 25,
  compact = false,
}: ProprietesTableau) {
  const [page, setPage] = useState(1);
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState<{ champ: string; ordre: 'asc' | 'desc' }>({
    champ: ressource.triDefaut,
    ordre: ressource.ordreDefaut ?? 'asc',
  });

  const { mutate: supprimer } = useDelete();

  const filtresRefine: CrudFilter[] = [
    ...Object.entries(filtres)
      .filter(([, v]) => v !== '' && v !== undefined)
      .map(([field, value]) => ({ field, operator: 'eq' as const, value })),
    ...(recherche ? [{ field: 'q', operator: 'eq' as const, value: recherche }] : []),
  ];

  const requete = useList({
    resource: ressource.nom,
    pagination: { current: page, pageSize: taillePage },
    sorters: [{ field: tri.champ, order: tri.ordre }],
    filters: filtresRefine,
  });

  const colonnes = champsEnListe(ressource);
  const lignes = (requete.data?.data ?? []) as Record<string, unknown>[];
  const total = requete.data?.total ?? 0;
  const dernierePage = Math.max(Math.ceil(total / taillePage), 1);

  function basculerTri(champ: string) {
    setTri((actuel) =>
      actuel.champ === champ
        ? { champ, ordre: actuel.ordre === 'asc' ? 'desc' : 'asc' }
        : { champ, ordre: 'asc' },
    );
  }

  return (
    <div data-test="tableau" data-ressource={ressource.chemin}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {avecRecherche && (
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              data-test="recherche"
              className="pl-9"
              placeholder={t('liste.rechercher')}
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                setPage(1);
              }}
            />
          </div>
        )}
        <span className="text-sm text-muted-foreground">
          {requete.isLoading ? t('liste.chargement') : t('liste.lignes', { n: total })}
        </span>
        {cheminNouveau && (
          <Link to={cheminNouveau} className="ml-auto">
            <Button variant={compact ? 'outline' : 'default'} size={compact ? 'sm' : 'default'}>
              <Plus className="size-4" />
              {t('action.ajouter')}
            </Button>
          </Link>
        )}
      </div>

      {requete.isError && (
        <Alerte className="mb-3" data-test="erreur">
          {messageErreur(requete.error) ?? t('erreur.apiInjoignable')}
        </Alerte>
      )}

      {!requete.isLoading && lignes.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('liste.vide')}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {colonnes.map((c) => (
                  <TableHead
                    key={c.nom}
                    data-test="colonne"
                    data-champ={c.nom}
                    onClick={() => basculerTri(c.nom)}
                    className={cn(
                      'cursor-pointer select-none hover:text-foreground',
                      estNumerique(c) && 'text-right',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-start gap-1',
                        estNumerique(c) && 'flex-row-reverse',
                      )}
                    >
                      {c.libelle}
                      {tri.champ === c.nom &&
                        (tri.ordre === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        ))}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.map((ligne) => {
                const id = String(ligne['id']);
                const inactive = ligne['actif'] === false;
                return (
                  <TableRow
                    key={id}
                    data-test="ligne"
                    className={cn(inactive && 'text-muted-foreground')}
                  >
                    {colonnes.map((c) => (
                      <TableCell key={c.nom} className={cn(estNumerique(c) && 'text-right')}>
                        {cellule(c, ligne)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link data-test="lien-modifier" to={lienLigne(id)}>
                          <Button variant="ghost" size="sm">
                            {libelleLien ?? t('action.modifier')}
                          </Button>
                        </Link>
                        {!inactive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            data-test="bouton-desactiver"
                            // Discret au repos : l'action est sur chaque ligne,
                            // en rouge permanent elle sature le tableau.
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              if (confirm(t('liste.confirmerDesactivation'))) {
                                supprimer({ resource: ressource.nom, id });
                              }
                            }}
                          >
                            {t('action.desactiver')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {dernierePage > 1 && (
        <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('action.precedent')}
          </Button>
          <span>{t('liste.page', { page, total: dernierePage })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= dernierePage}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('action.suivant')}
          </Button>
        </div>
      )}
    </div>
  );
}
