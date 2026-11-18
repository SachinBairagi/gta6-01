// Solmar Bay — entrypoint: copies game/ and screenshots/ to the output
// directory and writes dossier.json with the kit's buildDossier library.
import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

function main() {
  mkdirSync(outDir, { recursive: true });
  const gameOut = join(outDir, "game");
  const shotsOut = join(outDir, "screenshots");
  if (existsSync(gameOut)) rmSync(gameOut, { recursive: true, force: true });
  if (existsSync(shotsOut)) rmSync(shotsOut, { recursive: true, force: true });
  cpSync(join(repoRoot, "game"), gameOut, { recursive: true });
  const shotsDir = join(repoRoot, "screenshots");
  if (existsSync(shotsDir)) cpSync(shotsDir, shotsOut, { recursive: true });
  const dossier = buildDossier(outDir, { text_max_bytes: 163840, dossier_max_bytes: 1572864 });
  const text = typeof dossier === "string" ? dossier : dossier instanceof Uint8Array ? Buffer.from(dossier).toString("utf8") : JSON.stringify(dossier, null, 2);
  writeFileSync(join(outDir, "dossier.json"), text);
}

main();
