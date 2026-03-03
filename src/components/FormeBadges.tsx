"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

const MAX_VISIBLE = 2;

const FormeBadges = ({ formes }: { formes: string[] }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = formes.slice(0, MAX_VISIBLE);
  const hidden = formes.slice(MAX_VISIBLE);

  return (
    <div className="flex flex-wrap gap-1.5 min-w-0 overflow-hidden">
      {visible.map((f) => (
        <Badge key={f} variant="secondary" className="text-xs max-w-full shrink justify-start">
          <span className="truncate">{f}</span>
        </Badge>
      ))}
      {hidden.length > 0 && (
        <>
          {expanded &&
            hidden.map((f) => (
              <Badge key={f} variant="secondary" className="text-xs max-w-full shrink justify-start">
                <span className="truncate">{f}</span>
              </Badge>
            ))}
          <Badge
            variant="outline"
            className="text-xs cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              setExpanded(!expanded);
            }}
          >
            {expanded ? "Moins" : `+${hidden.length} de plus`}
          </Badge>
        </>
      )}
    </div>
  );
};

export default FormeBadges;
