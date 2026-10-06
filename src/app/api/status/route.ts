import { brainInfo } from "@/lib/ai";

export async function GET() {
  return Response.json({ brain: brainInfo() });
}
