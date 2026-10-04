// One-off: pull window.__LUT out of reference/send.html into src/pipeline/lut.json.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const html = readFileSync(here + "../reference/send.html", "utf8");
const m = html.match(/window\.__LUT=(\{.*?\});<\/script>/s);
if (!m) throw new Error("window.__LUT not found in send.html");
const lut = JSON.parse(m[1]);
writeFileSync(here + "../src/pipeline/lut.json", JSON.stringify(lut));
console.log("wrote lut.json:", Object.keys(lut).join(", "));
