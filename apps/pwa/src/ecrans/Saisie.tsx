import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Trash2 } from 'lucide-react';
import type { Violation } from '@aqua/shared';
import { db, TABLES, type Ligne, type Segment } from '../db';
import { FORMULAIRES, type Champ, type Contexte, type Formulaire, type Option } from '../formulaires';
import { enregistrer, ErreurSaisie, supprimer } from '../saisie';
import { Entete } from '../App';
import { Button } from '@/ui/button';
import { Vide } from './liste';
import { Alert, AlertDescription } from '@/ui/alert';
import { Input } from '@/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/ui/field';
import { NativeSelect, NativeSelectOption } from '@/ui/native-select';

const SEGMENTS = Object.keys(FORMULAIRES) as Segment[];

/// Retrouve cycle, bassin et ferme d'une ligne, ou depuis l'URL à la création.
async function contexte(ligne: Ligne | undefined, parametres: URLSearchParams): Promise<Contexte> {
  let cycleId = parametres.get('cycle') ?? ligne?.['cycleId'];
  if (!cycleId && ligne?.['lotId']) cycleId = (await db.lots.get(ligne['lotId']))?.['cycleId'];
  const cycle = cycleId ? await db.cycles.get(String(cycleId)) : undefined;
  const infraId = parametres.get('infrastructure') ?? ligne?.['infrastructureId'] ?? cycle?.['infrastructureId'];
  const infrastructure = infraId ? await db.infrastructures.get(String(infraId)) : undefined;
  const fermeId = parametres.get('ferme') ?? ligne?.['fermeId'] ?? infrastructure?.['fermeId'];
  const ferme = fermeId ? await db.fermes.get(String(fermeId)) : undefined;
  return { cycle, infrastructure, ferme };
}

/// Formulaire effectif : la modification d'un cycle ajoute sa clôture.
function formulaire(ressource: Segment, edition: boolean): Formulaire {
  const f = FORMULAIRES[ressource];
  if (ressource === 'cycles' && edition) {
    return {
      ...f,
      titre: 'Cycle',
      champs: [
        ...f.champs,
        { nom: 'dateCloture', libelle: 'Date de clôture (vidange)', type: 'date', aide: 'À renseigner quand le bassin est vidé : le cycle passe « bouclé ».' },
      ],
    };
  }
  return edition ? { ...f, titre: f.titre.replace(/^Nouve(au|lle) /, '').replace(/^\w/, (c) => c.toUpperCase()) } : f;
}

function versTexte(v: unknown) {
  return v === null || v === undefined ? '' : String(v);
}

/// Valeurs du formulaire → saisie. Virgule décimale acceptée : c'est celle
/// que tape un utilisateur francophone.
function versSaisie(champs: Champ[], valeurs: Record<string, string>, edition: boolean) {
  const sortie: Record<string, unknown> = {};
  for (const c of champs) {
    const brut = (valeurs[c.nom] ?? '').trim();
    if (brut === '') {
      if (edition) sortie[c.nom] = null;
      continue;
    }
    if (c.type === 'nombre') sortie[c.nom] = Number(brut.replace(',', '.'));
    else if (c.type === 'entier') sortie[c.nom] = Number.parseInt(brut, 10);
    else sortie[c.nom] = brut;
  }
  return sortie;
}

export function ChampSaisie({ champ, valeur, onChange, options, erreur }: {
  champ: Champ;
  valeur: string;
  onChange: (v: string) => void;
  options?: Option[];
  erreur?: string;
}) {
  const id = `champ-${champ.nom}`;
  const commun = {
    id,
    name: champ.nom,
    required: champ.requis,
    'aria-invalid': erreur ? true : undefined,
    value: valeur,
  };
  return (
    <Field data-invalid={erreur ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {champ.libelle}
        {champ.unite && <span className="font-normal text-muted-foreground"> ({champ.unite})</span>}
        {champ.requis && <span className="text-destructive"> *</span>}
      </FieldLabel>
      {champ.type === 'choix' || champ.type === 'reference' ? (
        <NativeSelect {...commun} className="h-11 text-base" onChange={(e) => onChange(e.target.value)}>
          <NativeSelectOption value="">{champ.requis ? 'Choisir…' : '—'}</NativeSelectOption>
          {(champ.options ?? options ?? []).map((o) => (
            <NativeSelectOption key={o.valeur} value={o.valeur}>{o.libelle}</NativeSelectOption>
          ))}
        </NativeSelect>
      ) : (
        <Input
          {...commun}
          className="h-11 text-base"
          type={champ.type === 'date' ? 'date' : champ.type === 'heure' ? 'time' : 'text'}
          inputMode={champ.type === 'nombre' ? 'decimal' : champ.type === 'entier' ? 'numeric' : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {erreur ? (
        <FieldError data-test="erreur-champ">{erreur}</FieldError>
      ) : (
        champ.aide && <FieldDescription>{champ.aide}</FieldDescription>
      )}
    </Field>
  );
}

/// Où revenir après enregistrement.
function destination(ressource: Segment, ligne: Ligne, ctx: Contexte) {
  switch (ressource) {
    case 'fermes':
      return `/fermes/${ligne.id}`;
    case 'infrastructures':
      return `/fermes/${ligne['fermeId']}`;
    case 'cycles':
      return `/cycles/${ligne.id}`;
    default:
      return ctx.cycle ? `/cycles/${ctx.cycle.id}` : ctx.infrastructure ? `/bassins/${ctx.infrastructure.id}` : '/';
  }
}

export function Saisie() {
  const { ressource: brut = '', id } = useParams();
  const [parametres] = useSearchParams();
  const naviguer = useNavigate();
  const ressource = SEGMENTS.includes(brut as Segment) ? (brut as Segment) : null;
  const edition = !!id;

  const [ctx, setCtx] = useState<Contexte>();
  const [ligne, setLigne] = useState<Ligne | null>();
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [violations, setViolations] = useState<Violation[]>([]);
  const [attente, setAttente] = useState(false);

  useEffect(() => {
    if (!ressource) return;
    void (async () => {
      const existante = id ? ((await TABLES[ressource].get(id)) ?? null) : undefined;
      const c = await contexte(existante ?? undefined, parametres);
      const f = formulaire(ressource, edition);
      const initiales: Record<string, string> = {};
      for (const champ of f.champs) {
        initiales[champ.nom] = versTexte(existante ? existante[champ.nom] : champ.defaut?.(c));
      }
      const choix: Record<string, Option[]> = {};
      for (const champ of f.champs) if (champ.charger) choix[champ.nom] = await champ.charger(c, initiales);
      setCtx(c);
      setLigne(existante);
      setValeurs(initiales);
      setOptions(choix);
    })();
  }, [ressource, id, edition, parametres]);

  if (!ressource) return <Vide>Formulaire inconnu.</Vide>;
  if (!ctx || ligne === null) return ligne === null ? <Vide>Cette ligne n’existe plus sur ce téléphone.</Vide> : null;
  const f = formulaire(ressource, edition);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    // Champs obligatoires vérifiés ici, pas au serveur : un oubli découvert à
    // la synchronisation, loin du bassin, ne se corrige plus de mémoire.
    const manquants: Violation[] = f.champs
      .filter((c) => c.requis && !(valeurs[c.nom] ?? '').trim())
      .map((c) => ({ code: 'CHAMP_REQUIS', champ: c.nom, message: `${c.libelle} : obligatoire.` }));
    setViolations(manquants);
    if (manquants.length > 0) return;
    setAttente(true);
    try {
      const saisie = versSaisie(f.champs, valeurs, edition);
      if (!edition && f.parent) {
        const parent = ctx[f.parent.depuis];
        if (parent) saisie[f.parent.champ] = parent.id;
      }
      const enregistree = await enregistrer(ressource, saisie, id);
      naviguer(destination(ressource, enregistree, ctx), { replace: true });
    } catch (x) {
      setViolations(x instanceof ErreurSaisie ? x.violations : [{ code: 'ERREUR', message: (x as Error).message }]);
    } finally {
      setAttente(false);
    }
  };

  const retirer = async () => {
    if (!id || !confirm('Supprimer cette saisie ? Ses données rattachées le seront aussi.')) return;
    await supprimer(ressource, id);
    naviguer(ressource === 'fermes' ? '/' : destination(ressource, ligne ?? { id }, ctx), { replace: true });
  };

  /// Change un champ ; ceux qui en dépendent (cercle, puis commune) sont vidés
  /// et leurs choix relus pour la nouvelle valeur. Un seul choix possible — le
  /// cercle technique du district de Bamako — est pris d’office.
  const changer = async (nom: string, v: string) => {
    const suivantes = { ...valeurs, [nom]: v };
    const aRecharger: Champ[] = [];
    const aVider = [nom];
    while (aVider.length > 0) {
      const parent = aVider.pop();
      for (const c of f.champs) {
        if (c.dependDe === parent) {
          suivantes[c.nom] = '';
          aRecharger.push(c);
          aVider.push(c.nom);
        }
      }
    }
    const choix: Record<string, Option[]> = {};
    // Dans l’ordre de la cascade : la commune se lit avec le cercle déjà choisi.
    for (const c of aRecharger) {
      choix[c.nom] = c.charger ? await c.charger(ctx, suivantes) : [];
      if (choix[c.nom]!.length === 1) suivantes[c.nom] = choix[c.nom]![0]!.valeur;
    }
    setValeurs(suivantes);
    setOptions((o) => ({ ...o, ...choix }));
  };

  const parChamp = new Map(violations.filter((v) => v.champ).map((v) => [v.champ!, v.message]));
  const generales = violations.filter((v) => !v.champ || !f.champs.some((c) => c.nom === v.champ));

  return (
    <>
      <Entete titre={f.titre} retour={destination(ressource, ligne ?? { id: '' }, ctx)} />
      <form data-test="formulaire" onSubmit={soumettre} noValidate>
        <FieldGroup className="gap-4">
        {f.champs.map((champ) => (
          <ChampSaisie
            key={champ.nom}
            champ={champ}
            valeur={valeurs[champ.nom] ?? ''}
            options={options[champ.nom]}
            erreur={parChamp.get(champ.nom)}
            onChange={(v) => void changer(champ.nom, v)}
          />
        ))}
        {generales.length > 0 && (
          <Alert variant="destructive" data-test="refus">
            <AlertDescription>{generales.map((v) => v.message).join(' ')}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" disabled={attente} data-test="enregistrer">
          Enregistrer
        </Button>
        {edition && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => void retirer()}>
            <Trash2 /> Supprimer
          </Button>
        )}
        </FieldGroup>
      </form>
    </>
  );
}
