"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

const BackButton = () => {
  return (
    <Button
      className="cursor-pointer"
      variant="link"
      onClick={() => window.history.back()}
    >
      <ChevronLeft />
      Retour
    </Button>
  );
};

export default BackButton;
