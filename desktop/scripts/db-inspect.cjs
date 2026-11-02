const path = require("path");
const bs3 = "D:/AI小说-爆改/biz-novel-studio/node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3";
const Database = require(bs3);
const dbPath = process.argv[2];
const db = new Database(dbPath, { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
console.log("=== 表数 " + tables.length + " ===");
console.log(tables.join(", "));
console.log("");
const like = ["setting","model","llm","provider","route","secret","api","key","onboarding","quick","connection","auth"];
for (const t of tables) {
  const low = t.toLowerCase();
  if (!like.some(k => low.includes(k))) continue;
  try {
    const cnt = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
    console.log(`--- ${t} (${cnt} 行)`);
    const rows = db.prepare(`SELECT * FROM "${t}" LIMIT 40`).all();
    for (const r of rows) {
      const e = {};
      for (const k of Object.keys(r)) {
        let v = r[k];
        if (v && typeof v === "string" && v.length > 140) v = v.slice(0, 140) + "...";
        if (v && typeof v === "string" && /key|secret|token|password/i.test(k)) v = "[已加密/已隐藏:" + v.length + "]";
        e[k] = v;
      }
      console.log("   " + JSON.stringify(e));
    }
  } catch (e) { console.log(`   (err ${e.message})`); }
}
db.close();
