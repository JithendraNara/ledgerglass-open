import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const readJson = async (relative) => JSON.parse(await readFile(join(root, relative), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const bundle = await readJson("showcase/BUNDLE.json");
const registry = await readJson("showcase/capabilities.json");
const scenarios = await readJson("showcase/scenarios.json");
const research = await readJson("showcase/research.json");

const failures = [];
const ids = new Set(registry.capabilities.map((capability) => capability.id));
const researchIds = new Set(research.sources.map((source) => source.id));
for (const capability of registry.capabilities) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(capability.id)) failures.push(`invalid capability id: ${capability.id}`);
  if (!["core", "demo", "private-note"].includes(capability.delivery)) failures.push(`invalid delivery: ${capability.id}`);
  if (!capability.public_artifacts?.length) failures.push(`missing public artifacts: ${capability.id}`);
  for (const reference of capability.research_refs ?? []) {
    if (!researchIds.has(reference)) failures.push(`unknown research reference ${reference} for ${capability.id}`);
  }
}
if (ids.size !== registry.capabilities.length) failures.push("duplicate capability IDs");
if (scenarios.fictional !== true || scenarios.scenarios.length < 6) failures.push("fictional scenario set incomplete");
for (const scenario of scenarios.scenarios) {
  for (const field of ["happened", "difficulty", "evidence", "action", "uncertainty", "reversal"]) {
    if (!scenario[field] || (Array.isArray(scenario[field]) && scenario[field].length === 0)) failures.push(`${scenario.id}: missing ${field}`);
  }
}
for (const item of bundle.files) {
  const contents = await readFile(join(root, item.path));
  if (contents.byteLength !== item.bytes) failures.push(`${item.path}: byte count changed`);
  if (sha256(contents) !== item.sha256) failures.push(`${item.path}: hash changed`);
}

const generatedDigest = sha256(`${JSON.stringify(bundle.files, null, 2)}\n`);
if (generatedDigest !== bundle.export_digest) failures.push("bundle export digest changed");

const sourceFiles = [];
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if ([".astro", ".md", ".ts", ".css"].includes(extname(entry.name))) sourceFiles.push(path);
  }
};
await walk(join(root, "site/src"));
sourceFiles.push(join(root, "README.md"));
const bannedVoice = [
  /revolutionary/iu,
  /next[- ]generation/iu,
  /unlock your financial future/iu,
  /seamlessly powered by ai/iu,
  /intelligent financial transformation/iu,
  /enterprise[- ]grade/iu,
];
for (const file of sourceFiles) {
  const text = await readFile(file, "utf8");
  for (const pattern of bannedVoice) if (pattern.test(text)) failures.push(`${file}: generated-marketing phrase ${pattern}`);
  if (/finance\.jithendranara\.dev/iu.test(text)) failures.push(`${file}: private production hostname`);
}

const plugin = await readJson("plugins/ledgerglass/plugin.json");
const mcp = await readJson("plugins/ledgerglass/mcp.json");
if (plugin.name !== "ledgerglass" || plugin.license !== "MIT") failures.push("public plugin identity is invalid");
const serverEntries = Object.entries(mcp.mcpServers ?? {});
if (serverEntries.length !== 1 || serverEntries[0][1].url !== "https://ledgerglass.example/mcp") failures.push("public plugin must use the single placeholder MCP URL");
for (const skillName of ["finance-steward", "statement-reconciliation", "ledger-maintenance"]) {
  const skill = await readFile(join(root, `plugins/ledgerglass/skills/${skillName}/SKILL.md`), "utf8");
  const match = skill.match(/^---\n([\s\S]*?)\n---/u);
  if (!match || !new RegExp(`^name: ${skillName}$`, "mu").test(match[1])) failures.push(`${skillName}: invalid Agent Skill frontmatter`);
  if (/https?:\/\/(?!ledgerglass\.example|github\.com|agent-plugins\.org)/u.test(skill)) failures.push(`${skillName}: unexpected external URL`);
}

if (failures.length > 0) {
  console.error("Showcase validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Showcase validation passed: ${registry.capabilities.length} capabilities, ${scenarios.scenarios.length} fictional scenarios, ${bundle.export_digest}`);
