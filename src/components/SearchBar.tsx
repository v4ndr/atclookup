import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SearchBarProps = {
  fullWidth?: boolean;
  className?: string;
};

const SearchBar = ({ fullWidth, className }: SearchBarProps) => {
  return (
    <div
      className={`flex w-full ${
        !fullWidth ? "max-w-sm" : null
      } space-x-3 ${className}`}
    >
      <Input type="text" placeholder="Code ATC (ex: J01MA12)" />
      <Button className="cursor-pointer" type="submit">
        Rechercher
      </Button>
    </div>
  );
};

export default SearchBar;
