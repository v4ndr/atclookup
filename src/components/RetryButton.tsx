"use client";

import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";

const RetryButton = () => {
  return (
    <Button
      className="cursor-pointer"
      variant="outline"
      onClick={() => window.location.reload()}
    >
      <RotateCw />
      Rechercher la page
    </Button>
  );
};

export default RetryButton;
