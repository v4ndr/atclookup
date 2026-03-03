"use client";

import { RcpSection } from "@/lib/scrapeRcp";

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

const RcpViewer = ({ sections }: { sections: RcpSection[] }) => {
  return (
    <div className="w-full space-y-1">
      {sections.map((section, i) => (
        <details key={i}>
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
      ))}
    </div>
  );
};

export default RcpViewer;
