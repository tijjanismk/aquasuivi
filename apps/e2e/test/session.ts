/// Connexion des parcours à l'API, fermée par défaut depuis D18.
///
/// Les parcours existants appellent `fetch` à nu, à des dizaines d'endroits :
/// plutôt que de tous les réécrire, on ajoute le jeton à chaque requête
/// adressée à l'API. Le compte est l'administrateur créé par `pnpm db:seed`.

export async function connexion(api: string, identifiant: string, motDePasse: string) {
  const reponse = await fetch(`${api}/auth/connexion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant, motDePasse }),
  });
  if (!reponse.ok) {
    throw new Error(`Connexion ${identifiant} refusée : ${reponse.status} ${await reponse.text()}`);
  }
  return (await reponse.json()) as { jetonAcces: string; jetonRafraichissement: string };
}

export async function authentifierEnAdmin(api: string) {
  const telephone = process.env['AQUA_ADMIN_TELEPHONE'];
  const motDePasse = process.env['AQUA_ADMIN_MOT_DE_PASSE'];
  if (!telephone || !motDePasse) {
    throw new Error('AQUA_ADMIN_TELEPHONE / AQUA_ADMIN_MOT_DE_PASSE absents du .env — voir .env.example.');
  }
  const { jetonAcces } = await connexion(api, telephone, motDePasse);

  const fetchNu = globalThis.fetch;
  globalThis.fetch = (entree, init) => {
    const url = entree instanceof Request ? entree.url : String(entree);
    if (!url.startsWith(api)) return fetchNu(entree, init);
    const entetes = new Headers(init?.headers);
    if (!entetes.has('Authorization')) entetes.set('Authorization', `Bearer ${jetonAcces}`);
    return fetchNu(entree, { ...init, headers: entetes });
  };
  return jetonAcces;
}

/// Connexion par le **vrai formulaire** de l'admin, pas par injection du
/// jeton : l'écran de connexion est ainsi parcouru à chaque exécution.
export async function connecterNavigateur(
  nav: import('./navigateur.ts').Navigateur,
  admin: string,
  outilsSaisie: string,
) {
  await nav.aller(`${admin}/connexion`);
  await nav.attendre(`!!document.querySelector('[data-test=connexion]')`, 'formulaire de connexion');
  await nav.evaluer(outilsSaisie);
  await nav.evaluer(`window.__saisir('identifiant', ${JSON.stringify(process.env['AQUA_ADMIN_TELEPHONE'])})`);
  await nav.evaluer(`window.__saisir('motDePasse', ${JSON.stringify(process.env['AQUA_ADMIN_MOT_DE_PASSE'])})`);
  await nav.evaluer(`document.querySelector('[data-test=connexion] button[type=submit]').click(), true`);
  await nav.attendre(`!!document.querySelector('[data-test=nav]')`, 'admin ouvert après connexion');
}
