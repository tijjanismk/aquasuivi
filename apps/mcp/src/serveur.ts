/// Serveur MCP Aqua-Suivi — **lecture et analyse uniquement**.
///
/// Aucun outil n'écrit : pas de création de cycle, pas de saisie de pesée.
/// C'est délibéré. Les données de production d'une ferme ne doivent pas
/// pouvoir être modifiées par un assistant conversationnel ; le jour où
/// l'écriture se justifie, elle demandera un garde-fou explicite.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { api, API_URL } from './api.js';

const REFERENTIELS = [
  'especes',
  'types-infrastructure',
  'aliments',
  'produits-sanitaires',
  'paliers',
] as const;

const serveur = new McpServer({ name: 'aqua-suivi', version: '0.1.0' });

/// Toutes les réponses passent par ici : du JSON lisible, et une erreur
/// exploitable plutôt qu'une pile d'appels.
function texte(valeur: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(valeur, null, 2) }] };
}

function echec(erreur: unknown) {
  return {
    content: [{ type: 'text' as const, text: (erreur as Error).message }],
    isError: true,
  };
}

const LECTURE = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

serveur.registerTool(
  'lister_fermes',
  {
    title: 'Lister les fermes',
    description:
      'Liste les fermes piscicoles suivies, avec leur localisation. ' +
      'Point de départ habituel : les autres outils demandent un identifiant de ferme.',
    inputSchema: {
      inactives: z
        .boolean()
        .optional()
        .describe('Inclure les fermes désactivées. Par défaut, seules les actives.'),
    },
    annotations: LECTURE,
  },
  async ({ inactives }) => {
    try {
      const fermes = await api.fermes(inactives ? {} : { actif: 'true' });
      return texte(
        fermes.map((f) => ({
          id: f.id,
          nom: f.nom,
          promoteur: f.promoteur,
          region: f.region?.nom ?? null,
          commune: f.commune?.nom ?? null,
          village: f.village,
          actif: f.actif,
        })),
      );
    } catch (e) {
      return echec(e);
    }
  },
);

serveur.registerTool(
  'lister_infrastructures',
  {
    title: 'Lister les infrastructures',
    description:
      "Bassins, étangs, cages et autres unités d'élevage. " +
      'La superficie et le volume sont calculés à partir des dimensions saisies ; ' +
      "ils valent `null` quand les dimensions sont incomplètes, et la densité n'est alors pas calculable.",
    inputSchema: {
      fermeId: z.string().optional().describe("Restreindre à une ferme (identifiant ULID)."),
    },
    annotations: LECTURE,
  },
  async ({ fermeId }) => {
    try {
      const liste = await api.infrastructures(fermeId ? { fermeId } : {});
      return texte(
        liste.map((i) => ({
          id: i.id,
          nom: i.nom,
          ferme: i.ferme?.nom ?? null,
          type: i.typeInfrastructure?.nom ?? null,
          baseDeMesure: i.typeInfrastructure?.mesureBase ?? null,
          superficieM2: i.superficie,
          volumeM3: i.volume,
          actif: i.actif,
        })),
      );
    } catch (e) {
      return echec(e);
    }
  },
);

serveur.registerTool(
  'lister_cycles',
  {
    title: 'Lister les cycles de production',
    description:
      "Un cycle va de la mise en charge à la vidange d'une infrastructure. " +
      'Les plus récents en premier. Utiliser `indicateurs_cycle` ensuite pour les chiffres.',
    inputSchema: {
      infrastructureId: z.string().optional().describe('Restreindre à une infrastructure.'),
      statut: z
        .enum(['EN_COURS', 'EN_RECOLTE', 'BOUCLE'])
        .optional()
        .describe('Restreindre à un statut.'),
    },
    annotations: LECTURE,
  },
  async ({ infrastructureId, statut }) => {
    try {
      const cycles = await api.cycles({
        ...(infrastructureId ? { infrastructureId } : {}),
        ...(statut ? { statut } : {}),
      });
      return texte(
        cycles.map((c) => ({
          id: c.id,
          numero: c.numero,
          infrastructure: c.infrastructure?.nom ?? null,
          especeDominante: c.espece?.nom ?? null,
          dateMiseEnCharge: c.dateMiseEnCharge,
          dateCloture: c.dateCloture,
          statut: c.statut,
        })),
      );
    } catch (e) {
      return echec(e);
    }
  },
);

serveur.registerTool(
  'indicateurs_cycle',
  {
    title: "Indicateurs d'un cycle",
    description:
      "Zootechnie, alimentation, production, économie et conformité sanitaire d'un cycle. " +
      "C'est l'outil d'analyse principal : taux de survie, gain quotidien, indice de consommation, " +
      'prix de revient au kilo, résultat et rentabilité. ' +
      'Les montants sont exprimés dans la devise de la configuration (voir `configuration`).',
    inputSchema: {
      cycleId: z.string().describe("Identifiant du cycle, obtenu via `lister_cycles`."),
    },
    annotations: LECTURE,
  },
  async ({ cycleId }) => {
    try {
      return texte(await api.indicateurs(cycleId));
    } catch (e) {
      return echec(e);
    }
  },
);

serveur.registerTool(
  'consulter_referentiel',
  {
    title: 'Consulter un référentiel',
    description:
      'Paramètres de référence administrés en base : espèces et leurs repères zootechniques, ' +
      "types d'infrastructure, aliments et leurs prix, produits sanitaires et leurs délais " +
      "d'attente, paliers de rationnement. Ce sont les étalons auxquels comparer un cycle.",
    inputSchema: {
      referentiel: z.enum(REFERENTIELS).describe('Référentiel à consulter.'),
      recherche: z.string().optional().describe('Filtre texte sur le nom.'),
    },
    annotations: LECTURE,
  },
  async ({ referentiel, recherche }) => {
    try {
      return texte(await api.referentiel(referentiel, recherche));
    } catch (e) {
      return echec(e);
    }
  },
);

serveur.registerTool(
  'resume_ferme',
  {
    title: "Résumé d'une ferme",
    description:
      "Vue d'ensemble d'une ferme : ses infrastructures et, pour chacune, le cycle en cours " +
      "s'il y en a un. Évite d'enchaîner trois outils pour savoir où en est une exploitation.",
    inputSchema: {
      fermeId: z.string().describe("Identifiant de la ferme, obtenu via `lister_fermes`."),
    },
    annotations: LECTURE,
  },
  async ({ fermeId }) => {
    try {
      const [fermes, infrastructures] = await Promise.all([
        api.fermes({}),
        api.infrastructures({ fermeId }),
      ]);
      const ferme = fermes.find((f) => f.id === fermeId);
      if (!ferme) throw new Error(`Ferme ${fermeId} introuvable.`);

      const cycles = await Promise.all(
        infrastructures.map((i) => api.cycles({ infrastructureId: i.id })),
      );

      return texte({
        ferme: {
          id: ferme.id,
          nom: ferme.nom,
          promoteur: ferme.promoteur,
          region: ferme.region?.nom ?? null,
          commune: ferme.commune?.nom ?? null,
        },
        infrastructures: infrastructures.map((i, rang) => {
          const tous = cycles[rang] ?? [];
          const ouvert = tous.find((c) => c.statut !== 'BOUCLE');
          return {
            id: i.id,
            nom: i.nom,
            type: i.typeInfrastructure?.nom ?? null,
            superficieM2: i.superficie,
            volumeM3: i.volume,
            nombreDeCycles: tous.length,
            cycleOuvert: ouvert
              ? {
                  id: ouvert.id,
                  numero: ouvert.numero,
                  statut: ouvert.statut,
                  dateMiseEnCharge: ouvert.dateMiseEnCharge,
                  especeDominante: ouvert.espece?.nom ?? null,
                }
              : null,
          };
        }),
      });
    } catch (e) {
      return echec(e);
    }
  },
);

serveur.registerTool(
  'configuration',
  {
    title: 'Configuration active',
    description:
      "Langue et devise de l'installation. Les montants renvoyés par les autres outils " +
      'sont des nombres bruts, exprimés dans cette devise et sans symbole.',
    inputSchema: {},
    annotations: LECTURE,
  },
  async () => {
    try {
      return texte({ ...(await api.config()), api: API_URL });
    } catch (e) {
      return echec(e);
    }
  },
);

await serveur.connect(new StdioServerTransport());
