import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { chargerSession } from './session';
import { demarrerSynchronisation } from './sync';
import './index.css';

/// Le thème suit le réglage du téléphone ; les jetons clair et sombre sont
/// ceux de l'admin.
function suivreTheme() {
  const sombre = window.matchMedia('(prefers-color-scheme: dark)');
  const appliquer = () => document.documentElement.classList.toggle('dark', sombre.matches);
  appliquer();
  sombre.addEventListener('change', appliquer);
}

async function demarrer() {
  suivreTheme();
  // Mise à jour silencieuse : la nouvelle version s'installe au prochain
  // lancement, sans interrompre une saisie en cours.
  registerSW({ immediate: true });
  // Demande au navigateur de ne pas purger IndexedDB sous pression d'espace :
  // ce sont des saisies de terrain, pas un cache.
  void navigator.storage?.persist?.();
  await chargerSession();
  demarrerSynchronisation();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void demarrer();
