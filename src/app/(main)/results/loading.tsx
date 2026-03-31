import SearchBar from "@/components/SearchBar";
import HomeButton from "@/components/HomeButton";
import ResultsSkeleton from "@/components/ResultsSkeleton";

export default function Loading() {
  return (
    <>
      <div className="flex items-center justify-center space-x-3 w-full">
        <HomeButton />
        <SearchBar fullWidth className="" />
      </div>
      <ResultsSkeleton />
    </>
  );
}
