"use client";

import { type ReactNode, useCallback } from "react";

type RandomRcpLinkProps = {
  specialites: { label: string; url: string }[];
  children: ReactNode;
};

const RandomRcpLink = ({ specialites, children }: RandomRcpLinkProps) => {
  const onClick = useCallback(() => {
    const picked =
      specialites[Math.floor(Math.random() * specialites.length)];
    const siblings = encodeURIComponent(JSON.stringify(specialites));
    window.location.href = `/rcp?url=${encodeURIComponent(picked.url)}&siblings=${siblings}`;
  }, [specialites]);

  return (
    <div onClick={onClick} className="block cursor-pointer">
      {children}
    </div>
  );
};

export default RandomRcpLink;
