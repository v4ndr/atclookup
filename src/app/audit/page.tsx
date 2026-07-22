import type { Metadata } from "next";
import AuditReport, { type AuditData } from "./AuditReport";
import auditData from "./audit-data.json";

export const metadata: Metadata = {
  title: "Audit ATC — RCP (BDPM) vs RUIM (SMT) | ATC Lookup",
  description:
    "Rapport d'audit confrontant le code ATC structuré du RUIM au code ATC en texte libre des RCP de la BDPM, sur l'ensemble des spécialités actives.",
};

/**
 * Rapport d'audit ATC statique, servi à /audit. Les données sont figées dans
 * audit-data.json (produit par scripts/audit-atc.ts, post-traité par relation
 * hiérarchique ATC). Pour rafraîchir : relancer l'audit puis régénérer le JSON.
 */
export default function AuditPage() {
  return <AuditReport data={auditData as AuditData} />;
}
