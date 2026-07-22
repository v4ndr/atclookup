import {
  Binding,
  DosageTrace,
  ExplainTrace,
  GroupTrace,
  NormalizationStep,
  SpecialiteGroup,
  SpecialiteTrace,
} from "@/types/global";

// Facteurs de conversion vers une unité de base par dimension
const MASS_TO_MG: Record<string, number> = {
  g: 1000,
  mg: 1,
  µg: 0.001,
  μg: 0.001,
  microgramme: 0.001,
  microgrammes: 0.001,
};

const VOLUME_TO_ML: Record<string, number> = {
  l: 1000,
  ml: 1,
};

const parseNum = (s: string): number => parseFloat(s.replace(",", "."));

const formatPercent = (n: number): string => {
  const rounded = Math.round(n * 1e8) / 1e8;
  const s = rounded.toFixed(8).replace(/\.?0+$/, "").replace(".", ",");
  return `${s} %`;
};

// Convertit un ratio "X u1 / Y u2" en pourcentage si u1 et u2 sont de même
// dimension (masse ou volume). Retourne null sinon.
const ratioToPercent = (s: string): string | null => {
  const m = s.match(/^([\d.,]+)\s*([a-zµμ]+)\/([\d.,]*)\s*([a-zµμ]+)$/i);
  if (!m) return null;
  const u1 = m[2].toLowerCase();
  const u2 = m[4].toLowerCase();

  let mult: number;
  if (u1 in MASS_TO_MG && u2 in MASS_TO_MG) {
    mult = MASS_TO_MG[u1] / MASS_TO_MG[u2];
  } else if (u1 in VOLUME_TO_ML && u2 in VOLUME_TO_ML) {
    mult = VOLUME_TO_ML[u1] / VOLUME_TO_ML[u2];
  } else {
    return null;
  }

  const num = parseNum(m[1]);
  const denom = m[3] === "" ? 1 : parseNum(m[3]);
  if (!isFinite(num) || !isFinite(denom) || denom === 0) return null;
  return formatPercent(((num * mult) / denom) * 100);
};

// Un tracer accumule chaque transformation appliquée à une valeur de dosage.
// En production on appelle les fonctions sans tracer (tracer = undefined) :
// le comportement est strictement identique, seule l'instrumentation change.
type Tracer = NormalizationStep[];

const record = (
  tracer: Tracer | undefined,
  rule: string,
  before: string,
  after: string,
): void => {
  if (tracer && before !== after) tracer.push({ rule, before, after });
};

// Règles de nettoyage appliquées séquentiellement, dans l'ordre. Extraites en
// liste nommée pour que chaque étape soit traçable individuellement.
const CLEAN_RULES: { rule: string; apply: (s: string) => string }[] = [
  {
    rule: 'remplace "pour cent" par "%"',
    apply: (s) => s.replace(/\s*pour\s+cent\b/gi, "%"),
  },
  {
    rule: "normalise les espaces autour des /",
    apply: (s) => s.replace(/\s*\/\s*/g, "/"),
  },
  {
    rule: "supprime les zéros finaux (1,50 → 1,5)",
    apply: (s) => s.replace(/(\d+[.,]\d*[1-9])0+/g, "$1"),
  },
  {
    rule: "supprime la décimale ,0 (1,0 → 1)",
    apply: (s) => s.replace(/(\d+)[.,]0+(\s|\/|$)/g, "$1$2"),
  },
  {
    rule: "convertit 1000 mg en 1 g",
    apply: (s) => s.replace(/\b1000\s*mg\b/gi, "1 g"),
  },
];

const cleanDosageValue = (dosage: string, tracer?: Tracer): string => {
  let cur = dosage;
  for (const { rule, apply } of CLEAN_RULES) {
    const next = apply(cur);
    record(tracer, rule, cur, next);
    cur = next;
  }

  // "X u1/Y u2" avec unités de même dimension → "Z %"
  // Couvre "1 g/100 g", "20 mg/1 g", "5 mg/100 mg", "1 ml/100 ml"...
  const ratio = ratioToPercent(cur);
  if (ratio) {
    record(tracer, "ratio d'unités de même dimension → pourcentage", cur, ratio);
    return ratio;
  }

  // "X/100 u" (unité du numérateur implicite, sortie typique du SPARQL) → "X %"
  const impliedUnit = cur.match(/^([\d.,]+)\/100\s*[a-zµμ]+$/i);
  if (impliedUnit) {
    const out = `${impliedUnit[1]} %`;
    record(tracer, "X/100 u (unité implicite) → X %", cur, out);
    return out;
  }

  // "X/100" (ratio pur) → "X %"
  const noUnit = cur.match(/^([\d.,]+)\/100$/);
  if (noUnit) {
    const out = `${noUnit[1]} %`;
    record(tracer, "X/100 (ratio pur) → X %", cur, out);
    return out;
  }

  // "X%" ou "X  %" → "X %" (espacement uniforme)
  const pct = cur.match(/^([\d.,]+)\s*%$/);
  if (pct) {
    const out = `${pct[1]} %`;
    record(tracer, "uniformise l'espacement du %", cur, out);
    return out;
  }

  return cur;
};

const normalizeDosage = (
  quantite: string,
  reference?: string,
  tracer?: Tracer,
): string => {
  if (!reference) return cleanDosageValue(quantite, tracer);

  // On essaye d'abord de retirer la référence telle quelle. Si elle n'apparaît
  // pas dans quantite (typos genre "créme" vs "crème"), on retombe sur
  // l'extraction du motif numérique + unité en tête de quantite.
  let pure = quantite.replace(reference, "").trim();
  if (pure === quantite.trim()) {
    const leadingMatch = quantite.match(/^([\d.,]+(?:\s*[a-zµμ]+)?)/i);
    if (leadingMatch) pure = leadingMatch[1].trim();
  }
  record(tracer, `retire la référence de dosage "${reference}"`, quantite, pure);

  const unitMatch = reference.match(/^pour\s+([\d,]+\s*\w+)/);
  if (unitMatch) {
    const unit = unitMatch[1].trim();
    const combined = `${pure}/${unit}`;
    record(tracer, `applique l'unité de référence "pour ${unit}"`, pure, combined);
    return cleanDosageValue(combined, tracer);
  }

  if (reference.match(/^pour\s+un[e]?\s/)) return cleanDosageValue(pure, tracer);

  return cleanDosageValue(pure, tracer);
};

/** Normalise une valeur de dosage en exposant chaque étape (bac à sable IHM). */
export const explainDosage = (
  quantite: string,
  reference?: string,
): DosageTrace => {
  const steps: Tracer = [];
  const result = normalizeDosage(quantite, reference, steps);
  return {
    rawQuantite: quantite,
    rawReference: reference ?? null,
    steps,
    result,
  };
};

const UNIT = "(?:mg|g|ml|µg|microgrammes?|UI|MUI|%|pour\\s+cent)";

const extractDosageFromLabel = (label: string): string | null => {
  // Pattern composé : "500 microgrammes/50 microgrammes/dose" ou "100 mg/12,5 mg par mL"
  const compoundMatch = label.match(
    new RegExp(
      `(\\d+[\\d,./]*\\s*${UNIT}\\s*\\/\\s*\\d+[\\d,./]*\\s*${UNIT}(?:\\s*\\/\\s*(?:dose|ml|mL))?)`,
      "i",
    ),
  );
  if (compoundMatch) return cleanDosageValue(compoundMatch[1].trim());

  // Pattern simple : "400 mg", "20 mg/1 ml", "2,5 POUR CENT"
  const simpleMatch = label.match(
    new RegExp(
      `(\\d+[\\d,./]*\\s*(?:${UNIT}|mg\\/ml|mg\\/mL)(?:\\s*\\/\\s*\\d+\\s*m[lL])?)`,
      "i",
    ),
  );
  if (simpleMatch) return cleanDosageValue(simpleMatch[1].trim());

  return null;
};

export const SPARQL_ENDPOINT = "https://smt.esante.gouv.fr/api/sparql";

/** Construit la requête SPARQL envoyée au SMT pour un code ATC donné. */
export const buildSparqlQuery = (atc: string): string =>
  `PREFIX ansm: <http://data.esante.gouv.fr/ansm/medicament/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?specialite ?label ?forme ?substance ?quantite ?reference ?voie
WHERE {
  ?specialite ansm:codeATC "${atc}" .
  ?specialite rdfs:label ?label .

  OPTIONAL { ?specialite ansm:formeManufacturee ?formeURI .
             ?formeURI rdfs:label ?forme . }

  OPTIONAL { ?specialite ansm:voie ?voieURI .
             ?voieURI rdfs:label ?voie . }

  OPTIONAL { ?specialite ansm:seComposeDe ?compo .

    OPTIONAL { ?compo ansm:substanceActive ?substURI .
               ?substURI rdfs:label ?substance . }

    OPTIONAL { ?compo ansm:expressionDeDosage ?dosageURI .
               ?dosageURI ansm:expressionQuantite ?quantite .
               OPTIONAL { ?dosageURI ansm:referenceDosage ?reference . } }
  }

  FILTER NOT EXISTS { ?specialite ansm:dateFin ?dateFin }
}
LIMIT 200`;

type SparqlResult = {
  query: string;
  endpoint: string;
  httpStatus: number | null;
  durationMs: number;
  bindings: Binding[];
  error: string | null;
};

/** Interroge le SMT (proxy SPARQL) et renvoie les bindings bruts + métadonnées. */
const fetchSparql = async (atc: string): Promise<SparqlResult> => {
  const query = buildSparqlQuery(atc);
  const headers = new Headers();
  headers.append("Content-Type", "application/x-www-form-urlencoded");

  const body = new URLSearchParams();
  body.append("query", query);

  const start = Date.now();
  try {
    const response = await fetch(SPARQL_ENDPOINT, {
      method: "POST",
      headers,
      body,
      redirect: "follow" as RequestRedirect,
    });
    const durationMs = Date.now() - start;

    if (!response.ok) {
      return {
        query,
        endpoint: SPARQL_ENDPOINT,
        httpStatus: response.status,
        durationMs,
        bindings: [],
        error: `HTTP error! status: ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      query,
      endpoint: SPARQL_ENDPOINT,
      httpStatus: response.status,
      durationMs: Date.now() - start,
      bindings: data.results.bindings as Binding[],
      error: null,
    };
  } catch (error) {
    return {
      query,
      endpoint: SPARQL_ENDPOINT,
      httpStatus: null,
      durationMs: Date.now() - start,
      bindings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const cisFromUri = (uri: string): string | null => {
  const match = uri.match(/SpecialitePharmaceutique_(\d{8})/);
  return match ? match[1] : null;
};

const rcpUrl = (cis: string | null): string =>
  `https://base-donnees-publique.medicaments.gouv.fr/affichageDoc.php?specid=${cis}&typedoc=R`;

// Représentation intermédiaire d'une spécialité, portant à la fois les données
// dédupliquées nécessaires au regroupement (Sets) et la trace de normalisation
// de chaque dosage brut rencontré (pour l'explicabilité).
type AggregatedSpecialite = {
  uri: string;
  cis: string | null;
  label: string;
  url: string;
  forme: string;
  voies: Set<string>;
  substances: Set<string>;
  dosages: Set<string>;
  dosageTraces: DosageTrace[];
};

// Étape 1 : agréger les bindings par spécialité.
// La trace de normalisation est TOUJOURS calculée : le surcoût est négligeable
// (≤ 200 bindings/requête) et cela garantit qu'explain et prod partagent
// exactement le même code — pas de seconde implémentation qui pourrait diverger.
const aggregate = (bindings: Binding[]): Map<string, AggregatedSpecialite> => {
  const bySpecialite = new Map<string, AggregatedSpecialite>();

  for (const binding of bindings) {
    const uri = binding.specialite.value;
    const cis = cisFromUri(uri);

    if (!bySpecialite.has(uri)) {
      bySpecialite.set(uri, {
        uri,
        cis,
        label: binding.label.value,
        url: rcpUrl(cis),
        forme: binding.forme?.value ?? "N/A",
        voies: new Set(),
        substances: new Set(),
        dosages: new Set(),
        dosageTraces: [],
      });
    }

    const spe = bySpecialite.get(uri)!;

    if (binding.voie?.value) spe.voies.add(binding.voie.value);
    if (binding.substance?.value) spe.substances.add(binding.substance.value);

    if (binding.quantite?.value) {
      const trace = explainDosage(
        binding.quantite.value,
        binding.reference?.value,
      );
      spe.dosages.add(trace.result);
      spe.dosageTraces.push(trace);
    }
  }

  return bySpecialite;
};

// Étape 2 : grouper par substance + dosage + forme + voie.
// Une spécialité avec N voies produit N entrées de groupe (une par voie).
// Renvoie les groupes ET la clé de regroupement utilisée pour chacun.
const buildGroups = (
  bySpecialite: Map<string, AggregatedSpecialite>,
): { groups: SpecialiteGroup[]; keys: string[] } => {
  const groups = new Map<string, SpecialiteGroup>();

  for (const spe of bySpecialite.values()) {
    const substance = [...spe.substances].sort().join(" + ") || "Inconnu";

    const dosage =
      [...spe.dosages].sort().join(" + ") ||
      extractDosageFromLabel(spe.label) ||
      "N/A";

    const voies = spe.voies.size > 0 ? [...spe.voies] : ["N/A"];

    for (const voie of voies) {
      // Quand le dosage est inconnu on ne peut pas regrouper sans risque (des
      // dosages différents seraient confondus), donc chaque spécialité devient
      // son propre groupe via son URL unique.
      const key =
        dosage === "N/A"
          ? `${substance}|N/A|${spe.forme}|${voie}|${spe.url}`
          : `${substance}|${dosage}|${spe.forme}|${voie}`;

      if (!groups.has(key)) {
        groups.set(key, {
          substance,
          dosage,
          forme: spe.forme,
          voie,
          specialites: [],
        });
      }

      groups.get(key)!.specialites.push({
        label: spe.label,
        url: spe.url,
      });
    }
  }

  const entries = [...groups.entries()];
  return {
    groups: entries.map(([, group]) => group),
    keys: entries.map(([key]) => key),
  };
};

const loopupAtc = async (atc: string): Promise<SpecialiteGroup[] | Error> => {
  const { bindings, error } = await fetchSparql(atc);

  if (error) {
    console.error(error);
    return new Error(error);
  }
  if (bindings.length === 0) return [];

  return buildGroups(aggregate(bindings)).groups;
};

/**
 * Variante instrumentée de lookupAtc : renvoie la trace complète du pipeline
 * (requête SPARQL, bindings bruts du SMT, agrégation par spécialité avec les
 * étapes de normalisation de chaque dosage, et regroupement final avec les
 * clés). Alimente l'API d'explicabilité et l'IHM admin.
 */
export const explainAtc = async (atc: string): Promise<ExplainTrace> => {
  const sparql = await fetchSparql(atc);
  const bySpecialite = aggregate(sparql.bindings);
  const { groups, keys } = buildGroups(bySpecialite);

  const specialites: SpecialiteTrace[] = [...bySpecialite.values()].map(
    (spe) => ({
      uri: spe.uri,
      cis: spe.cis,
      label: spe.label,
      url: spe.url,
      forme: spe.forme,
      voies: [...spe.voies].sort(),
      substances: [...spe.substances].sort(),
      dosages: spe.dosageTraces,
    }),
  );

  const groupTraces: GroupTrace[] = groups.map((group, i) => ({
    key: keys[i],
    ...group,
  }));

  return {
    atc,
    timestamp: new Date().toISOString(),
    sparql: {
      endpoint: sparql.endpoint,
      query: sparql.query,
      httpStatus: sparql.httpStatus,
      durationMs: sparql.durationMs,
      bindingCount: sparql.bindings.length,
      error: sparql.error,
    },
    rawBindings: sparql.bindings,
    specialites,
    groups: groupTraces,
  };
};

export default loopupAtc;
