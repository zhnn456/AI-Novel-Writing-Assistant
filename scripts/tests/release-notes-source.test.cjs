const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

// 本产品（鲸喜AI写作）的版本说明口径：docs/releases/release-notes.md 是唯一发布历史，
// 每条以「### YYYY-MM-DD · <版本号>」起头；客户端更新说明取自更新源清单，不再内置一份 TS 文案。
test("发布说明覆盖当前桌面版本且带日期", () => {
  const desktop = JSON.parse(read("desktop/package.json"));
  const notes = read("docs/releases/release-notes.md");
  const version = desktop.version.replaceAll(".", "\\.");
  assert.match(desktop.version, /^\d+\.\d+\.\d+$/, "desktop version must be plain semver");
  assert.match(
    notes,
    new RegExp(`^### \\d{4}-\\d{2}-\\d{2} · ${version}$`, "m"),
    `release-notes.md must include a dated entry for desktop ${desktop.version}`,
  );
  assert.match(
    read("README.md"),
    new RegExp(`桌面版本 \`${version}\``),
    "README must announce the current desktop version",
  );
});

test("发布历史按时间倒序且无重复版本", () => {
  const notes = read("docs/releases/release-notes.md");
  const entries = [...notes.matchAll(/^### (\d{4}-\d{2}-\d{2}) · (.+)$/gm)].map(match => ({ date: match[1], version: match[2].trim() }));
  assert.ok(entries.length >= 3, "release history should keep more than a couple of entries");
  const dates = entries.map(entry => entry.date);
  assert.deepEqual([...dates].sort().reverse(), dates, "release history must be newest-first");
  const duplicates = entries.map(entry => entry.version).filter((version, index, list) => list.indexOf(version) !== index);
  assert.deepEqual(duplicates, [], `duplicated release entries: ${duplicates.join(", ")}`);
});
