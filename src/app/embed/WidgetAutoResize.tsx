"use client";

import { useEffect } from "react";

/**
 * Mesure la hauteur du contenu du widget et la transmet à la page hôte via
 * `postMessage`, afin que celle-ci ajuste la hauteur de l'iframe.
 *
 * Protocole : { type: "widget-resize", height: <int px> } émis vers
 * `window.parent`. Voir la spec « Auto-resize du widget iframe ».
 *
 * Dégradation gracieuse : le widget ne force PAS `overflow: hidden` sur son
 * propre document. Un hôte qui n'implémente pas le handler de resize garde
 * ainsi le scroll natif de l'iframe (contenu accessible), au lieu de se
 * retrouver avec un contenu tronqué et non scrollable. La prévention de la
 * double scrollbar est du ressort de l'hôte (attribut `scrolling="no"` +
 * `overflow: hidden` sur l'élément iframe), qui ne s'applique que lorsqu'il a
 * effectivement opté pour le redimensionnement automatique.
 *
 * Ce composant ne rend rien : il installe les observateurs côté widget.
 */
export default function WidgetAutoResize() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // On mémorise les valeurs précédentes pour les restaurer si le composant
    // est démonté (navigation client hors des routes embed).
    const prevBodyMargin = body.style.margin;
    // Le layout racine applique `min-h-screen` (min-height: 100vh) au body.
    // Dans une iframe, 100vh vaut la hauteur courante de l'iframe : la hauteur
    // mesurée resterait alors « collée » à la taille de l'iframe et ne pourrait
    // jamais diminuer (ex. passage à une fiche RCP plus courte). On neutralise
    // donc min-height dans le contexte embed.
    const prevBodyMinHeight = body.style.minHeight;
    body.style.margin = "0";
    body.style.minHeight = "0";

    let lastHeight = 0;
    const sendHeight = () => {
      const height = html.scrollHeight;
      if (height === lastHeight) return; // évite le spam de messages
      lastHeight = height;
      window.parent.postMessage({ type: "widget-resize", height }, "*");
    };

    // Capte tout changement de taille : contenu dynamique, accordéons,
    // étapes de questionnaire…
    const observer = new ResizeObserver(sendHeight);
    observer.observe(body);

    // Cas limites : chargement initial + web fonts.
    sendHeight();
    window.addEventListener("load", sendHeight);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(sendHeight).catch(() => {});
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("load", sendHeight);
      body.style.margin = prevBodyMargin;
      body.style.minHeight = prevBodyMinHeight;
    };
  }, []);

  return null;
}
