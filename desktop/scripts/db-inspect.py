import sqlite3, sys, json
dbp = r"C:\Users\Administrator\AppData\Roaming\ai-novel-studio\data\novel-studio.db"
con = sqlite3.connect("file:"+dbp+"?mode=ro", uri=True)
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print("=== 表数", len(tables), "===")
print(", ".join(tables))
print()
keys = ["setting","model","llm","provider","route","secret","api","key","onboarding","quick","connection","auth","director"]
for t in tables:
    low = t.lower()
    if not any(k in low for k in keys):
        continue
    try:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        cnt = cur.fetchone()[0]
        print(f"--- {t} ({cnt} 行)")
        cur.execute(f'SELECT * FROM "{t}" LIMIT 40')
        cols = [d[0] for d in cur.description]
        for row in cur.fetchall():
            e = {}
            for k, v in zip(cols, row):
                if isinstance(v, str) and len(v) > 140:
                    v = v[:140] + "..."
                if isinstance(v, str) and any(x in k.lower() for x in ("key","secret","token","password")):
                    v = "[已存:" + str(len(v)) + "字符]"
                e[k] = v
            print("   " + json.dumps(e, ensure_ascii=False))
    except Exception as ex:
        print("   (err)", ex)
con.close()
