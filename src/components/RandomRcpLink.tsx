"use client";

import { type ReactNode, useCallback } from "react";

type RandomRcpLinkProps = {
  atc: string;
  isEmbed?: boolean;
  specialites: { label: string; url: string }[];
  children: ReactNode;
};

const RandomRcpLink = ({ atc, isEmbed, specialites, children }: RandomRcpLinkProps) => {
  const onClick = useCallback(() => {
    const picked = specialites[Math.floor(Math.random() * specialites.length)];
    const base = isEmbed ? "/embed/rcp" : "/rcp";
    window.location.href = `${base}?url=${encodeURIComponent(picked.url)}&atc=${encodeURIComponent(atc)}`;
  }, [atc, isEmbed, specialites]);

  return (
    <div onClick={onClick} className="block cursor-pointer">
      {children}
    </div>
  );
};

export default RandomRcpLink;
