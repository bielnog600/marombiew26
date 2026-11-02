// Gera o bundle compartilhado usado pela edge function office-gerar a partir
// do MESMO código do admin (src/lib/officeWizard/serverEntry.ts).
// Uso: bun scripts/build-office-core.mjs  (ou --check para só comparar)
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT_FILE = path.join(root, "supabase/functions/_shared/generated/officeCore.js");

export async function bundleOfficeCore() {
  const res = await build({
    entryPoints: [path.join(root, "src/lib/officeWizard/serverEntry.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    legalComments: "none",
    alias: { "@": path.join(root, "src") },
    mainFields: ["module", "main"],
    logLevel: "silent",
  });
  const banner = "// @ts-nocheck\n// ARQUIVO GERADO — não editar. Fonte: src/lib/officeWizard/serverEntry.ts\n// Regerar com: bun scripts/build-office-core.mjs\n";
  return banner + res.outputFiles[0].text;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await bundleOfficeCore();
  if (process.argv.includes("--check")) {
    const current = readFileSync(OUT_FILE, "utf8");
    if (current !== code) { console.error("officeCore.js desatualizado"); process.exit(1); }
    console.log("officeCore.js atualizado");
  } else {
    mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    writeFileSync(OUT_FILE, code);
    console.log("gerado", OUT_FILE, code.length, "bytes");
  }
}
