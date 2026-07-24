"use client";

import { useEffect } from "react";

/**
 * Mesure la hauteur du contenu du widget et la transmet à la page hôte via
 * `postMessage`, afin que celle-ci ajuste la hauteur de l'iframe.
 *
 * Protocole : { type: "widget-resize", height: <int px> } émis vers
 * `window.parent`. Voir la spec « Auto-resize du widget iframe ».
 *
 * Ce composant ne rend rien : il installe les observateurs côté widget.
 */
export default function WidgetAutoResize() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // CSS requis côté widget : évite les boucles de resize et la double
    // scrollbar. On mémorise les valeurs précédentes pour les restaurer si le
    // composant est démonté (navigation client hors des routes embed).
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyMargin = body.style.margin;
    // Le layout racine applique `min-h-screen` (min-height: 100vh) au body.
    // Dans une iframe, 100vh vaut la hauteur courante de l'iframe : la hauteur
    // mesurée resterait alors « collée » à la taille de l'iframe et ne pourrait
    // jamais diminuer (ex. passage à une fiche RCP plus courte). On neutralise
    // donc min-height dans le contexte embed.
    const prevBodyMinHeight = body.style.minHeight;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
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
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.margin = prevBodyMargin;
      body.style.minHeight = prevBodyMinHeight;
    };
  }, []);

  return null;
}
