"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { DosageTrace, ExplainTrace, NormalizationStep } from "@/types/global";

const TOKEN_KEY = "atclookup-admin-token";

// ---------------------------------------------------------------------------
// Petits composants de présentation
// ---------------------------------------------------------------------------

const Section = ({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => (
  <details open={defaultOpen} className="rounded-lg border border-border">
    <summary className="cursor-pointer list-none px-4 py-3 font-semibold flex items-center gap-2 [&::-webkit-details-marker]:hidden">
      <span className="transition-transform [[open]>&]:rotate-90 text-muted-foreground">
        ▸
      </span>
      {title}
      {count !== undefined && (
        <span className="text-sm font-normal text-muted-foreground">
          ({count})
        </span>
      )}
    </summary>
    <div className="px-4 pb-4">{children}</div>
  </details>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-[family-name:var(--font-geist-mono)] leading-relaxed">
    {children}
  </pre>
);

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="cursor-pointer"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "Copié ✓" : "Copier"}
    </Button>
  );
};

/** Rend une chaîne de transformations "avant → après" avec la règle appliquée. */
const StepChain = ({ steps }: { steps: NormalizationStep[] }) => {
  if (steps.length === 0)
    return (
      <p className="text-xs text-muted-foreground italic">
        Aucune transformation — la valeur brute est déjà normalisée.
      </p>
    );
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="text-xs flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
          <code className="rounded bg-muted px-1.5 py-0.5">{s.before}</code>
          <span className="text-muted-foreground">→</span>
          <code className="rounded bg-emerald-500/15 px-1.5 py-0.5">
            {s.after}
          </code>
          <span className="text-muted-foreground italic">{s.rule}</span>
        </li>
      ))}
    </ol>
  );
};

const DosageTraceView = ({ trace }: { trace: DosageTrace }) => (
  <div className="rounded-md border border-border p-3 space-y-2">
    <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
      <span>
        <span className="text-muted-foreground">quantité&nbsp;: </span>
        <code className="rounded bg-muted px-1.5 py-0.5">
          {trace.rawQuantite}
        </code>
      </span>
      {trace.rawReference && (
        <span>
          <span className="text-muted-foreground">référence&nbsp;: </span>
          <code className="rounded bg-muted px-1.5 py-0.5">
            {trace.rawReference}
          </code>
        </span>
      )}
      <span>
        <span className="text-muted-foreground">résultat&nbsp;: </span>
        <code className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold">
          {trace.result}
        </code>
      </span>
    </div>
    <StepChain steps={trace.steps} />
  </div>
);

// ---------------------------------------------------------------------------
// Bac à sable de normalisation (sans appel réseau au SMT)
// ---------------------------------------------------------------------------

const NormalizerPlayground = ({
  token,
}: {
  token: string;
}) => {
  const [dosage, setDosage] = useState("1,50 g");
  const [reference, setReference] = useState("pour 100 g");
  const [result, setResult] = useState<DosageTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams({ dosage });
    if (reference) params.set("reference", reference);
    try {
      const res = await fetch(`/api/explain?${params}`, {
        headers: token ? { "x-admin-token": token } : {},
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Erreur ${res.status}`);
        return;
      }
      setResult(body.normalization);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [dosage, reference, token]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Teste l&apos;algorithme de normalisation sur une valeur isolée, sans
        interroger le SMT. Utile pour déboguer une règle de parsing.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={dosage}
          onChange={(e) => setDosage(e.target.value)}
          placeholder="Quantité (ex: 1,50 g)"
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Référence (ex: pour 100 g) — optionnel"
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <Button className="cursor-pointer shrink-0" onClick={run}>
          Normaliser
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && <DosageTraceView trace={result} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [atc, setAtc] = useState("");
  const [trace, setTrace] = useState<ExplainTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem(TOKEN_KEY) ?? "");
  }, []);

  const onTokenChange = (value: string) => {
    setToken(value);
    localStorage.setItem(TOKEN_KEY, value);
  };

  const search = useCallback(async () => {
    const code = atc.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    setError(null);
    setTrace(null);
    try {
      const res = await fetch(
        `/api/explain?atc=${encodeURIComponent(code)}`,
        { headers: token ? { "x-admin-token": token } : {} },
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Erreur ${res.status}`);
        return;
      }
      setTrace(body.trace as ExplainTrace);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [atc, token]);

  return (
    <main className="w-full max-w-[1100px] px-6 py-8 sm:py-12 space-y-6 font-[family-name:var(--font-geist-sans)]">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">ATC Lookup — Console d&apos;explicabilité</h1>
        <p className="text-sm text-muted-foreground">
          Trace le pipeline complet SMT → normalisation → regroupement pour un
          code ATC. Réservé aux administrateurs.
        </p>
      </header>

      {/* Token admin */}
      <div className="rounded-lg border border-border p-4 space-y-2">
        <label className="text-sm font-medium">Token admin</label>
        <Input
          type="password"
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder="ADMIN_TOKEN (si configuré côté serveur)"
        />
        <p className="text-xs text-muted-foreground">
          Envoyé via l&apos;en-tête <code>x-admin-token</code>. Laisser vide si
          aucun <code>ADMIN_TOKEN</code> n&apos;est configuré (accès ouvert en
          dev). Conservé dans ce navigateur uniquement.
        </p>
      </div>

      {/* Recherche par code ATC */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={atc}
          onChange={(e) => setAtc(e.target.value)}
          placeholder="Code ATC (ex: M01AE01, M01AE02, M01AE03)"
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <Button className="cursor-pointer shrink-0" onClick={search} disabled={loading}>
          {loading ? "Recherche…" : "Tracer"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {trace && (
        <div className="space-y-4">
          {/* Résumé SMT */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{trace.atc}</Badge>
            <Badge variant={trace.sparql.error ? "destructive" : "secondary"}>
              HTTP {trace.sparql.httpStatus ?? "—"}
            </Badge>
            <Badge variant="outline">{trace.sparql.durationMs} ms</Badge>
            <Badge variant="outline">{trace.sparql.bindingCount} bindings</Badge>
            <Badge variant="outline">{trace.specialites.length} spécialités</Badge>
            <Badge variant="outline">{trace.groups.length} groupes</Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {trace.timestamp}
            </span>
          </div>

          {trace.sparql.error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              Erreur SMT&nbsp;: {trace.sparql.error}
            </div>
          )}

          {/* Requête SPARQL */}
          <Section title="Requête SPARQL envoyée au SMT" defaultOpen={false}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-muted-foreground break-all">
                {trace.sparql.endpoint}
              </span>
              <CopyButton text={trace.sparql.query} />
            </div>
            <Mono>{trace.sparql.query}</Mono>
          </Section>

          {/* Groupes finaux */}
          <Section title="Groupes finaux (étape 2 — regroupement)" count={trace.groups.length}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-2 pr-3 font-medium">Substance</th>
                    <th className="py-2 pr-3 font-medium">Dosage</th>
                    <th className="py-2 pr-3 font-medium">Forme</th>
                    <th className="py-2 pr-3 font-medium">Voie</th>
                    <th className="py-2 pr-3 font-medium">RCP</th>
                    <th className="py-2 font-medium">Clé de regroupement</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.groups.map((g, i) => (
                    <tr key={i} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-3">{g.substance}</td>
                      <td className="py-2 pr-3 font-semibold">{g.dosage}</td>
                      <td className="py-2 pr-3">{g.forme}</td>
                      <td className="py-2 pr-3">{g.voie}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {g.specialites.length}
                      </td>
                      <td className="py-2">
                        <code className="text-[10px] break-all text-muted-foreground">
                          {g.key}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Spécialités + normalisation des dosages */}
          <Section
            title="Spécialités & normalisation des dosages (étape 1)"
            count={trace.specialites.length}
          >
            <div className="space-y-3">
              {trace.specialites.map((spe) => (
                <div
                  key={spe.uri}
                  className="rounded-md border border-border p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-sm">{spe.label}</span>
                    {spe.cis && (
                      <a
                        href={spe.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                      >
                        CIS {spe.cis}
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{spe.forme}</Badge>
                    {spe.voies.map((v) => (
                      <Badge key={v} variant="secondary">
                        {v}
                      </Badge>
                    ))}
                    {spe.substances.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </div>
                  {spe.dosages.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      Aucun dosage structuré (fallback sur le libellé au
                      regroupement).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {spe.dosages.map((d, i) => (
                        <DosageTraceView key={i} trace={d} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Bindings bruts */}
          <Section
            title="Bindings bruts (réponse SMT)"
            count={trace.rawBindings.length}
            defaultOpen={false}
          >
            <div className="flex justify-end mb-2">
              <CopyButton text={JSON.stringify(trace.rawBindings, null, 2)} />
            </div>
            <Mono>{JSON.stringify(trace.rawBindings, null, 2)}</Mono>
          </Section>
        </div>
      )}

      {/* Bac à sable de normalisation */}
      <Section title="Bac à sable — normalisation d'un dosage isolé">
        <NormalizerPlayground token={token} />
      </Section>
    </main>
  );
}
