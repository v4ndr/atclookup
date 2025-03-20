"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useCallback } from "react";
import { Search } from "lucide-react";

type SearchBarProps = {
  fullWidth?: boolean;
  className?: string;
};

const SearchBar = ({ fullWidth, className }: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const onSearch = useCallback(() => {
    window.location.replace(`/results?atc=${query}`);
  }, [query]);

  return (
    <div
      className={`flex w-full ${
        !fullWidth ? "max-w-sm" : null
      } space-x-3 ${className}`}
    >
      <Input
        type="text"
        placeholder="Code ATC (ex: J01MA12)"
        onChange={(e) => setQuery(e.target.value)}
        value={query}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
      />
      <Button
        className="cursor-pointer hidden sm:flex"
        type="submit"
        onClick={onSearch}
      >
        Rechercher
      </Button>
      <Button
        className="cursor-pointer sm:hidden"
        size="icon"
        onClick={onSearch}
      >
        <Search />
      </Button>
    </div>
  );
};

export default SearchBar;
