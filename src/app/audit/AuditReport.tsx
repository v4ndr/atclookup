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
};

// Ligne unifiée pour l'affichage (incohérences ET incomplétudes).
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
  side?: "RCP" | "RUIM";
};

type IncompletSide = "RUIM" | "RCP" | "BOTH";
const MAX_ROWS = 500;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
const norm = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const atcRegistryUrl = (code: string) =>
  `https://atcddd.fhi.no/atc_ddd_index/?code=${encodeURIComponent(code)}&showdescription=no`;

// ---------------------------------------------------------------------------
// Métadonnées de présentation des catégories (buckets)
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

const verdictBadge = (v: Finding["verdict"]) => {
  if (v === "RCP") return { text: "RCP OK", cls: "bg-destructive text-white" };
  if (v === "RUIM") return { text: "RUIM OK", cls: "bg-amber-500 text-white dark:bg-amber-600" };
  if (v === "AMBIGU") return { text: "ambigu", cls: "bg-secondary text-secondary-foreground" };
  return { text: "N/A", cls: "bg-muted text-muted-foreground" };
};

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
  const [active, setActive] = useState<Bucket>("RUIM_ERREUR");
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<IncompletSide>("RUIM");

  const cat = data.summary.categories;
  const bk = data.summary.buckets;
  const totalInc = data.findings.length;
  const cErreurs = (bk.RUIM_ERREUR ?? 0) + (bk.RCP_ERREUR ?? 0);
  const dAmbiguites = (bk.AMBIGU ?? 0) + (bk.INDETERMINE ?? 0) + (bk.MULTI ?? 0);
  const eIncomplets = bk.GRANULARITE ?? 0;
  const isIncomplet = active === "GRANULARITE";

  // Lignes RUIM-incomplet (issues des incohérences) et RCP-incomplet.
  const ruimIncompletRows: Row[] = useMemo(
    () =>
      data.findings
        .filter((f) => f.bucket === "GRANULARITE")
        .map((f) => ({ ...f, ctx: null, side: "RUIM" as const })),
    [data.findings],
  );
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
        side: "RCP" as const,
      })),
    [data.rcpIncomplets],
  );

  const rows: Row[] = useMemo(() => {
    if (isIncomplet) {
      if (side === "RUIM") return ruimIncompletRows;
      if (side === "RCP") return rcpIncompletRows;
      return [...ruimIncompletRows, ...rcpIncompletRows];
    }
    return data.findings
      .filter((f) => f.bucket === active)
      .map((f) => ({ ...f, ctx: null }));
  }, [isIncomplet, side, active, data.findings, ruimIncompletRows, rcpIncompletRows]);

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
        ].join(" "),
      ).includes(q),
    );
  }, [rows, query]);

  const shown = filtered.slice(0, MAX_ROWS);
  const activeMeta = BUCKETS.find((b) => b.key === active)!;

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
          <BigStat letter="A" label="Concordances" value={cat.GREEN ?? 0} tone="text-emerald-600 dark:text-emerald-400" />
          <BigStat letter="B" label="Incohérences" value={totalInc} tone="text-destructive" />
        </div>
        <div className="grid grid-cols-1 gap-3 border-l-2 border-border pl-3 sm:ml-6 sm:grid-cols-3">
          <SubStat letter="C" label="Erreurs" value={cErreurs} />
          <SubStat letter="D" label="Ambiguïtés" value={dAmbiguites} />
          <SubStat letter="E" label="Codes incomplets" value={eIncomplets} />
        </div>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Détail des {totalInc} incohérences</h2>

      {/* Onglets par bucket */}
      <div className="mb-4 flex flex-wrap gap-2">
        {BUCKETS.map((b) => {
          const n = data.summary.buckets[b.key] ?? 0;
          const on = active === b.key;
          return (
            <button
              key={b.key}
              onClick={() => setActive(b.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                on ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent"
              }`}
            >
              {b.label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${on ? "bg-background/20" : b.tone}`}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Description + recherche */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">{activeMeta.desc}</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer (nom, substance, code, CIS)…"
          className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-72"
        />
      </div>

      {/* Sous-filtre côté incomplet */}
      {isIncomplet && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-muted-foreground">Côté incomplet</span>
          {SIDE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSide(t.key)}
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

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Spécialité</th>
              <th className="px-3 py-2 font-medium">Substance</th>
              <th className="px-3 py-2 font-medium">RUIM</th>
              <th className="px-3 py-2 font-medium">RCP</th>
              <th className="px-3 py-2 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const vb = verdictBadge(r.verdict);
              return (
                <tr key={r.cis} className="border-t border-border align-top hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <a href={r.rcpUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                      {r.label}
                    </a>
                    <div className="text-xs text-muted-foreground">
                      CIS {r.cis}
                      {isIncomplet && side === "BOTH" && r.side && (
                        <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase">
                          {r.side} inc.
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <span className="block max-w-[14rem] truncate" title={r.substances.join(" + ")}>
                      {r.substances.join(" + ") || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <AtcCodes codes={r.ruimAtc} />
                    {r.ruimLibelle && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{r.ruimLibelle}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <AtcCodes codes={r.rcpAtc} />
                    {r.rcpLibelle && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{r.rcpLibelle}</div>
                    )}
                    {r.ctx && (
                      <div className="mt-0.5 max-w-[16rem] truncate text-xs text-muted-foreground" title={r.ctx}>
                        « {r.ctx} »
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${vb.cls}`}>
                      {vb.text}
                    </span>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Aucune spécialité pour ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {filtered.length.toLocaleString("fr-FR")} spécialité{filtered.length > 1 ? "s" : ""}
        {filtered.length > MAX_ROWS ? ` (affichage limité à ${MAX_ROWS} — affinez le filtre)` : ""}
        {" · "}clic sur le nom → RCP · clic sur un code → registre WHO ATC/DDD
      </p>
    </div>
  );
}

const Letter = ({ children }: { children: React.ReactNode }) => (
  <span className="text-xs font-semibold text-muted-foreground">{children}</span>
);

const BigStat = ({
  letter,
  label,
  value,
  tone,
}: {
  letter: string;
  label: string;
  value: number;
  tone: string;
}) => (
  <div className="rounded-lg border border-border p-4">
    <div className="flex items-baseline gap-2">
      <Letter>{letter}</Letter>
      <span className="text-sm font-medium">{label}</span>
    </div>
    <div className={`mt-1 text-2xl font-bold ${tone}`}>{value.toLocaleString("fr-FR")}</div>
  </div>
);

const SubStat = ({
  letter,
  label,
  value,
}: {
  letter: string;
  label: string;
  value: number;
}) => (
  <div className="rounded-lg border border-border p-3">
    <div className="flex items-baseline gap-2">
      <Letter>{letter}</Letter>
      <span className="text-sm">{label}</span>
    </div>
    <div className="mt-0.5 text-xl font-semibold">{value.toLocaleString("fr-FR")}</div>
  </div>
);
