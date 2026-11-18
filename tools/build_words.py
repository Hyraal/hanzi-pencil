"""Genera data/words.json (parole HSK1-2 di 2+ caratteri) da ~/Desktop/Cinese/HSK_1264_vocaboli_Anki.txt."""
import json, re, html, pathlib
src = pathlib.Path.home() / "Desktop/Cinese/HSK_1264_vocaboli_Anki.txt"
out = pathlib.Path(__file__).resolve().parent.parent / "data/words.json"
HZ = re.compile(r"[一-鿿]")
words, seen = [], set()
for line in src.read_text(encoding="utf-8").splitlines():
    if line.startswith("#") or not line.strip():
        continue
    parts = line.split("\t")
    if len(parts) < 3:
        continue
    raw, back, tags = parts[0], parts[1], parts[2]
    w = re.split(r"[;｜|]", raw)[0]
    w = re.sub(r"（.*?）|[¹²³]", "", w).strip()
    if not re.fullmatch(r"[一-鿿]{2,}", w) or w in seen:
        continue
    text = html.unescape(re.sub(r"<[^>]+>", " ", back.replace("<br>", "\n")))
    text = re.sub(r"[ \t ]+", " ", text).strip()
    m = re.match(r"(.*?) = (.*?)\s*📝\s*(.*?)\s*\((.*?)\)\s*=\s*(.*)$", text, re.S)
    if not m:
        print("salto", w); continue
    p, mean, ez, ep, ei = (s.strip() for s in m.groups())
    seen.add(w)
    words.append({"c": w, "p": p, "m": re.sub(r"\s+", " ", mean).rstrip(" ,;"), "l": 2 if "HSK2" in tags else 1,
                  "ez": ez, "ep": ep, "ei": ei.strip(' "')})
out.write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
print(len(words), "parole:", sum(x["l"] == 1 for x in words), "HSK1,", sum(x["l"] == 2 for x in words), "HSK2")
