// API de l'environnement de test de Kokolio : toutes les adresses /api/kokolio-test/… passent par ici.
// Même code que la production ; seules changent la fonction appelée dans la base (schéma kokolio_test) et le cookie de session.
import { handle } from "../../../../lib/kokolio/server/handle.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run(req, ctx) {
  const params = await ctx.params;
  return handle(req, (params?.path || []).join("/"), "test");
}
export const GET = run;
export const POST = run;
