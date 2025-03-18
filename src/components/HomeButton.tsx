"use client";

import { Button } from "@/components/ui/button";
import { House } from "lucide-react";

const HomeButton = () => {
  return (
    <Button
      variant="outline"
      size="icon"
      className="cursor-pointer"
      onClick={() => window.location.replace("/")}
    >
      <House />
    </Button>
  );
};

export default HomeButton;
