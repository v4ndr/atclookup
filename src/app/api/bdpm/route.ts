import { type NextRequest } from "next/server";
import loopupAtc from "@/lib/lookupAtc";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const atc = searchParams.get("code");
  if (!atc) {
    return new Response("No ATC code provided", { status: 400 });
  }
  const result = await loopupAtc(atc);
  return new Response(JSON.stringify(result));
}
