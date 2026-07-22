import { type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/adminAuth";
import formatQuery from "@/lib/formatQuery";
import {
  auditByAtc,
  auditRecords,
  emptySummary,
  fetchRuimPage,
  tally,
  type AuditResult,
  type RuimMode,
} from "@/lib/auditAtc";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Un audit complet est long : on ne fige pas la réponse (pas de cache/SSG).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * API d'audit ATC — confronte le code ATC structuré du RUIM au code ATC en
 * texte libre du RCP BDPM, et catégorise chaque spécialité.
 *
 *  - GET /api/audit?atc=CODE
 *      Audit ciblé d'un code ATC : toutes ses spécialités RUIM, avec le verdict
 *      « qui a raison » sur les incohérences. Réponse JSON agrégée (bornée).
 *
 *  - GET /api/audit?all=1&offset=0&limit=500[&mode=with-atc|without-atc]
 *      Audit d'une page de la base entière, renvoyée en NDJSON streamé (une
 *      ligne meta, puis une ligne par spécialité, puis une ligne summary). Le
 *      client pagine en incrémentant offset ; c'est ce que fait le script CLI.
 *
 * `concurrency` (défaut 24) borne le parallélisme des téléchargements de RCP.
 * Protégé par ADMIN_TOKEN si défini (en-tête x-admin-token ou ?token=).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return json({ error: "Non autorisé (ADMIN_TOKEN requis)." }, 401);
  }

  const params = request.nextUrl.searchParams;
  const concurrency = Math.min(
    64,
    Math.max(1, Number(params.get("concurrency")) || 24),
  );

  // --- Mode ciblé : un code ATC ---
  const atcParam = params.get("atc");
  if (atcParam !== null) {
    const atc = formatQuery(atcParam);
    try {
      const out = await auditByAtc(atc, concurrency);
      return json({ mode: "audit-atc", ...out });
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : String(e), atc },
        502,
      );
    }
  }

  // --- Mode base entière : une page, streamée en NDJSON ---
  if (params.get("all") !== null) {
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const limit = Math.min(1000, Math.max(1, Number(params.get("limit")) || 500));
    const mode: RuimMode =
      params.get("mode") === "without-atc" ? "without-atc" : "with-atc";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const line = (obj: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        try {
          const records = await fetchRuimPage(offset, limit, mode);
          line({ type: "meta", offset, limit, mode, count: records.length });
          const summary = emptySummary();
          await auditRecords(records, concurrency, (r: AuditResult) => {
            tally(summary, r);
            line({ type: "result", ...r });
          });
          line({ type: "summary", offset, mode, summary });
        } catch (e) {
          line({ type: "error", error: e instanceof Error ? e.message : String(e) });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return json(
    {
      error:
        "Paramètre requis : ?atc=CODE (audit ciblé) ou ?all=1&offset=&limit= (page NDJSON).",
    },
    400,
  );
}
