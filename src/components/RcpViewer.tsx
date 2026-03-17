"use client";

import { RcpSection } from "@/lib/scrapeRcp";

type RcpViewerProps = {
  name: string;
  sections: RcpSection[];
  sourceUrl: string;
  siblings: { label: string; url: string }[];
};

const ChevronIcon = () => (
  <svg
    className="size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const SectionContent = ({ html }: { html: string }) => {
  if (!html.trim()) return null;
  return (
    <div
      className="rcp-content prose prose-sm max-w-none py-2 text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const RcpViewer = ({ name, sections, sourceUrl, siblings }: RcpViewerProps) => {
  const sorted = [...siblings].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="w-full space-y-1">
      <style>{`
        .rcp-content .AmmAnnexeTitre3 {
          font-style: italic;
          text-decoration: underline;
          margin-top: 0.75rem;
        }
      `}</style>
      <div className="mb-6 border-b pb-4 text-xs text-muted-foreground space-y-2">
        <p>
          Ce contenu est issu du RCP de{" "}
          <a className="underline hover:text-foreground" href={sourceUrl}>
            {name || "cette specialite"}
          </a>
          , choisie de manière aléatoire parmi les {siblings.length} RCP
          identiques disponibles pour cette combinaison.{" "}
          <span className="italic">
            Source : Base de donnees publique des medicaments (BDPM)
          </span>
        </p>

        {sorted.length > 1 && (
          <details>
            <summary className="cursor-pointer list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
              <ChevronIcon />
              <span className="underline">
                Voir tous les RCP de cette combinaison ({sorted.length})
              </span>
            </summary>
            <ul className="pl-6 pt-1 space-y-1">
              {sorted.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {sections.map((section, i) => {
        const isClinique = section.title.includes("CLINIQUES");
        return (
          <details key={i} open={isClinique || undefined}>
            <summary className="cursor-pointer list-none flex items-center gap-2 py-2 font-semibold text-base [&::-webkit-details-marker]:hidden">
              <ChevronIcon />
              {section.title}
            </summary>
            <div className="pl-6">
              <SectionContent html={section.content} />
              {section.children.length > 0 && (
                <div className="space-y-1">
                  {section.children.map((child, j) => (
                    <details key={j}>
                      <summary className="cursor-pointer list-none flex items-center gap-2 py-1.5 font-medium text-sm [&::-webkit-details-marker]:hidden">
                        <ChevronIcon />
                        {child.title}
                      </summary>
                      <div className="pl-6">
                        <SectionContent html={child.content} />
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
};

export default RcpViewer;
