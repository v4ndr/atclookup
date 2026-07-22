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
  verdict: "RCP" | "RUIM" | "AMBIGU" | "INDETERMINE" | null;
  relation: "divergence" | "ruim_parent" | "rcp_parent" | "egal";
  bucket: Bucket;
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
  rcpIncompletSample: {
    cis: string;
    label: string;
    ruimAtc: string[];
    ctx: string;
    rcpUrl: string;
  }[];
  rcpIncompletTotal: number;
};

// ---------------------------------------------------------------------------
// Métadonnées de présentation des catégories (buckets)
// ---------------------------------------------------------------------------
const BUCKETS: {
  key: Bucket;
  label: string;
  desc: string;
  tone: string; // classes de la pastille de comptage
}[] = [
  {
    key: "RUIM_ERREUR",
    label: "Erreur RUIM",
    desc: "Le RUIM pointe une substance différente de celle du médicament. Le RCP a raison — à corriger à la source (ANS/ANSM).",
    tone: "bg-destructive text-white",
  },
  {
    key: "RCP_ERREUR",
    label: "Erreur / typo RCP",
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
    label: "Granularité",
    desc: "Le code RUIM est un parent (moins précis) du code RCP, ou l'inverse. Ce n'est pas une erreur de classe.",
    tone: "bg-muted text-muted-foreground",
  },
  {
    key: "MULTI",
    label: "Multi-codes",
    desc: "Les jeux de codes se recoupent partiellement (spécialités multi-codes / associations).",
    tone: "bg-muted text-muted-foreground",
  },
];

const verdictBadge = (v: Finding["verdict"]) => {
  if (v === "RCP") return { text: "RCP a raison", cls: "bg-destructive text-white" };
  if (v === "RUIM") return { text: "RUIM a raison", cls: "bg-amber-500 text-white dark:bg-amber-600" };
  if (v === "AMBIGU") return { text: "ambigu", cls: "bg-secondary text-secondary-foreground" };
  return { text: "indéterminé", cls: "bg-muted text-muted-foreground" };
};

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>
);

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------
export default function AuditReport({ data }: { data: AuditData }) {
  const [active, setActive] = useState<Bucket>("RUIM_ERREUR");
  const [query, setQuery] = useState("");

  const cat = data.summary.categories;
  const totalInc = data.findings.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.findings.filter((f) => {
      if (f.bucket !== active) return false;
      if (!q) return true;
      return (
        f.label.toLowerCase().includes(q) ||
        f.cis.includes(q) ||
        f.substances.some((s) => s.toLowerCase().includes(q)) ||
        f.ruimAtc.some((c) => c.toLowerCase().includes(q)) ||
        f.rcpAtc.some((c) => c.toLowerCase().includes(q)) ||
        (f.ruimLibelle ?? "").toLowerCase().includes(q)
      );
    });
  }, [data.findings, active, query]);

  const activeMeta = BUCKETS.find((b) => b.key === active)!;

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
          <strong className="text-foreground">structuré</strong> du RUIM (ANS)
          au code ATC en <strong className="text-foreground">texte libre</strong>{" "}
          du RCP publié par la BDPM. Le verdict « qui a raison » est déterministe
          (libellé OMS du code confronté à la substance active).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Base auditée : <strong className="text-foreground">{data.base.toLocaleString("fr-FR")}</strong>{" "}
          spécialités actives · généré le {data.generatedAt}
        </p>
      </header>

      {/* Cartes récap */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Concordantes" value={cat.GREEN ?? 0} sub="RUIM = RCP" tone="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Incohérences" value={totalInc} sub="codes différents" tone="text-destructive" />
        <StatCard label="RCP incomplet" value={cat.RCP_INCOMPLET ?? 0} sub="pas de code niveau 5" tone="text-amber-600 dark:text-amber-400" />
        <StatCard label="Erreurs RUIM" value={data.summary.buckets.RUIM_ERREUR} sub="à corriger à la source" tone="text-destructive" />
      </div>

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
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-accent"
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

      {/* Description du bucket actif + recherche */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">{activeMeta.desc}</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer (nom, substance, code, CIS)…"
          className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-72"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
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
            {filtered.map((f) => {
              const vb = verdictBadge(f.verdict);
              return (
                <tr key={f.cis} className="border-t border-border align-top hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <a
                      href={f.rcpUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {f.label}
                    </a>
                    <div className="text-xs text-muted-foreground">CIS {f.cis}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {f.substances.join(" + ") || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Code>{f.ruimAtc.join(", ") || "∅"}</Code>
                    {f.ruimLibelle && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{f.ruimLibelle}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Code>{f.rcpAtc.join(", ") || "∅"}</Code>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${vb.cls}`}>
                      {vb.text}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
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
        {filtered.length} spécialité{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}
        {" · "}clic sur le nom → RCP de la BDPM
      </p>

      {/* Annexe : RCP_INCOMPLET (motif texte libre) */}
      <details className="mt-10 rounded-lg border border-border">
        <summary className="cursor-pointer list-none px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
          <span className="mr-2 text-muted-foreground">▸</span>
          RCP incomplet — {data.rcpIncompletTotal.toLocaleString("fr-FR")} spécialités où le RCP ne
          donne pas de code ATC de niveau 5 (échantillon)
        </summary>
        <div className="border-t border-border px-4 py-3">
          <p className="mb-3 text-sm text-muted-foreground">
            Le RCP ne cite qu&rsquo;un libellé de classe, un code partiel (<Code>N02B</Code>) ou
            un code mal formé (<Code>M0AE01</Code>). Contexte brut capté après « code ATC : ».
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <tbody>
                {data.rcpIncompletSample.map((s) => (
                  <tr key={s.cis} className="border-t border-border align-top">
                    <td className="px-2 py-1.5">
                      <a href={s.rcpUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {s.label}
                      </a>
                    </td>
                    <td className="px-2 py-1.5"><Code>{s.ruimAtc.join(", ")}</Code></td>
                    <td className="px-2 py-1.5 text-muted-foreground">« {s.ctx} »</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        Méthode : moteur <Code>src/lib/auditAtc.ts</Code> · API <Code>/api/audit</Code> ·
        script <Code>scripts/audit-atc.ts</Code>. Verdict 100 % déterministe (regex +
        comparaison de chaînes normalisées, sels retirés), sans LLM.
      </footer>
    </div>
  );
}

const StatCard = ({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: string;
}) => (
  <div className="rounded-lg border border-border p-4">
    <div className={`text-2xl font-bold ${tone}`}>{value.toLocaleString("fr-FR")}</div>
    <div className="text-sm font-medium">{label}</div>
    <div className="text-xs text-muted-foreground">{sub}</div>
  </div>
);
