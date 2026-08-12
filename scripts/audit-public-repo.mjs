import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const forbiddenExtensions = new Set([
  ".db", ".jpeg", ".jpg", ".key", ".p12", ".pdf", ".pem", ".png", ".sqlite", ".sqlite3",
]);
const forbiddenPathParts = ["/data/", "/downloads/", "/statements/"];
const forbiddenContent = [
  { label: "private production hostname", pattern: /finance\.jithendranara\.dev/iu },
  { label: "private local workspace path", pattern: /\/Users\/jithendranara\/(?:\.openclaw|Downloads|Library)\//u },
  { label: "credential-bearing SimpleFIN URL", pattern: /https:\/\/[^\s/:"']+:[^\s/@"']+@[^\s"']+/u },
  { label: "Cloudflare Access secret value", pattern: /CF-Access-Client-Secret["']?\s*[:=]\s*["'](?!\$\{|<|REPLACE|example)[^"']{12,}/u },
  { label: "authorization token literal", pattern: /Authorization["']?\s*[:=]\s*["']Bearer\s+(?!\$|<|REPLACE|example)[A-Za-z0-9._~+/-]{16,}/u },
  { label: "SimpleFIN access URL literal", pattern: /SIMPLEFIN_ACCESS_URL\s*=\s*["']https:\/\//u },
];

const failures = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  const lower = `/${file.toLowerCase()}`;
  if (lower.endsWith("/.env") || forbiddenExtensions.has(extname(lower)) || forbiddenPathParts.some((part) => lower.includes(part))) {
    failures.push(`${file}: forbidden public artifact type`);
    continue;
  }

  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  if (file === "scripts/audit-public-repo.mjs") continue;
  const text = bytes.toString("utf8");
  for (const rule of forbiddenContent) {
    if (rule.pattern.test(text)) failures.push(`${file}: ${rule.label}`);
  }
}

if (failures.length > 0) {
  console.error("Public-repository privacy audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Public-repository privacy audit passed (${files.length} files checked).`);
