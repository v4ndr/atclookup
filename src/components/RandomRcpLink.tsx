"use client";

import { type ReactNode, useCallback } from "react";
import { usePathname } from "next/navigation";

type RandomRcpLinkProps = {
  specialites: { label: string; url: string }[];
  children: ReactNode;
};

const RandomRcpLink = ({ specialites, children }: RandomRcpLinkProps) => {
  const pathname = usePathname();
  const isEmbed = pathname.startsWith("/embed");

  const onClick = useCallback(() => {
    const picked = specialites[Math.floor(Math.random() * specialites.length)];
    const siblings = encodeURIComponent(JSON.stringify(specialites));
    const url = isEmbed
      ? `/embed/rcp?url=${encodeURIComponent(picked.url)}&siblings=${siblings}`
      : `/rcp?url=${encodeURIComponent(picked.url)}&siblings=${siblings}`;
    window.location.href = url;
    // window.location.href = `/rcp?url=${encodeURIComponent(picked.url)}&siblings=${siblings}`;
  }, [specialites, isEmbed]);

  return (
    <div onClick={onClick} className="block cursor-pointer">
      {children}
    </div>
  );
};

export default RandomRcpLink;
