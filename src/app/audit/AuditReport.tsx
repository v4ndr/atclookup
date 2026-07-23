"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types (miroir de audit-data.json)
// ---------------------------------------------------------------------------
type Bucket =
  | "RUIM_ERREUR"
  | "RCP_ERREUR"
  | "AMBIGU"
  | "INDETERMINE"
  | "GRANULARITE"
  | "MULTI";

type Finding = {
  cis: string;
  label: string;
  substances: string[];
  ruimAtc: string[];
  ruimLibelle: string | null;
  rcpAtc: string[];
  rcpLibelle: string | null;
  verdict: "RCP" | "RUIM" | "AMBIGU" | "INDETERMINE" | null;
  relation: "divergence" | "ruim_parent" | "rcp_parent" | "egal";
  bucket: Bucket;
  rcpUrl: string;
};

type RcpIncomplet = {
  cis: string;
  label: string;
  substances: string[];
  ruimAtc: string[];
  ruimLibelle: string | null;
  ctx: string | null;
  rcpUrl: string;
};

// Spécialité active dont le RUIM ne porte aucun code ATC et dont le RCP n'en
// donne pas non plus (invérifiable). Celles dont le RCP donne un code sont
// reclassées « Erreur RUIM » côté données.
type RuimSansCode = {
  cis: string;
  label: string;
  substances: string[];
  ctx: string | null;
  rcpAvailable: boolean;
  rcpUrl: string;
};

export type AuditData = {
  generatedAt: string;
  base: number;
  summary: {
    categories: Record<string, number>;
    verdicts: Record<string, number>;
    buckets: Record<Bucket, number>;
  };
  findings: Finding[];
  rcpIncomplets: RcpIncomplet[];
  ruimSansCode: RuimSansCode[];
};

// Ligne unifiée pour l'affichage.
type Row = {
  cis: string;
  label: string;
  substances: string[];
  ruimAtc: string[];
  ruimLibelle: string | null;
  rcpAtc: string[];
  rcpLibelle: string | null;
  ctx: string | null;
  verdict: Finding["verdict"];
  rcpUrl: string;
  catLabel: string;
  bucket?: Bucket;
  side?: "RCP" | "RUIM";
};

type Tab = Bucket | "TOUT" | "SANS_CODE";
type IncompletSide = "RUIM" | "RCP" | "BOTH";
const PER_PAGE = 50;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
const norm = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const atcRegistryUrl = (code: string) =>
  `https://atcddd.fhi.no/atc_ddd_index/?code=${encodeURIComponent(code)}&showdescription=no`;

// ---------------------------------------------------------------------------
// Métadonnées des catégories
// ---------------------------------------------------------------------------
const BUCKETS: { key: Bucket; label: string; desc: string; tone: string }[] = [
  {
    key: "RUIM_ERREUR",
    label: "Erreur RUIM",
    desc: "Le RUIM pointe une substance différente de celle du médicament. Le RCP a raison — à corriger à la source (ANS/ANSM).",
    tone: "bg-destructive text-white",
  },
  {
    key: "RCP_ERREUR",
    label: "Erreur RCP",
    desc: "Le code du RCP est erroné ou mal saisi ; le RUIM est cohérent avec la substance.",
    tone: "bg-amber-500 text-white dark:bg-amber-600",
  },
  {
    key: "AMBIGU",
    label: "Ambigu",
    desc: "Les deux codes sont cohérents avec la (les) substance(s) — le plus souvent des associations. Revue humaine.",
    tone: "bg-secondary text-secondary-foreground",
  },
  {
    key: "INDETERMINE",
    label: "Indéterminé",
    desc: "Aucun des deux codes ne correspond clairement à la substance, ou substance inconnue. À trancher manuellement.",
    tone: "bg-muted text-muted-foreground",
  },
  {
    key: "GRANULARITE",
    label: "Codes incomplets",
    desc: "Un côté ne donne pas de code ATC complet (niveau 5). Filtrer selon le côté incomplet.",
    tone: "bg-muted text-muted-foreground",
  },
  {
    key: "MULTI",
    label: "Multi-codes RCP",
    desc: "",
    tone: "bg-muted text-muted-foreground",
  },
];

const bucketLabel = Object.fromEntries(BUCKETS.map((b) => [b.key, b.label])) as Record<Bucket, string>;

const RCP_INCOMPLET_LABEL = "RCP incomplet";
const PAS_DE_CODE_LABEL = "Pas de code ATC";
const catTone = (label: string): string => {
  const b = BUCKETS.find((x) => x.label === label);
  if (b) return b.tone;
  if (label === RCP_INCOMPLET_LABEL) return "bg-amber-500/80 text-white dark:bg-amber-600";
  return "bg-muted text-muted-foreground";
};

const verdictBadge = (v: Finding["verdict"]) => {
  if (v === "RCP") return { text: "RCP OK", cls: "bg-destructive text-white" };
  if (v === "RUIM") return { text: "RUIM OK", cls: "bg-amber-500 text-white dark:bg-amber-600" };
  if (v === "AMBIGU") return { text: "ambigu", cls: "bg-secondary text-secondary-foreground" };
  return { text: "N/A", cls: "bg-muted text-muted-foreground" };
};

// Cellule responsive : libellé + valeur empilés en mobile, valeur seule (grille)
// en desktop.
const Cell = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:hidden">
      {label}
    </span>
    <div className="min-w-0">{children}</div>
  </div>
);

const AtcCodes = ({ codes }: { codes: string[] }) =>
  codes.length ? (
    <span className="inline-flex flex-wrap gap-1">
      {codes.map((c) => (
        <a
          key={c}
          href={atcRegistryUrl(c)}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:underline"
          title="Voir dans le registre WHO ATC/DDD"
        >
          {c}
        </a>
      ))}
    </span>
  ) : (
    <span className="font-mono text-xs text-muted-foreground">∅</span>
  );

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------
export default function AuditReport({ data }: { data: AuditData }) {
  const [active, setActive] = useState<Tab>("RUIM_ERREUR");
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<IncompletSide>("RUIM");
  const [page, setPage] = useState(0);

  const cat = data.summary.categories;
  const bk = data.summary.buckets;
  // Incohérences = tout ce qui n'est pas « ATC présent ET RUIM = RCP » (tout sauf
  // les concordances).
  const cErreurs = (bk.RUIM_ERREUR ?? 0) + (bk.RCP_ERREUR ?? 0);
  const dAmbiguites = (bk.AMBIGU ?? 0) + (bk.INDETERMINE ?? 0) + (bk.MULTI ?? 0);
  // « Codes incomplets » = code RUIM trop large (GRANULARITE) + RCP sans code niveau 5.
  const eIncomplets = (bk.GRANULARITE ?? 0) + data.rcpIncomplets.length;
  const fPasDeCode = data.ruimSansCode.length;
  const bIncoherences = cErreurs + dAmbiguites + eIncomplets + fPasDeCode;
  const isIncomplet = active === "GRANULARITE";

  // Toutes les lignes « incohérence » avec leur libellé de catégorie.
  const findingRows: Row[] = useMemo(
    () => data.findings.map((f) => ({ ...f, ctx: null, catLabel: bucketLabel[f.bucket], bucket: f.bucket })),
    [data.findings],
  );
  const granulariteRows = useMemo(
    () => findingRows.filter((r) => r.bucket === "GRANULARITE").map((r) => ({ ...r, side: "RUIM" as const })),
    [findingRows],
  );
  const ruimSansCodeRows: Row[] = useMemo(
    () =>
      data.ruimSansCode.map((r) => ({
        cis: r.cis,
        label: r.label,
        substances: r.substances,
        ruimAtc: [],
        ruimLibelle: null,
        rcpAtc: [],
        rcpLibelle: null,
        ctx: r.ctx,
        verdict: null,
        rcpUrl: r.rcpUrl,
        catLabel: PAS_DE_CODE_LABEL,
        side: "RUIM" as const,
      })),
    [data.ruimSansCode],
  );
  // Côté « RUIM incomplet » = uniquement les codes trop larges (GRANULARITE).
  const ruimIncompletRows = granulariteRows;
  const rcpIncompletRows: Row[] = useMemo(
    () =>
      data.rcpIncomplets.map((r) => ({
        cis: r.cis,
        label: r.label,
        substances: r.substances,
        ruimAtc: r.ruimAtc,
        ruimLibelle: r.ruimLibelle,
        rcpAtc: [],
        rcpLibelle: null,
        ctx: r.ctx,
        verdict: null,
        rcpUrl: r.rcpUrl,
        catLabel: RCP_INCOMPLET_LABEL,
        side: "RCP" as const,
      })),
    [data.rcpIncomplets],
  );

  const rows: Row[] = useMemo(() => {
    if (active === "TOUT") return [...findingRows, ...rcpIncompletRows, ...ruimSansCodeRows];
    if (active === "SANS_CODE") return ruimSansCodeRows;
    if (active === "GRANULARITE") {
      if (side === "RUIM") return ruimIncompletRows;
      if (side === "RCP") return rcpIncompletRows;
      return [...ruimIncompletRows, ...rcpIncompletRows];
    }
    return findingRows.filter((r) => r.bucket === active);
  }, [active, side, findingRows, ruimIncompletRows, rcpIncompletRows, ruimSansCodeRows]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return rows;
    return rows.filter((r) =>
      norm(
        [
          r.label,
          r.cis,
          r.substances.join(" "),
          r.ruimAtc.join(" "),
          r.rcpAtc.join(" "),
          r.ruimLibelle ?? "",
          r.rcpLibelle ?? "",
          r.ctx ?? "",
          r.catLabel,
        ].join(" "),
      ).includes(q),
    );
  }, [rows, query]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const cur = Math.min(page, pageCount - 1);
  const shown = filtered.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);

  const showCat = active === "TOUT";
  // Colonnes desktop (littéraux complets pour le JIT Tailwind) ; mobile = 1 colonne.
  const gridMd = showCat
    ? "md:grid-cols-[1.8fr_0.9fr_1.1fr_1.1fr_1.3fr_max-content]"
    : "md:grid-cols-[1.8fr_1.1fr_1.1fr_1.3fr_max-content]";
  const activeMeta =
    active === "TOUT"
      ? { desc: "Toutes les spécialités présentant un écart (incohérence, code incomplet ou absent)." }
      : active === "SANS_CODE"
        ? { desc: "Spécialités actives sans aucun code ATC exploitable, ni dans le RUIM ni dans le RCP BDPM." }
        : BUCKETS.find((b) => b.key === active)!;

  const TABS: { key: Tab; label: string; n: number; tone: string }[] = [
    { key: "TOUT", label: "Tout", n: findingRows.length + rcpIncompletRows.length + ruimSansCodeRows.length, tone: "bg-foreground/10" },
    ...BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      // « Codes incomplets » couvre RUIM-incomplet + RCP-incomplet (sous-filtres).
      n: b.key === "GRANULARITE" ? ruimIncompletRows.length + rcpIncompletRows.length : (bk[b.key] ?? 0),
      tone: b.tone,
    })),
    { key: "SANS_CODE", label: "Pas de code ATC", n: ruimSansCodeRows.length, tone: "bg-muted text-muted-foreground" },
  ];

  const SIDE_TABS: { key: IncompletSide; label: string; n: number }[] = [
    { key: "RUIM", label: "RUIM incomplet", n: ruimIncompletRows.length },
    { key: "RCP", label: "RCP incomplet", n: rcpIncompletRows.length },
    { key: "BOTH", label: "Les deux", n: ruimIncompletRows.length + rcpIncompletRows.length },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* En-tête */}
      <header className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Audit ATC — RCP (BDPM) vs RUIM (SMT)
          </h1>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← ATC Lookup
          </Link>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Confrontation, spécialité par spécialité, du code ATC{" "}
          <strong className="text-foreground">structuré</strong> du RUIM (ANS) au
          code ATC en <strong className="text-foreground">texte libre</strong> du
          RCP publié par la BDPM.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Base auditée :{" "}
          <strong className="text-foreground">{data.base.toLocaleString("fr-FR")}</strong>{" "}
          spécialités actives · généré le {data.generatedAt}
        </p>
      </header>

      {/* Stats hiérarchiques : B = C + D + E */}
      <div className="mb-8 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BigStat label="Concordances" value={cat.GREEN ?? 0} tone="text-emerald-600 dark:text-emerald-400" />
          <BigStat label="Incohérences" value={bIncoherences} tone="text-destructive" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SubStat label="Erreurs" value={cErreurs} />
          <SubStat label="Ambiguïtés" value={dAmbiguites} />
          <SubStat label="Codes incomplets" value={eIncomplets} />
          <SubStat label="Pas de code ATC" value={fPasDeCode} />
        </div>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Détail des {bIncoherences.toLocaleString("fr-FR")} incohérences</h2>

      {/* Onglets */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setActive(t.key); setPage(0); }}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                on ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent"
              }`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${on ? "bg-background/20" : t.tone}`}>
                {t.n.toLocaleString("fr-FR")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Description + recherche */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">{activeMeta.desc}</p>
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          placeholder="Filtrer (nom, substance, code, CIS)…"
          className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-72 sm:text-sm"
        />
      </div>

      {/* Sous-filtre côté incomplet */}
      {isIncomplet && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-muted-foreground">Côté incomplet</span>
          {SIDE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSide(t.key); setPage(0); }}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                side === t.key ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent"
              }`}
            >
              {t.label}
              <span className="opacity-70">{t.n.toLocaleString("fr-FR")}</span>
            </button>
          ))}
        </div>
      )}

      {/* Liste responsive : cartes empilées en mobile, grille type table en desktop */}
      <div
        key={`${active}|${side}`}
        className="space-y-3 text-sm md:space-y-0 md:overflow-hidden md:rounded-lg md:border md:border-border"
      >
        {/* En-tête (desktop uniquement) */}
        <div
          className={`hidden bg-muted/50 px-3 py-2 text-xs uppercase text-muted-foreground md:grid md:gap-3 ${gridMd}`}
        >
          <span>Spécialité</span>
          {showCat && <span>Catégorie</span>}
          <span>Substance</span>
          <span>RUIM</span>
          <span>RCP</span>
          <span>Verdict</span>
        </div>

        {shown.map((r) => {
          const vb = verdictBadge(r.verdict);
          return (
            <div
              key={r.cis}
              className={`grid grid-cols-1 gap-2 rounded-lg border border-border p-3 md:items-start md:gap-3 md:rounded-none md:border-0 md:border-t md:p-3 md:hover:bg-accent/40 ${gridMd}`}
            >
              <div className="min-w-0">
                <a href={r.rcpUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                  {r.label}
                </a>
                <div className="text-xs text-muted-foreground">
                  CIS {r.cis}
                  {isIncomplet && side === "BOTH" && r.side && (
                    <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase">{r.side} inc.</span>
                  )}
                </div>
              </div>
              {showCat && (
                <Cell label="Catégorie">
                  <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${catTone(r.catLabel)}`}>
                    {r.catLabel}
                  </span>
                </Cell>
              )}
              <Cell label="Substance">
                <span className="block text-muted-foreground md:max-w-[14rem] md:truncate" title={r.substances.join(" + ")}>
                  {r.substances.join(" + ") || "—"}
                </span>
              </Cell>
              <Cell label="RUIM">
                <AtcCodes codes={r.ruimAtc} />
                {r.ruimLibelle && <div className="mt-0.5 text-xs text-muted-foreground">{r.ruimLibelle}</div>}
              </Cell>
              <Cell label="RCP">
                <AtcCodes codes={r.rcpAtc} />
                {r.rcpLibelle && <div className="mt-0.5 text-xs text-muted-foreground">{r.rcpLibelle}</div>}
                {r.ctx && (
                  <div className="mt-0.5 text-xs text-muted-foreground md:max-w-[16rem] md:truncate" title={r.ctx}>
                    « {r.ctx} »
                  </div>
                )}
              </Cell>
              <Cell label="Verdict">
                <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${vb.cls}`}>{vb.text}</span>
              </Cell>
            </div>
          );
        })}

        {shown.length === 0 && (
          <div className="rounded-lg border border-border p-8 text-center text-muted-foreground md:rounded-none md:border-0 md:border-t">
            Aucune spécialité pour ce filtre.
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {total === 0
            ? "0 résultat"
            : `${(cur * PER_PAGE + 1).toLocaleString("fr-FR")}–${Math.min((cur + 1) * PER_PAGE, total).toLocaleString("fr-FR")} sur ${total.toLocaleString("fr-FR")}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={cur === 0}
            className="rounded-md border border-border px-2.5 py-1 hover:bg-accent disabled:opacity-40"
          >
            ← Précédent
          </button>
          <span>Page {cur + 1} / {pageCount}</span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={cur >= pageCount - 1}
            className="rounded-md border border-border px-2.5 py-1 hover:bg-accent disabled:opacity-40"
          >
            Suivant →
          </button>
        </div>
      </div>
    </div>
  );
}

const BigStat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) => (
  <div className="rounded-lg border border-border p-4">
    <span className="text-sm font-medium">{label}</span>
    <div className={`mt-1 text-2xl font-bold ${tone}`}>{value.toLocaleString("fr-FR")}</div>
  </div>
);

const SubStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-border p-3">
    <span className="text-sm">{label}</span>
    <div className="mt-0.5 text-xl font-semibold">{value.toLocaleString("fr-FR")}</div>
  </div>
);
