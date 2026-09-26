import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { API_URL } from './config';
import { configurer, DEVISE_PAR_DEFAUT, LANGUE_PAR_DEFAUT, type Devise, type Langue } from './i18n';
import './index.css';

/// Langue et devise viennent de l'API, pas de constantes dispersées dans les
/// écrans. Si elle ne répond pas, on démarre quand même sur les valeurs par
/// défaut : une configuration indisponible ne doit pas empêcher d'afficher
/// l'erreur qui l'explique.
/// Le thème sombre suit le réglage du système. Les jetons existent dans
/// `index.css` ; sans cette bascule ils resteraient du CSS mort.
function suivreThemeSysteme() {
  const sombre = window.matchMedia('(prefers-color-scheme: dark)');
  const appliquer = () => document.documentElement.classList.toggle('dark', sombre.matches);
  appliquer();
  sombre.addEventListener('change', appliquer);
}

async function demarrer() {
  suivreThemeSysteme();
  try {
    const reponse = await fetch(`${API_URL}/config`);
    if (reponse.ok) {
      const config = (await reponse.json()) as { langue?: Langue; devise?: Devise };
      configurer(config.langue ?? LANGUE_PAR_DEFAUT, config.devise ?? DEVISE_PAR_DEFAUT);
    }
  } catch {
    // API injoignable : les écrans le signaleront eux-mêmes.
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void demarrer();
