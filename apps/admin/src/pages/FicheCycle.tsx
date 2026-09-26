import { useEffect, useState } from 'react';
import { useOne } from '@refinedev/core';
import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { appelApi } from '@/session';
import { CYCLES, SECTIONS_CYCLE } from '@/saisie';
import { formaterDate, formaterMontant, formaterNombre, t } from '@/i18n';
import { Alerte, Badge, Card } from '@/composants/ui/divers';
import { Button } from '@/composants/ui/button';
import { TableauRessource } from '@/composants/TableauRessource';
import { ListeAlertes } from '@/composants/Alertes';
import type { Alerte as AlerteCycle } from '@aqua/shared';

interface Indicateurs {
  cycle: { dureeJours: number | null };
  zootechnie: {
    effectifFinal: number;
    tauxSurviePct: number;
    poidsMoyenFinalG: number;
    gainMoyenQuotidienGJ: number | null;
    performance: number | null;
    coefficientVariationPct: number | null;
  };
  alimentation: {
    indiceConsommation: number | null;
    alimentDistribueKg: number;
    coutAlimentParKg: number | null;
  };
  production: {
    productionRecolteeKg: number;
    densiteInitiale: number | null;
    chargeFinale: number | null;
    uniteMesure: string;
  };
  economie: {
    charges: { total: number };
    produits: { total: number };
    prixRevientKg: number | null;
    prixVenteMoyenKg: number | null;
    resultat: number;
    rentabilitePct: number | null;
  };
  conformite: { recoltesNonConformes: number };
}

function Chiffre({
  libelle,
  valeur,
  unite,
}: {
  libelle: string;
  valeur: string | null;
  unite?: string;
}) {
  return (
    <div>
      <div className="tabulaire text-xl font-semibold">
        {valeur ?? t('valeur.vide')}
        {valeur && unite ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unite}</span> : null}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{libelle}</div>
    </div>
  );
}

const nb = (v: number | null | undefined, decimales = 2) =>
  v === null || v === undefined ? null : formaterNombre(Number(v.toFixed(decimales)));

export function FicheCycle() {
  const { id = '' } = useParams();
  const [indicateurs, setIndicateurs] = useState<Indicateurs | null>(null);
  const [erreurIndicateurs, setErreurIndicateurs] = useState<string | null>(null);
  const [alertes, setAlertes] = useState<AlerteCycle[]>([]);

  const cycle = useOne({ resource: CYCLES.nom, id });
  const ligne = cycle.result as Record<string, unknown> | undefined;

  useEffect(() => {
    if (!id) return;
    // Les indicateurs ne passent pas par Refine : c'est un calcul, pas une
    // ressource REST, et il n'a ni liste ni pagination.
    appelApi(`/cycles/${id}/indicateurs`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? String(r.status));
        return r.json();
      })
      .then(setIndicateurs)
      .catch((e: Error) => setErreurIndicateurs(e.message));
    appelApi(`/cycles/${id}/alertes`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setAlertes)
      .catch(() => setAlertes([]));
  }, [id]);

  const infrastructure = ligne?.['infrastructure'] as
    | { nom?: string; fermeId?: string }
    | undefined;
  const espece = ligne?.['espece'] as { nom?: string } | undefined;
  const statut = String(ligne?.['statut'] ?? '');
  const retour = infrastructure?.fermeId
    ? `/infrastructures/${String(ligne?.['infrastructureId'])}`
    : '/fermes';

  return (
    <>
      <Link
        to={retour}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {infrastructure?.nom ?? t('action.retour')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          Cycle n° {String(ligne?.['numero'] ?? '')}
        </h2>
        {statut && <Badge variant="outline">{statut.replaceAll('_', ' ').toLowerCase()}</Badge>}
        {espece?.nom && <Badge variant="muted">{espece.nom}</Badge>}
        <span className="text-sm text-muted-foreground">
          {ligne?.['dateMiseEnCharge']
            ? formaterDate(String(ligne['dateMiseEnCharge']))
            : ''}
          {ligne?.['dateCloture'] ? ` → ${formaterDate(String(ligne['dateCloture']))}` : ''}
        </span>
        <Link to={`/saisie/cycles/${id}?retour=${encodeURIComponent(`/cycles/${id}`)}`} className="ml-auto">
          <Button variant="outline" size="sm">
            {t('action.modifier')}
          </Button>
        </Link>
      </div>

      {alertes.length > 0 && (
        <section className="mb-6" data-test="alertes">
          <ListeAlertes alertes={alertes} />
        </section>
      )}

      <section className="mb-8" data-test="indicateurs">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('cycle.indicateurs')}
        </h3>

        {erreurIndicateurs && <Alerte>{erreurIndicateurs}</Alerte>}

        {!erreurIndicateurs && !indicateurs && (
          <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('liste.chargement')}
          </Card>
        )}

        {indicateurs && (
          <>
            {indicateurs.conformite.recoltesNonConformes > 0 && (
              <Alerte className="mb-3">
                {t('cycle.recoltesNonConformes', {
                  n: indicateurs.conformite.recoltesNonConformes,
                })}
              </Alerte>
            )}
            <Card className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:grid-cols-5">
              <Chiffre
                libelle="Effectif final"
                valeur={nb(indicateurs.zootechnie.effectifFinal, 0)}
              />
              <Chiffre
                libelle="Taux de survie"
                valeur={nb(indicateurs.zootechnie.tauxSurviePct, 1)}
                unite="%"
              />
              <Chiffre
                libelle="Poids moyen final"
                valeur={nb(indicateurs.zootechnie.poidsMoyenFinalG, 0)}
                unite="g"
              />
              <Chiffre
                libelle="Gain quotidien"
                valeur={nb(indicateurs.zootechnie.gainMoyenQuotidienGJ, 2)}
                unite="g/j"
              />
              <Chiffre
                libelle="Indice de consommation"
                valeur={nb(indicateurs.alimentation.indiceConsommation, 2)}
              />
              <Chiffre
                libelle="Production récoltée"
                valeur={nb(indicateurs.production.productionRecolteeKg, 1)}
                unite="kg"
              />
              <Chiffre
                libelle="Aliment distribué"
                valeur={nb(indicateurs.alimentation.alimentDistribueKg, 1)}
                unite="kg"
              />
              <Chiffre
                libelle="Charges"
                valeur={formaterMontant(indicateurs.economie.charges.total)}
              />
              <Chiffre
                libelle="Produits"
                valeur={formaterMontant(indicateurs.economie.produits.total)}
              />
              <Chiffre
                libelle="Résultat"
                valeur={formaterMontant(indicateurs.economie.resultat)}
              />
              <Chiffre
                libelle="Prix de revient"
                valeur={
                  indicateurs.economie.prixRevientKg === null
                    ? null
                    : `${formaterMontant(indicateurs.economie.prixRevientKg)}/kg`
                }
              />
              <Chiffre
                libelle="Prix de vente moyen"
                valeur={
                  indicateurs.economie.prixVenteMoyenKg === null
                    ? null
                    : `${formaterMontant(indicateurs.economie.prixVenteMoyenKg)}/kg`
                }
              />
              <Chiffre
                libelle="Rentabilité"
                valeur={nb(indicateurs.economie.rentabilitePct, 2)}
                unite="%"
              />
              <Chiffre
                libelle="Durée"
                valeur={nb(indicateurs.cycle.dureeJours, 0)}
                unite="j"
              />
              <Chiffre
                libelle="Coefficient de variation"
                valeur={nb(indicateurs.zootechnie.coefficientVariationPct, 2)}
                unite="%"
              />
              <Chiffre
                libelle="Performance / référence"
                valeur={nb(indicateurs.zootechnie.performance, 2)}
              />
              <Chiffre
                libelle={`Charge finale (${indicateurs.production.uniteMesure})`}
                valeur={nb(indicateurs.production.chargeFinale, 2)}
                unite="kg"
              />
            </Card>
          </>
        )}
      </section>

      {SECTIONS_CYCLE.map((section) => (
        <section key={section.chemin} className="mb-8">
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {section.libelle}
          </h3>
          <p className="mb-3 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
            {section.description}
          </p>
          <TableauRessource
            ressource={section}
            filtres={{ cycleId: id }}
            compact
            taillePage={10}
            cheminNouveau={`/saisie/${section.chemin}/nouveau?cycleId=${id}&retour=${encodeURIComponent(`/cycles/${id}`)}`}
            lienLigne={(ligneId) =>
              section.chemin === 'pesees'
                ? `/pesees/${ligneId}`
                : section.chemin === 'lots'
                  ? `/lots/${ligneId}`
                  : `/saisie/${section.chemin}/${ligneId}?retour=${encodeURIComponent(`/cycles/${id}`)}`
            }
            {...(section.chemin === 'pesees' || section.chemin === 'lots'
              ? { libelleLien: t('action.ouvrir') }
              : {})}
          />
        </section>
      ))}
    </>
  );
}
