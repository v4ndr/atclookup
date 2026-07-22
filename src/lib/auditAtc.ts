/**
 * Moteur d'audit ATC : compare, spécialité par spécialité, le code ATC
 * **structuré** du RUIM (Référentiel Unique d'Interopérabilité du Médicament,
 * publié par l'ANS sur le SMT) au code ATC présent en **texte libre** dans le
 * RCP publié par la BDPM (ANSM).
 *
 * Le module est volontairement autonome (aucun import d'alias `@/`, aucune
 * dépendance npm) afin de pouvoir être exécuté :
 *   - par la route `/api/audit` (console admin), et
 *   - par le script CLI `scripts/audit-atc.ts` (audit batch de toute la base,
 *     `node scripts/audit-atc.ts`), sans serveur Next ni build.
 *
 * Coût : aucune inférence, aucun LLM. Tout le verdict repose sur des règles
 * déterministes (regex + comparaison de chaînes normalisées). Le débit vient du
 * parallélisme (pool borné) et de l'abandon anticipé du téléchargement des RCP.
 */
import https from "node:https";
import http from "node:http";

// ---------------------------------------------------------------------------
// Constantes de source
// ---------------------------------------------------------------------------

const SPARQL_ENDPOINT = "https://smt.esante.gouv.fr/api/sparql";
const ATC_BASE = "http://data.esante.gouv.fr/whocc/atc/";

const rcpUrl = (cis: string): string =>
  `https://base-donnees-publique.medicaments.gouv.fr/affichageDoc.php?specid=${cis}&typedoc=R`;

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/** Catégories de résultat d'audit, telles que demandées. */
export type AtcCategory =
  | "GREEN" // RUIM et RCP présents et concordants
  | "INCOHERENCE" // les deux présents mais différents (voir `verdict`)
  | "RCP_INCOMPLET" // RUIM a un code, le RCP n'expose aucun code exploitable
  | "RUIM_INCOMPLET" // le RCP a un code, le RUIM n'en a pas
  | "VIDE"; // aucun code exploitable des deux côtés

/** En cas d'INCOHERENCE, qui a raison — tranché via le libellé OMS du code. */
export type Verdict =
  | "RCP" // le code du RCP est cohérent avec la substance, pas celui du RUIM
  | "RUIM" // le code du RUIM est cohérent avec la substance, pas celui du RCP
  | "AMBIGU" // les deux codes sont cohérents (probable association)
  | "INDETERMINE" // aucun cohérent, ou substance inconnue → revue humaine
  | null; // pas d'incohérence → pas de verdict

export type AuditResult = {
  cis: string | null;
  label: string;
  substances: string[];
  ruimAtc: string[];
  ruimLibelle: string | null;
  rcpAtc: string[];
  rcpAtcContext: string | null;
  rcpHasAtcMention: boolean;
  rcpAvailable: boolean;
  category: AtcCategory;
  verdict: Verdict;
  detail: string;
  rcpUrl: string;
};

export type RuimMode = "with-atc" | "without-atc";

export type AuditSummary = {
  total: number;
  categories: Record<AtcCategory, number>;
  verdicts: Record<NonNullable<Verdict>, number>;
};

/** Enregistrement brut d'une spécialité côté RUIM (avant confrontation au RCP). */
export type RuimRecord = {
  cis: string;
  uri: string;
  label: string;
  atcCodes: string[];
  libelleAtc: string | null;
  substances: string[];
};

// ---------------------------------------------------------------------------
// SPARQL (SMT)
// ---------------------------------------------------------------------------

type Binding = Record<string, { value: string } | undefined>;

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

// Le SMT throttle en cas de rafale (403/429/5xx transitoires) : on réessaie
// avec backoff exponentiel avant d'abandonner.
const sparql = async (query: string, retries = 6): Promise<Binding[]> => {
  const body = new URLSearchParams();
  // Le WAF du SMT bloque (403 « Oops ! ») les requêtes multilignes indentées.
  // SPARQL étant insensible aux espaces hors littéraux (ici seul le code ATC en
  // est un, sans espace), on compacte la requête en une ligne avant envoi.
  body.append("query", query.replace(/\s+/g, " ").trim());
  let lastStatus = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Backoff exponentiel + jitter : le SMT bannit brièvement en cas de rafale.
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1) + Math.random() * 400);
    let res: Response;
    // Timeout dur par tentative : sans cela, une socket coupée (ex. mise en
    // veille du job) laisse le fetch pendre indéfiniment. AbortController borne
    // chaque essai ; l'échec bascule sur le retry/backoff.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      res = await fetch(SPARQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/sparql-results+json",
        },
        body,
        signal: ctrl.signal,
      });
    } catch {
      continue; // erreur réseau / timeout : on retente
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const data = (await res.json()) as { results: { bindings: Binding[] } };
      return data.results.bindings;
    }
    lastStatus = res.status;
    // 4xx hors throttling (400 requête invalide, 404) : inutile de retenter.
    if (res.status >= 400 && res.status < 500 && res.status !== 403 && res.status !== 429) {
      break;
    }
  }
  throw new Error(`SPARQL HTTP ${lastStatus}`);
};

const cisFromUri = (uri: string): string | null => {
  const m = uri.match(/SpecialitePharmaceutique_(\d{8})/);
  return m ? m[1] : null;
};

// Agrège les lignes SPARQL (une par couple spécialité×substance×…) en un
// enregistrement par spécialité. On agrège côté JS plutôt qu'en SPARQL :
// le WAF du SMT rejette GROUP_CONCAT avec certains séparateurs (ex. « | »).
const aggregate = (rows: Binding[]): RuimRecord[] => {
  const map = new Map<
    string,
    { label: string; atc: Set<string>; lib: Set<string>; sub: Set<string> }
  >();
  for (const b of rows) {
    const uri = b.s?.value;
    if (!uri) continue;
    let e = map.get(uri);
    if (!e) {
      e = { label: b.label?.value ?? "", atc: new Set(), lib: new Set(), sub: new Set() };
      map.set(uri, e);
    }
    if (b.atc?.value) e.atc.add(b.atc.value);
    if (b.lib?.value) e.lib.add(b.lib.value);
    if (b.subst?.value) e.sub.add(b.subst.value);
  }
  const out: RuimRecord[] = [];
  for (const [uri, e] of map) {
    const cis = cisFromUri(uri);
    if (!cis) continue;
    out.push({
      cis,
      uri,
      label: e.label,
      atcCodes: [...e.atc],
      libelleAtc: e.lib.size ? [...e.lib].join(", ") : null,
      substances: [...e.sub],
    });
  }
  return out;
};

/** Curseur de pagination = plus grand URI de spécialité d'une page. */
export const cursorOf = (records: RuimRecord[]): string =>
  records.reduce((max, r) => (r.uri > max ? r.uri : max), "");

/**
 * Récupère une page de spécialités actives du RUIM par **pagination keyset**
 * (`?s > after`) et non par OFFSET : le SMT renvoie une erreur 500 sur les
 * OFFSET profonds (> ~10 000), alors que le keyset est à coût constant quelle
 * que soit la profondeur. La pagination porte sur un sous-SELECT DISTINCT ?s
 * (donc par spécialité, sans coupure), puis on ramène les détails et on agrège
 * en JS. `after` est l'URI de la dernière spécialité de la page précédente
 * (chaîne vide pour la première page). `mode` choisit la population : celles qui
 * portent un codeATC, ou celles qui n'en portent pas mais ont une substance
 * active (pour détecter les ATC manquants côté RUIM).
 *
 * L'appelant fait avancer le curseur via `cursorOf(records)` ; une page de
 * moins de `limit` spécialités signale la fin.
 */
export const fetchRuimPage = async (
  after: string,
  limit: number,
  mode: RuimMode = "with-atc",
): Promise<RuimRecord[]> => {
  const inner =
    mode === "with-atc"
      ? `?s ansm:codeATC ?a .`
      : `FILTER NOT EXISTS { ?s ansm:codeATC ?a }
       ?s ansm:seComposeDe ?cf . ?cf ansm:substanceActive ?sf .`;
  const detail =
    mode === "with-atc"
      ? `?s ansm:codeATC ?atc .
  OPTIONAL { ?s ansm:libelleATC ?lib }`
      : ``;
  const cursor = after ? ` FILTER(STR(?s) > ${JSON.stringify(after)})` : ``;

  const query = `PREFIX ansm: <http://data.esante.gouv.fr/ansm/medicament/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?s ?label ?atc ?lib ?subst WHERE {
  { SELECT DISTINCT ?s WHERE {
      ${inner}
      FILTER NOT EXISTS { ?s ansm:dateFin ?df }${cursor}
  } ORDER BY ?s LIMIT ${limit} }
  ?s rdfs:label ?label .
  ${detail}
  OPTIONAL { ?s ansm:seComposeDe ?c . ?c ansm:substanceActive ?su .
             ?su rdfs:label ?subst . }
}`;
  return aggregate(await sparql(query));
};

/** Récupère toutes les spécialités RUIM portant un codeATC donné. */
export const fetchRuimByAtc = async (atc: string): Promise<RuimRecord[]> => {
  const query = `PREFIX ansm: <http://data.esante.gouv.fr/ansm/medicament/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?s ?label ?atc ?lib ?subst WHERE {
  { SELECT DISTINCT ?s WHERE {
      ?s ansm:codeATC "${atc}" .
      FILTER NOT EXISTS { ?s ansm:dateFin ?df }
  } ORDER BY ?s LIMIT 1000 }
  ?s rdfs:label ?label .
  ?s ansm:codeATC ?atc .
  OPTIONAL { ?s ansm:libelleATC ?lib }
  OPTIONAL { ?s ansm:seComposeDe ?c . ?c ansm:substanceActive ?su .
             ?su rdfs:label ?subst . }
}`;
  return aggregate(await sparql(query));
};

/**
 * Résout le(s) libellé(s) OMS (fr + en) d'une liste de codes ATC. Sert à
 * trancher « qui a raison » en confrontant le libellé du code à la substance.
 * Requête groupée (VALUES) et chunkée pour rester bon marché.
 */
export const fetchWhoLabels = async (
  codes: string[],
): Promise<Map<string, string[]>> => {
  const map = new Map<string, string[]>();
  const uniq = [...new Set(codes)].filter(Boolean);
  const CHUNK = 150;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    const values = slice.map((c) => `<${ATC_BASE}${c}>`).join(" ");
    const query = `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?c ?l WHERE { VALUES ?c { ${values} } ?c rdfs:label ?l . }`;
    const rows = await sparql(query);
    for (const b of rows) {
      const code = b.c!.value.slice(ATC_BASE.length);
      const arr = map.get(code) ?? [];
      arr.push(b.l!.value);
      map.set(code, arr);
    }
  }
  return map;
};

// ---------------------------------------------------------------------------
// RCP (BDPM) — récupération + extraction de l'ATC en texte libre
// ---------------------------------------------------------------------------

// Code ATC de niveau 5 (ex. M01AE03) tolérant à des espaces internes : le RCP
// écrit parfois « L02B G03 » ou « M01 AE 01 ». On reconstitue sans espaces.
const ATC_LOOSE_RE = /([A-Z])\s?(\d)\s?(\d)\s?([A-Z])\s?([A-Z])\s?(\d)\s?(\d)/g;

const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

/**
 * Extrait les codes ATC exposés dans le texte du RCP. Ne retient comme `codes`
 * que les codes ATC **de niveau 5** valides (ex. M01AE03) apparaissant à
 * proximité (≤ 90 caractères) d'une mention « ATC », pour éviter les faux
 * positifs. `hasAtcMention` distingue « aucune mention ATC » de « classe citée
 * sans code exploitable ». `atcContext` capture le texte brut suivant la
 * première mention « code ATC : » — utile quand le RCP ne donne qu'un code
 * partiel/typo (« N02B », « M0AE01 /N02B ») ou un simple libellé de classe.
 */
export const extractAtcFromRcp = (
  html: string,
): { codes: string[]; hasAtcMention: boolean; atcContext: string | null } => {
  const text = stripHtml(html);
  const codes: string[] = [];
  for (const m of text.matchAll(/ATC/gi)) {
    const window = text.slice(m.index, m.index + 90);
    for (const c of window.matchAll(ATC_LOOSE_RE)) {
      const code = (c[1] + c[2] + c[3] + c[4] + c[5] + c[6] + c[7]).toUpperCase();
      if (!codes.includes(code)) codes.push(code);
    }
  }
  let atcContext: string | null = null;
  const cm = text.match(/code[s]?\s*ATC\s*[:\-]?\s*([^.]{1,60})/i);
  if (cm) {
    atcContext =
      cm[1]
        .replace(/\s+/g, " ")
        .replace(/\s*(Ce m[ée]dicament|Il est indiqu[ée]|Classe pharmac).*$/i, "")
        .trim() || null;
  }
  return { codes, hasAtcMention: /code[s]?\s*ATC/i.test(text), atcContext };
};

type RcpFetch = { text: string | null; available: boolean };

/**
 * Télécharge le RCP en suivant les redirections, en ignorant le certificat
 * incomplet de la BDPM, et en **abandonnant dès qu'un code ATC est capturé**
 * (le code figure en général dès la rubrique 1) — ce qui économise l'essentiel
 * de la bande passante sur les cas concordants. Plafond dur `maxBytes` sinon.
 */
const fetchRcpText = (
  url: string,
  maxBytes = 600_000,
  timeoutMs = 15_000,
  redirects = 5,
): Promise<RcpFetch> =>
  new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const opts = url.startsWith("https")
      ? { rejectUnauthorized: false, timeout: timeoutMs }
      : { timeout: timeoutMs };

    const req = mod.get(url, opts, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
        res.destroy();
        const next = new URL(res.headers.location, url).toString();
        resolve(fetchRcpText(next, maxBytes, timeoutMs, redirects - 1));
        return;
      }
      if (status >= 400) {
        res.destroy();
        resolve({ text: null, available: false });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let lastCheck = 0;
      let done = false;
      const finish = (text: string | null) => {
        if (done) return;
        done = true;
        res.destroy();
        resolve({ text, available: true });
      };
      res.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        size += chunk.length;
        // Abandon anticipé : dès qu'un code ATC est capté, inutile de continuer.
        if (size - lastCheck >= 16_384) {
          lastCheck = size;
          const partial = Buffer.concat(chunks).toString("utf-8");
          if (extractAtcFromRcp(partial).codes.length > 0) return finish(partial);
        }
        if (size >= maxBytes) finish(Buffer.concat(chunks).toString("utf-8"));
      });
      res.on("end", () => finish(Buffer.concat(chunks).toString("utf-8")));
      res.on("error", () => finish(chunks.length ? Buffer.concat(chunks).toString("utf-8") : null));
    });
    req.on("error", () => resolve({ text: null, available: false }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ text: null, available: false });
    });
  });

// ---------------------------------------------------------------------------
// Normalisation substance / libellé + verdict déterministe
// ---------------------------------------------------------------------------

// Sels et formes retirés avant comparaison substance ↔ libellé ATC.
const SALTS = new Set([
  "sodique", "sodium", "potassique", "potassium", "calcique", "calcium",
  "magnesium", "magnesique", "chlorhydrate", "hydrochloride", "dichlorhydrate",
  "sulfate", "hydrogenosulfate", "maleate", "tartrate", "citrate", "fumarate",
  "besilate", "besylate", "mesilate", "mesylate", "succinate", "acetate",
  "phosphate", "diphosphate", "nitrate", "bromure", "chlorure", "iodure",
  "base", "anhydre", "monohydrate", "dihydrate", "trihydrate", "hemihydrate",
  "pentahydrate", "micronise", "micronisee", "arginine", "lysine", "trometamol",
  "diethylamine", "ethanolamine", "de", "d", "et", "l", "acide",
]);

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripSalts = (n: string): string =>
  n.split(" ").filter((w) => w.length > 2 && !SALTS.has(w)).join(" ").trim();

/**
 * Un libellé ATC est « cohérent » avec la substance si, une fois normalisés et
 * débarrassés des sels, l'un contient l'autre. On teste les libellés fr ET en
 * (« ibuprofen »/« ibuprofène ») contre chaque substance (associations).
 */
const consistent = (atcLabels: string[], substances: string[]): boolean => {
  const subs = substances.map((s) => stripSalts(norm(s))).filter(Boolean);
  const labs = atcLabels.map((l) => stripSalts(norm(l))).filter(Boolean);
  if (!subs.length || !labs.length) return false;
  return labs.some((l) => subs.some((s) => s.includes(l) || l.includes(s)));
};

/** Confronte un enregistrement RUIM à l'extraction RCP et catégorise. */
export const classify = (
  rec: RuimRecord,
  rcpCodes: string[],
  rcpHasMention: boolean,
  rcpAvailable: boolean,
  whoLabelOf: (code: string) => string[],
  rcpContext: string | null = null,
): { category: AtcCategory; verdict: Verdict; detail: string } => {
  const ruim = rec.atcCodes;
  const ruimHas = ruim.length > 0;
  const rcpHas = rcpCodes.length > 0;

  if (!rcpAvailable) {
    return {
      category: ruimHas ? "RCP_INCOMPLET" : "VIDE",
      verdict: null,
      detail: "RCP indisponible (document introuvable sur la BDPM)",
    };
  }

  if (ruimHas && rcpHas) {
    const eq =
      ruim.length === rcpCodes.length && ruim.every((c) => rcpCodes.includes(c));
    if (eq) {
      return {
        category: "GREEN",
        verdict: null,
        detail: `ATC concordant : ${ruim.join(", ")}`,
      };
    }
    const ruimLabels = [
      ...ruim.flatMap(whoLabelOf),
      ...(rec.libelleAtc ? [rec.libelleAtc] : []),
    ];
    const rcpLabels = rcpCodes.flatMap(whoLabelOf);
    const ruimOk = consistent(ruimLabels, rec.substances);
    const rcpOk = consistent(rcpLabels, rec.substances);
    let verdict: Verdict = "INDETERMINE";
    if (ruimOk && !rcpOk) verdict = "RUIM";
    else if (rcpOk && !ruimOk) verdict = "RCP";
    else if (ruimOk && rcpOk) verdict = "AMBIGU";
    const say =
      verdict === "RCP"
        ? "le RCP a raison, code RUIM erroné"
        : verdict === "RUIM"
          ? "le RUIM a raison, code RCP erroné"
          : verdict === "AMBIGU"
            ? "les deux codes cohérents avec la substance (association ?)"
            : "à trancher manuellement";
    return {
      category: "INCOHERENCE",
      verdict,
      detail: `RUIM=${ruim.join(",")} (${rec.libelleAtc ?? "?"}) vs RCP=${rcpCodes.join(",")} — substance=${rec.substances.join(" + ") || "?"} → ${say}`,
    };
  }

  if (ruimHas && !rcpHas) {
    return {
      category: "RCP_INCOMPLET",
      verdict: null,
      detail: rcpHasMention
        ? `RCP sans code ATC de niveau 5 exploitable${rcpContext ? ` (cite « ${rcpContext} »)` : ""} ; RUIM=${ruim.join(",")}`
        : `RCP sans mention de code ATC ; RUIM=${ruim.join(",")}`,
    };
  }

  if (!ruimHas && rcpHas) {
    return {
      category: "RUIM_INCOMPLET",
      verdict: null,
      detail: `RUIM sans codeATC ; RCP=${rcpCodes.join(",")}`,
    };
  }

  return {
    category: "VIDE",
    verdict: null,
    detail: "Aucun code ATC ni côté RUIM ni côté RCP",
  };
};

// ---------------------------------------------------------------------------
// Pool de parallélisme borné
// ---------------------------------------------------------------------------

const pool = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onDone?: (result: R, done: number, total: number) => void,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;
  const run = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
      done++;
      onDone?.(results[i], done, items.length);
    }
  };
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, run));
  return results;
};

// ---------------------------------------------------------------------------
// Audit d'un lot d'enregistrements RUIM
// ---------------------------------------------------------------------------

/**
 * Audite un lot de spécialités : télécharge chaque RCP en parallèle (pool
 * borné), extrait l'ATC, résout les libellés OMS nécessaires au verdict, puis
 * catégorise. `onResult` permet le streaming au fil de l'eau.
 */
export const auditRecords = async (
  records: RuimRecord[],
  concurrency = 24,
  onResult?: (r: AuditResult) => void,
): Promise<AuditResult[]> => {
  // 1) Télécharger + extraire les RCP en parallèle.
  const extracted = await pool(
    records,
    concurrency,
    async (rec) => {
      const { text, available } = await fetchRcpText(rcpUrl(rec.cis));
      const { codes, hasAtcMention, atcContext } =
        text !== null
          ? extractAtcFromRcp(text)
          : { codes: [], hasAtcMention: false, atcContext: null };
      return { available, codes, hasAtcMention, atcContext };
    },
  );

  // 2) Résoudre en une passe les libellés OMS de tous les codes croisés
  //    (seuls les codes des cas potentiellement incohérents sont nécessaires,
  //    mais on résout large : c'est une unique requête groupée, bon marché).
  const allCodes = new Set<string>();
  records.forEach((r) => r.atcCodes.forEach((c) => allCodes.add(c)));
  extracted.forEach((e) => e.codes.forEach((c) => allCodes.add(c)));
  const whoLabels = await fetchWhoLabels([...allCodes]);
  const whoLabelOf = (code: string): string[] => whoLabels.get(code) ?? [];

  // 3) Catégoriser.
  return records.map((rec, i) => {
    const e = extracted[i];
    const { category, verdict, detail } = classify(
      rec,
      e.codes,
      e.hasAtcMention,
      e.available,
      whoLabelOf,
      e.atcContext,
    );
    const result: AuditResult = {
      cis: rec.cis,
      label: rec.label,
      substances: rec.substances,
      ruimAtc: rec.atcCodes,
      ruimLibelle: rec.libelleAtc,
      rcpAtc: e.codes,
      rcpAtcContext: e.atcContext,
      rcpHasAtcMention: e.hasAtcMention,
      rcpAvailable: e.available,
      category,
      verdict,
      detail,
      rcpUrl: rcpUrl(rec.cis),
    };
    onResult?.(result);
    return result;
  });
};

/** Audit ciblé d'un code ATC (console admin) : toutes ses spécialités RUIM. */
export const auditByAtc = async (
  atc: string,
  concurrency = 24,
): Promise<{ atc: string; results: AuditResult[]; summary: AuditSummary }> => {
  const records = await fetchRuimByAtc(atc);
  const results = await auditRecords(records, concurrency);
  return { atc, results, summary: summarize(results) };
};

// ---------------------------------------------------------------------------
// Agrégation
// ---------------------------------------------------------------------------

export const emptySummary = (): AuditSummary => ({
  total: 0,
  categories: {
    GREEN: 0,
    INCOHERENCE: 0,
    RCP_INCOMPLET: 0,
    RUIM_INCOMPLET: 0,
    VIDE: 0,
  },
  verdicts: { RCP: 0, RUIM: 0, AMBIGU: 0, INDETERMINE: 0 },
});

export const tally = (summary: AuditSummary, r: AuditResult): void => {
  summary.total++;
  summary.categories[r.category]++;
  if (r.verdict) summary.verdicts[r.verdict]++;
};

export const summarize = (results: AuditResult[]): AuditSummary => {
  const s = emptySummary();
  for (const r of results) tally(s, r);
  return s;
};

/** Nombre total de spécialités actives à auditer pour un mode donné. */
export const countRuim = async (mode: RuimMode = "with-atc"): Promise<number> => {
  const clause =
    mode === "with-atc"
      ? `?s ansm:codeATC ?atc .`
      : `FILTER NOT EXISTS { ?s ansm:codeATC ?atc }
         ?s ansm:seComposeDe ?cf . ?cf ansm:substanceActive ?sf .`;
  const query = `PREFIX ansm: <http://data.esante.gouv.fr/ansm/medicament/>
SELECT (COUNT(DISTINCT ?s) AS ?n) WHERE {
  ${clause}
  FILTER NOT EXISTS { ?s ansm:dateFin ?dateFin }
}`;
  const rows = await sparql(query);
  return Number(rows[0]?.n?.value ?? 0);
};
