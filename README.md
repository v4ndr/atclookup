**ATC Lookup** est un outil permettant, à partir d’un **code ATC**, d’obtenir des **liens directs** vers les fiches médicaments des bases de données de référence.  
Actuellement, seule la [Base de Données Publique des Médicaments (BDPM)](https://base-donnees-publique.medicaments.gouv.fr/) est couverte.

## Pourquoi ATC Lookup ?

La base de données publique des médicaments (BDPM) ne permet pas d'accéder aux RCP directement via un **code ATC**.  
De nombreux corpus d’informations médicales font référence aux codes ATC, ce qui complique l’accès aux informations détaillées sur un médicament.  
**ATC Lookup a été conçu pour pallier cette difficulté** et faciliter **l’interopérabilité** des systèmes d’information en santé.

## Technologie et API

ATC Lookup utilise en partie le [Serveur Multi-Terminologie (SMT)](https://smt.esante.gouv.fr/).

Une **API ouverte** est également disponible : [Documentation API](lien_vers_api).

## Console d'explicabilité (admin)

Pour déboguer *pourquoi* une spécialité se retrouve (ou non) sous un code ATC
donné, une console admin trace l'intégralité du pipeline
**SMT → normalisation → regroupement**.

### API `/api/explain`

- `GET /api/explain?atc=CODE` — trace complète pour un code ATC : requête
  SPARQL envoyée au SMT, bindings bruts, agrégation par spécialité avec les
  étapes de normalisation de **chaque** dosage, et regroupement final (avec la
  clé de regroupement utilisée). En cas d'échec du SMT, l'erreur est renvoyée
  dans la trace plutôt que de faire planter la requête.
- `GET /api/explain?dosage=STRING[&reference=STRING]` — bac à sable : normalise
  une valeur de dosage isolée, étape par étape, **sans** appel réseau. Idéal
  pour reproduire un bug de parsing des dosages.

La normalisation exposée par l'API est **exactement** celle utilisée en
production (même code, instrumenté) : aucune seconde implémentation qui
pourrait diverger.

### IHM `/admin`

Interface web pour lancer ces recherches et visualiser chaque étape (requête
SPARQL, méta SMT, groupes finaux, traces de normalisation, bindings bruts) ainsi
que le bac à sable de normalisation.

### Accès

Les surfaces admin sont protégées par un token **optionnel** : si la variable
d'environnement `ADMIN_TOKEN` est définie, chaque appel doit fournir ce token
via l'en-tête `x-admin-token` ou le paramètre `?token=` (l'IHM propose un champ
dédié, conservé dans le navigateur). Si `ADMIN_TOKEN` n'est pas définie, l'accès
est ouvert (pratique en dev) — **pensez à la définir en production**.

## Open source

Développé par [Romain Vandepitterie](https://fr.linkedin.com/in/romain-vandepitterie-9b4a08152), **ATC Lookup** est un projet **open source sous licence MIT**.
