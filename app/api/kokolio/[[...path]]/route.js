// API de Kokolio : toutes les adresses /api/kokolio/… passent par ici.
import { handle } from "../../../../lib/kokolio/server/handle.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
// Exécutée en Europe, au plus près de la base de données et des salariés (les autres routes du site ne changent pas).
export const preferredRegion = ["cdg1"];

async function run(req, ctx) {
  const params = await ctx.params;
  return handle(req, (params?.path || []).join("/"));
}
export const GET = run;
export const POST = run;
