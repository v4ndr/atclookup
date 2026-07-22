/**
 * Audit ATC en batch de TOUTE la base — RCP BDPM vs RUIM.
 *
 *   node scripts/audit-atc.ts [options]
 *
 * (Node ≥ 22 exécute le TypeScript directement, sans build ni tsx.)
 *
 * Options :
 *   --mode=with-atc|without-atc|both   population auditée         (défaut with-atc)
 *   --concurrency=N                     RCP téléchargés en //      (défaut 24)
 *   --page=N                            taille de page SPARQL      (défaut 500)
 *   --max=N                             limite le nb de spécialités (test)
 *   --out=chemin                        NDJSON de sortie   (défaut atc-audit.ndjson)
 *   --only=INCOHERENCE,RCP_INCOMPLET    n'écrit que ces catégories dans le NDJSON
 *   --resume                            reprend là où le checkpoint s'est arrêté
 *
 * Sorties :
 *   - <out>            : une ligne JSON par spécialité (NDJSON), filtrable via --only
 *   - <out>.summary.json : tableau récapitulatif final par catégorie/verdict
 *   - <out>.checkpoint : dernier offset traité (pour --resume)
 *
 * Coût : aucune inférence. Le débit vient du pool borné et de l'abandon
 * anticipé du téléchargement des RCP (le code ATC est capté dès la rubrique 1).
 */
import fs from "node:fs";
import {
  auditRecords,
  countRuim,
  cursorOf,
  emptySummary,
  fetchRuimPage,
  tally,
  type AtcCategory,
  type AuditResult,
  type AuditSummary,
  type RuimMode,
  type RuimRecord,
} from "../src/lib/auditAtc.ts";

// --- Parsing des options ---------------------------------------------------
const argOf = (name: string, def: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const CONCURRENCY = Math.max(1, Number(argOf("concurrency", "24")));
const PAGE = Math.max(1, Number(argOf("page", "500")));
const MAX = Number(argOf("max", "0")) || Infinity;
const OUT = argOf("out", "atc-audit.ndjson");
const RESUME = hasFlag("resume");
const ONLY = new Set(
  argOf("only", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as AtcCategory[],
);
const MODES: RuimMode[] =
  argOf("mode", "with-atc") === "both"
    ? ["with-atc", "without-atc"]
    : argOf("mode", "with-atc") === "without-atc"
      ? ["without-atc"]
      : ["with-atc"];

const CKPT = `${OUT}.checkpoint`;
const SUMMARY_FILE = `${OUT}.summary.json`;

const log = (msg: string): void => process.stderr.write(msg + "\n");
const pct = (a: number, b: number): string =>
  b ? `${((100 * a) / b).toFixed(1)}%` : "—";

// --- Boucle principale -----------------------------------------------------
// Reprise : le checkpoint stocke { cursor, processed } (curseur keyset = URI de
// la dernière spécialité traitée, processed = compteur pour l'affichage %).
type Checkpoint = { cursor: string; processed: number };
const readCheckpoint = (): Checkpoint | null => {
  if (!RESUME || !fs.existsSync(CKPT)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(CKPT, "utf-8")) as Checkpoint;
    return typeof c.cursor === "string" ? c : null;
  } catch {
    return null;
  }
};

const run = async (): Promise<void> => {
  const resumed = readCheckpoint();
  const outStream = fs.createWriteStream(OUT, {
    flags: resumed ? "a" : "w",
  });

  const summary: AuditSummary = emptySummary();
  const t0 = Date.now();

  for (const mode of MODES) {
    const total = Math.min(await countRuim(mode), MAX);
    log(
      `\n▶ Mode ${mode} : ${total} spécialités actives ` +
        `(concurrency=${CONCURRENCY}, page=${PAGE})`,
    );

    // La reprise ne s'applique qu'au premier mode traité.
    let cursor = mode === MODES[0] && resumed ? resumed.cursor : "";
    let processed = mode === MODES[0] && resumed ? resumed.processed : 0;
    let fails = 0;
    while (processed < total) {
      let records: RuimRecord[];
      try {
        records = await fetchRuimPage(cursor, PAGE, mode);
        fails = 0;
      } catch (e) {
        if (++fails >= 6) {
          log(`  ✗ page abandonnée après ${fails} échecs (${(e as Error).message})`);
          throw e;
        }
        log(`  ! page en échec (${(e as Error).message}), retry ${fails}/6 dans 3s`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (records.length === 0) break;

      await auditRecords(records, CONCURRENCY, (r: AuditResult) => {
        tally(summary, r);
        if (ONLY.size === 0 || ONLY.has(r.category)) {
          outStream.write(JSON.stringify(r) + "\n");
        }
      });

      cursor = cursorOf(records) || cursor;
      processed += records.length;
      fs.writeFileSync(CKPT, JSON.stringify({ cursor, processed }));

      const el = (Date.now() - t0) / 1000;
      const rate = summary.total / Math.max(el, 0.001);
      log(
        `  ${processed}/${total} (${pct(processed, total)})  ` +
          `green=${summary.categories.GREEN} incoh=${summary.categories.INCOHERENCE} ` +
          `rcp∅=${summary.categories.RCP_INCOMPLET} ruim∅=${summary.categories.RUIM_INCOMPLET}  ` +
          `${rate.toFixed(1)}/s`,
      );

      if (records.length < PAGE) break; // dernière page
    }
  }

  await new Promise<void>((res) => outStream.end(res));
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  if (fs.existsSync(CKPT)) fs.rmSync(CKPT);

  // --- Récapitulatif lisible ---
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  log(`\n═══ Audit terminé en ${el}s — ${summary.total} spécialités ═══`);
  const cats: AtcCategory[] = [
    "GREEN",
    "INCOHERENCE",
    "RCP_INCOMPLET",
    "RUIM_INCOMPLET",
    "VIDE",
  ];
  for (const c of cats) {
    log(
      `  ${c.padEnd(15)} ${String(summary.categories[c]).padStart(6)}  ` +
        `${pct(summary.categories[c], summary.total)}`,
    );
  }
  log(
    `  Verdicts incohérences → RCP a raison=${summary.verdicts.RCP} ` +
      `RUIM a raison=${summary.verdicts.RUIM} ` +
      `ambigu=${summary.verdicts.AMBIGU} indéterminé=${summary.verdicts.INDETERMINE}`,
  );
  log(`\nDétails : ${OUT}\nRécap  : ${SUMMARY_FILE}`);
};

run().catch((e) => {
  log("ÉCHEC : " + (e instanceof Error ? e.stack ?? e.message : String(e)));
  process.exit(1);
});
