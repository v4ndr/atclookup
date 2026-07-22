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

## Audit ATC — RCP (BDPM) vs RUIM (SMT)

Le code ATC d'une spécialité existe à **deux** endroits, qui peuvent diverger :

- **structuré** dans le RUIM (Référentiel Unique d'Interopérabilité du
  Médicament, publié par l'ANS sur le SMT) via `ansm:codeATC` — c'est la source
  qu'interroge ATC Lookup ;
- en **texte libre** dans le RCP publié par la BDPM (rubrique « Classe
  pharmacothérapeutique – code ATC »), qui reflète l'AMM.

L'outil d'audit confronte les deux, spécialité par spécialité, et classe chaque
cas en cinq catégories :

| Catégorie | Signification |
|---|---|
| `GREEN` | RUIM et RCP présents et **concordants** |
| `INCOHERENCE` | les deux présents mais **différents** — un `verdict` (`RCP`/`RUIM`/`AMBIGU`/`INDETERMINE`) désigne qui a raison, tranché en confrontant le **libellé OMS** du code à la substance active |
| `RCP_INCOMPLET` | le RUIM a un code, mais le RCP n'expose **aucun code de niveau 5 exploitable** (classe seule, code partiel `N02B`, typo `M0AE01`, ou RCP absent) ; le `detail` cite le texte ATC brut trouvé |
| `RUIM_INCOMPLET` | le RCP a un code, mais le RUIM **n'en a pas** (mode `without-atc`) |
| `VIDE` | aucun code exploitable des deux côtés |

Le verdict et la catégorisation sont **entièrement déterministes** (regex +
comparaison de chaînes normalisées, sels retirés) : aucun LLM, coût quasi nul.
Le débit vient d'un **pool de parallélisme borné** sur les téléchargements de RCP
et de l'**abandon anticipé** du téléchargement dès qu'un code ATC est capté.

### Script batch (base entière)

```bash
node scripts/audit-atc.ts            # ou : npm run audit:atc
```

Node ≥ 22 exécute le TypeScript directement (ni build, ni `tsx`). Options
principales : `--mode=with-atc|without-atc|both`, `--concurrency=N` (défaut 24),
`--page=N`, `--max=N` (test), `--only=INCOHERENCE,RCP_INCOMPLET`, `--resume`
(reprise sur checkpoint). Sorties : un NDJSON (une ligne par spécialité), un
`.summary.json` (récap par catégorie/verdict), et un `.checkpoint` pour la
reprise. Le moteur (`src/lib/auditAtc.ts`) est autonome et partagé avec l'API.

### API `/api/audit`

- `GET /api/audit?atc=CODE` — audit ciblé d'un code ATC (toutes ses spécialités
  RUIM), réponse JSON agrégée avec le verdict sur chaque incohérence.
- `GET /api/audit?all=1&after=&limit=500[&mode=]` — audit d'une page de la base
  entière, streamé en **NDJSON** (ligne `meta`, une ligne par spécialité, ligne
  `summary`). Pagination **keyset** : le client rappelle avec `after` = le
  `nextCursor` de la page précédente jusqu'à `done:true`. `concurrency` borne le
  parallélisme. Même protection `ADMIN_TOKEN`.

## Open source

Développé par [Romain Vandepitterie](https://fr.linkedin.com/in/romain-vandepitterie-9b4a08152), **ATC Lookup** est un projet **open source sous licence MIT**.
