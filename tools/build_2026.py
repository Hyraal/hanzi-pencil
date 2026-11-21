"""Genera data/chars.json e data/words.json secondo l'esame HSK 3.0 ed. 2026 (livelli 1-2).

Fonti:
- caratteri: wiki Obsidian raw/hsk30-2026-hanzi-hsk1.txt, -hsk2.txt, -scrittura-hsk1-2.txt
- parole: raw/Sillabo_HSK_2026.pdf (pagine 80-96, via pdftotext -raw)
- pinyin/traduzioni/frasi: tools/src/chars2021.json e words2021.json (standard 2021) e ~/Desktop/Cinese/HSK_1264_vocaboli_Anki.txt
- categorie dei caratteri: ~/Desktop/Cinese/HSK600/*_Anki.txt
- elenco completo dell'utente: tools/src/anki_hsk12.tsv (dal PDF anki-hsk1-hsk2.pdf), aggiunto in coda
Quello che manca nelle fonti (caratteri/parole nuovi del 2026, categorie delle parole) e' nelle tabelle qui sotto.
Uso: python3 tools/build_2026.py   (richiede pdftotext)
"""
import glob, html, json, pathlib, re, subprocess, sys

HOME = pathlib.Path.home()
APP = pathlib.Path(__file__).resolve().parent.parent
RAW = HOME / "Library/Mobile Documents/iCloud~md~obsidian/Documents/Cinese/raw"
CIN = HOME / "Desktop/Cinese"

CATS = [  # chiave, etichetta (ordine di visualizzazione)
    ("espr", "Espressioni"), ("pron", "Pronomi e particelle"), ("num", "Numeri e quantità"),
    ("tempo", "Tempo e date"), ("fam", "Famiglia e persone"), ("corpo", "Corpo e salute"),
    ("cibo", "Cibo e bevande"), ("casa", "Casa e vita quotidiana"), ("scuola", "Scuola e studio"),
    ("lavoro", "Lavoro e tecnologia"), ("luoghi", "Luoghi e posizioni"), ("viaggi", "Trasporti, sport e tempo libero"),
    ("natura", "Natura e meteo"), ("emo", "Emozioni"), ("agg", "Aggettivi e colori"), ("avv", "Avverbi"),
    ("conn", "Congiunzioni e preposizioni"), ("vq", "Verbi quotidiani"), ("vcom", "Verbi di comunicazione e pensiero"),
    ("vmov", "Verbi di movimento"), ("vsc", "Verbi di scambio e possesso"),
]
HSK600 = {
    "Pronomi_dimostrativi_e_particelle": "pron", "Numeri_quantita_e_classificatori": "num",
    "Tempo_date_e_stagioni": "tempo", "Famiglia_e_persone": "fam", "Corpo_umano_e_salute": "corpo",
    "Cibo_bevande_e_cucina": "cibo", "Casa_vestiti_e_vita_quotidiana": "casa", "Scuola_e_studio": "scuola",
    "Lavoro_tecnologia_ed_economia": "lavoro", "Luoghi_e_geografia": "luoghi",
    "Trasporti_viaggi_e_tempo_libero": "viaggi", "Natura_animali_e_meteo": "natura",
    "Emozioni_e_stati_danimo": "emo", "Aggettivi": "agg", "Avverbi_di_grado_modo_e_necessita": "avv",
    "Avverbi_di_tempo_e_frequenza": "avv", "Congiunzioni_preposizioni_e_connettivi": "conn",
    "Verbi_di_azioni_quotidiane_cambiamento_e_risultato": "vq", "Verbi_di_comunicazione_e_pensiero": "vcom",
    "Verbi_di_movimento_e_posizione": "vmov", "Verbi_di_scambio_possesso_e_uso": "vsc",
}

# caratteri 2026 assenti dalla lista 2021 dell'app: pinyin, significato, categoria, frase
NEW_CHARS = {
    "苹": ("píng", "in 苹果 (píngguǒ) mela", "cibo", "苹果很好吃。", "Píngguǒ hěn hǎochī.", "Le mele sono buone."),
    "士": ("shì", "persona, studioso (女士 signora)", "fam", "这位女士是我的老师。", "Zhè wèi nǚshì shì wǒ de lǎoshī.", "Questa signora è la mia insegnante."),
    "希": ("xī", "sperare (希望)", "vcom", "我希望你快乐。", "Wǒ xīwàng nǐ kuàilè.", "Spero che tu sia felice."),
    "望": ("wàng", "guardare lontano; sperare (希望)", "vcom", "我们都希望去中国。", "Wǒmen dōu xīwàng qù Zhōngguó.", "Speriamo tutti di andare in Cina."),
    "步": ("bù", "passo (跑步 correre)", "viaggi", "他每天跑步。", "Tā měi tiān pǎobù.", "Corre ogni giorno."),
    "始": ("shǐ", "iniziare (开始)", "vq", "电影开始了。", "Diànyǐng kāishǐ le.", "Il film è cominciato."),
    "咖": ("kā", "in 咖啡 (kāfēi) caffè", "cibo", "我早上喝咖啡。", "Wǒ zǎoshang hē kāfēi.", "La mattina bevo il caffè."),
    "啡": ("fēi", "in 咖啡 (kāfēi) caffè", "cibo", "这杯咖啡很好喝。", "Zhè bēi kāfēi hěn hǎohē.", "Questo caffè è buono."),
    "裤": ("kù", "pantaloni (裤子)", "casa", "我想买一条裤子。", "Wǒ xiǎng mǎi yì tiáo kùzi.", "Voglio comprare un paio di pantaloni."),
    "泳": ("yǒng", "nuotare (游泳)", "viaggi", "你会游泳吗？", "Nǐ huì yóuyǒng ma?", "Sai nuotare?"),
    "踢": ("tī", "calciare (踢足球 giocare a calcio)", "viaggi", "我们周末踢足球。", "Wǒmen zhōumò tī zúqiú.", "Il fine settimana giochiamo a calcio."),
    "夫": ("fū", "uomo; marito (丈夫)", "fam", "她的丈夫是医生。", "Tā de zhàngfu shì yīshēng.", "Suo marito è medico."),
    "跳": ("tiào", "saltare (跳舞 ballare)", "vmov", "小狗跳得很高。", "Xiǎo gǒu tiào de hěn gāo.", "Il cagnolino salta molto in alto."),
    "丈": ("zhàng", "in 丈夫 (zhàngfu) marito", "fam", "我丈夫今天不在家。", "Wǒ zhàngfu jīntiān bú zài jiā.", "Mio marito oggi non è a casa."),
    "每": ("měi", "ogni", "num", "我每天学习汉语。", "Wǒ měi tiān xuéxí Hànyǔ.", "Studio cinese ogni giorno."),
    "足": ("zú", "piede; sufficiente (足球 calcio)", "viaggi", "他喜欢看足球。", "Tā xǐhuan kàn zúqiú.", "Gli piace guardare il calcio."),
    "妻": ("qī", "moglie (妻子)", "fam", "他和妻子一起去旅游。", "Tā hé qīzi yìqǐ qù lǚyóu.", "Va in viaggio con la moglie."),
    "舞": ("wǔ", "danza (跳舞 ballare)", "viaggi", "她跳舞跳得很好。", "Tā tiàowǔ tiào de hěn hǎo.", "Balla molto bene."),
}

# parole 2026 assenti dal mazzo Anki: pinyin, significato, frase
NEW_WORDS = {
    "没事": ("méishì", "non è niente, non fa niente", "没事，我很好。", "Méishì, wǒ hěn hǎo.", "Non è niente, sto bene."),
    "哪个": ("nǎge", "quale", "你要哪个？", "Nǐ yào nǎge?", "Quale vuoi?"),
    "那个": ("nàge", "quello, quella", "那个人是我的老师。", "Nàge rén shì wǒ de lǎoshī.", "Quella persona è il mio insegnante."),
    "你好": ("nǐ hǎo", "ciao, buongiorno", "你好，我叫大卫。", "Nǐ hǎo, wǒ jiào Dàwèi.", "Ciao, mi chiamo David."),
    "女士": ("nǚshì", "signora", "女士们，你们好！", "Nǚshìmen, nǐmen hǎo!", "Buongiorno, signore!"),
    "苹果": ("píngguǒ", "mela", "我每天吃一个苹果。", "Wǒ měi tiān chī yí gè píngguǒ.", "Mangio una mela al giorno."),
    "一下": ("yíxià", "un attimo, un po' (dopo un verbo)", "请等一下。", "Qǐng děng yíxià.", "Aspetta un attimo, per favore."),
    "这个": ("zhège", "questo, questa", "这个多少钱？", "Zhège duōshao qián?", "Quanto costa questo?"),
    "红茶": ("hóngchá", "tè nero", "我喜欢喝红茶。", "Wǒ xǐhuan hē hóngchá.", "Mi piace bere il tè nero."),
    "后面": ("hòumiàn", "dietro", "学校后面有一个商店。", "Xuéxiào hòumiàn yǒu yí gè shāngdiàn.", "Dietro la scuola c'è un negozio."),
    "咖啡": ("kāfēi", "caffè", "你要咖啡还是茶？", "Nǐ yào kāfēi háishi chá?", "Vuoi caffè o tè?"),
    "开始": ("kāishǐ", "iniziare; inizio", "我们八点开始上课。", "Wǒmen bā diǎn kāishǐ shàngkè.", "Iniziamo la lezione alle otto."),
    "裤子": ("kùzi", "pantaloni", "这条裤子很便宜。", "Zhè tiáo kùzi hěn piányi.", "Questi pantaloni sono economici."),
    "里面": ("lǐmiàn", "dentro", "书包里面有一本书。", "Shūbāo lǐmiàn yǒu yì běn shū.", "Nello zaino c'è un libro."),
    "绿茶": ("lǜchá", "tè verde", "中国人常喝绿茶。", "Zhōngguórén cháng hē lǜchá.", "I cinesi bevono spesso il tè verde."),
    "没意思": ("méi yìsi", "noioso, non interessante", "这个电影没意思。", "Zhège diànyǐng méi yìsi.", "Questo film è noioso."),
    "奶茶": ("nǎichá", "tè al latte", "我想喝一杯奶茶。", "Wǒ xiǎng hē yì bēi nǎichá.", "Vorrei bere un tè al latte."),
    "跑步": ("pǎobù", "correre, fare jogging", "我每天早上跑步。", "Wǒ měi tiān zǎoshang pǎobù.", "Corro ogni mattina."),
    "妻子": ("qīzi", "moglie", "他的妻子是老师。", "Tā de qīzi shì lǎoshī.", "Sua moglie è insegnante."),
    "前面": ("qiánmiàn", "davanti", "前面就是车站。", "Qiánmiàn jiù shì chēzhàn.", "Lì davanti c'è la stazione."),
    "上来": ("shànglái", "salire (verso chi parla)", "你上来吧！", "Nǐ shànglái ba!", "Sali qui!"),
    "上面": ("shàngmiàn", "sopra", "桌子上面有一杯茶。", "Zhuōzi shàngmiàn yǒu yì bēi chá.", "Sul tavolo c'è una tazza di tè."),
    "上去": ("shàngqù", "salire (allontanandosi da chi parla)", "我们上去看看。", "Wǒmen shàngqù kànkan.", "Saliamo a dare un'occhiata."),
    "跳舞": ("tiàowǔ", "ballare", "她很喜欢跳舞。", "Tā hěn xǐhuan tiàowǔ.", "Le piace molto ballare."),
    "外面": ("wàimiàn", "fuori", "外面下雨了。", "Wàimiàn xià yǔ le.", "Fuori piove."),
    "希望": ("xīwàng", "sperare; speranza", "我希望明天不下雨。", "Wǒ xīwàng míngtiān bú xià yǔ.", "Spero che domani non piova."),
    "下来": ("xiàlái", "scendere (verso chi parla)", "你快下来！", "Nǐ kuài xiàlái!", "Scendi, presto!"),
    "下面": ("xiàmiàn", "sotto", "椅子下面有一只猫。", "Yǐzi xiàmiàn yǒu yì zhī māo.", "Sotto la sedia c'è un gatto."),
    "下去": ("xiàqù", "scendere (allontanandosi); continuare", "我下去买水。", "Wǒ xiàqù mǎi shuǐ.", "Scendo a comprare l'acqua."),
    "游泳": ("yóuyǒng", "nuotare", "夏天我常去游泳。", "Xiàtiān wǒ cháng qù yóuyǒng.", "D'estate vado spesso a nuotare."),
    "有时": ("yǒushí", "a volte", "我有时在家吃饭。", "Wǒ yǒushí zài jiā chī fàn.", "A volte mangio a casa."),
    "丈夫": ("zhàngfu", "marito", "她丈夫在医院工作。", "Tā zhàngfu zài yīyuàn gōngzuò.", "Suo marito lavora in ospedale."),
    "足球": ("zúqiú", "calcio (sport)", "他们在踢足球。", "Tāmen zài tī zúqiú.", "Stanno giocando a calcio."),
    # nel mazzo Anki la frase separa il verbo (帮我的忙): serve una frase con la parola intera
    "帮忙": ("bāngmáng", "dare una mano, aiutare", "谢谢你来帮忙！", "Xièxie nǐ lái bāngmáng!", "Grazie di essere venuto a dare una mano!"),
}

WORD_CATS = {
    "espr": "不客气 对不起 没关系 没事 你好 请问 谢谢 再见 不好意思",
    "pron": "你们 我们 他们 它们 她们 什么 哪个 哪里 哪儿 哪些 那边 那个 那里 那儿 那些 这边 这个 这里 这儿 这些 "
            "怎么 怎么样 自己 那么 那样 这么 这样 为什么",
    "num": "多少 一半 一点儿 一些 有的 有些",
    "tempo": "白天 今年 今天 明年 明天 去年 上午 下午 中午 晚上 早上 时候 时间 现在 星期 星期日 星期天 昨天 "
             "小时 分钟 一会儿 小时候 生日 过年",
    "fam": "爸爸 弟弟 儿子 哥哥 孩子 家人 姐姐 妈妈 妹妹 男朋友 女儿 女朋友 女士 朋友 先生 小朋友 大家 同学 "
           "爷爷 奶奶 男孩儿 女孩儿 小孩儿 妻子 丈夫 姓名 名字",
    "corpo": "看病 生病 医生 身体 眼睛 舒服 个子",
    "cibo": "包子 鸡蛋 饺子 米饭 面包 面条儿 牛奶 水果 苹果 晚饭 午饭 早饭 做饭 好吃 红茶 绿茶 奶茶 咖啡",
    "casa": "杯子 东西 电视 房间 衣服 椅子 桌子 起床 睡觉 休息 裤子 手表 书包 洗手间 事情",
    "scuola": "大学 大学生 读书 汉语 汉字 上课 下课 上学 小学 小学生 学生 学习 学校 中文 中学 中学生 老师 问题 "
              "高中 教室 开学 考试 本子 意思",
    "lavoro": "电话 电脑 公司 工作 上班 下班 手机 打电话 上网 网上",
    "luoghi": "超市 电影院 饭店 饭馆 商店 书店 医院 中国 外边 后面 前面 里面 外面 上面 下面 旁边 左边 右边 门口 "
              "商场 外国 车站 机场 酒店 药店 路上",
    "viaggi": "出租车 飞机 火车 开车 电影 好玩儿 旅游 地铁 公交车 打车 机票 门票 出国 篮球 足球 跑步 游泳 跳舞 "
              "爱好 运动 走路",
    "natura": "天气 下雨",
    "emo": "高兴 喜欢 快乐",
    "agg": "便宜 漂亮 好看 好听 不错 白色 黑色 红色 绿色 颜色 有意思 没意思",
    "avv": "非常 不要 有点儿 正在 经常 可能 快要 已经 一起 有时 从小 可以 一下",
    "conn": "但是 虽然 所以 因为 还是",
    "vq": "看见 听见 准备 开始 打开",
    "vcom": "觉得 认识 说话 知道 记得 告诉 介绍 希望",
    "vmov": "出来 出门 出去 过来 过去 回来 回去 进来 进去 起来 上来 上去 下来 下去",
    "vsc": "没有 帮忙",
}

# elenco completo dell'utente (mazzo Anki HSK1/HSK2 "3.0", 1289 schede = esame 2026 + standard 2021):
# tutto cio' che manca nelle liste d'esame viene aggiunto con il livello del mazzo
ANKI_CATS = {
    "Aggettivi e stati": "agg", "Cibo e bevande": "cibo", "Cognitivi, comunicativi ed emozioni": "vcom",
    "Corpo e salute": "corpo", "Famiglia, persone e professioni": "fam", "Luogo, edifici e posizione": "luoghi",
    "Natura e meteo": "natura", "Numeri, quantità e classificatori": "num", "Oggetti, materiali e tecnologia": "casa",
    "Pronomi, particelle e grammatica": "pron", "Scuola e lingua": "scuola", "Tempo": "tempo",
    "Verbi di azione e movimento": "vq",
}
EXTRA_WORDS = {  # parole dell'elenco senza dati nella lista 2021
    "第二": ("dì-èr", "secondo", "我是第二个到的。", "Wǒ shì dì-èr gè dào de.", "Sono arrivato per secondo."),
    "有一些": ("yǒu yìxiē", "un po', alcuni", "我有一些问题。", "Wǒ yǒu yìxiē wèntí.", "Ho alcune domande."),
    "科学家": ("kēxuéjiā", "scienziato", "他想当科学家。", "Tā xiǎng dāng kēxuéjiā.", "Vuole diventare scienziato."),
    "有一点儿": ("yǒu yìdiǎnr", "un po' (con senso negativo)", "今天有一点儿冷。", "Jīntiān yǒu yìdiǎnr lěng.", "Oggi fa un po' freddo."),
    "那时": ("nàshí", "allora, a quel tempo", "那时我还很小。", "Nàshí wǒ hái hěn xiǎo.", "Allora ero ancora piccolo."),
    "这时": ("zhèshí", "in quel momento, ora", "这时，电话响了。", "Zhèshí, diànhuà xiǎng le.", "In quel momento squillò il telefono."),
}

HAN = re.compile(r"[一-鿿]")


def integrate_anki(chars, words, cat):
    src = APP / "tools/src"
    c21 = {x["c"]: x for x in json.loads((src / "chars2021.json").read_text(encoding="utf-8"))}
    w21 = {x["c"]: x for x in json.loads((src / "words2021.json").read_text(encoding="utf-8"))}
    have_c, have_w, lvl_c = {x["c"] for x in chars}, {x["c"] for x in words}, {}
    for line in open(src / "anki_hsk12.tsv", encoding="utf-8"):
        if line.startswith("#"):
            continue
        lv, deck, w, _, _ = line.rstrip("\n").split("\t")
        lvl = int(lv[-1])
        for ch in HAN.findall(w):
            lvl_c[ch] = min(lvl_c.get(ch, 9), lvl)
        if len(w) < 2 or w in have_w:
            continue
        have_w.add(w)
        if w in EXTRA_WORDS:
            p, m, ez, ep, ei = EXTRA_WORDS[w]
            d = dict(p=p, m=m, ez=ez, ep=ep, ei=ei)
        else:
            d = w21[w]
        assert w in d["ez"], "frase senza la parola: " + w
        words.append(dict(c=w, p=d["p"], m=d["m"], l=lvl, k=ANKI_CATS[deck], ez=d["ez"], ep=d["ep"], ei=d["ei"]))
    for ch, lvl in lvl_c.items():
        if ch not in have_c:
            x = c21[ch]
            assert ch in x["ez"] and ch in cat, ch
            chars.append(dict(c=ch, p=x["p"], m=x["m"], ez=x["ez"], ep=x["ep"], ei=x["ei"], l=lvl, k=cat[ch], w=0))


def read_list(name):
    return (RAW / name).read_text(encoding="utf-8").split()


def anki_back(back):
    text = html.unescape(re.sub(r"<[^>]+>", " ", back.replace("<br>", "\n")))
    text = re.sub(r"[ \t ]+", " ", text).strip()
    m = re.match(r"(.*?) = (.*?)\s*📝\s*(.*?)\s*\((.*?)\)\s*=\s*(.*)$", text, re.S)
    if not m:
        return None
    p, mean, ez, ep, ei = (s.strip() for s in m.groups())
    return dict(p=p, m=re.sub(r"\s+", " ", mean).rstrip(" ,;"), ez=ez, ep=ep, ei=ei.strip(' "'))


def main():
    # ---- caratteri ----
    l1, l2, wr = read_list("hsk30-2026-hanzi-hsk1.txt"), read_list("hsk30-2026-hanzi-hsk2.txt"), set(read_list("hsk30-2026-scrittura-hsk1-2.txt"))
    assert (len(l1), len(l2), len(wr)) == (246, 125, 100), (len(l1), len(l2), len(wr))
    old = {x["c"]: x for x in json.loads((APP / "tools/src/chars2021.json").read_text(encoding="utf-8"))}
    cat = {}
    for f in sorted(glob.glob(str(CIN / "HSK600/*_Anki.txt"))):
        name = re.sub(r"^HSK600_|^HSK_|_parte_\d|_Anki\.txt$", "", pathlib.Path(f).name)
        for line in open(f, encoding="utf-8"):
            if not line.startswith("#") and line.strip():
                cat.setdefault(line.split("\t")[0].strip(), HSK600[name])
    chars = []
    for lvl, lst in ((1, l1), (2, l2)):
        for c in lst:
            if c in NEW_CHARS:
                p, m, k, ez, ep, ei = NEW_CHARS[c]
                x = dict(c=c, p=p, m=m, ez=ez, ep=ep, ei=ei)
            else:
                x = {k2: old[c][k2] for k2 in ("c", "p", "m", "ez", "ep", "ei")}
                k = cat[c]
            x.update(l=lvl, k=k, w=int(c in wr))
            assert c in x["ez"], c
            chars.append(x)

    # ---- parole (solo 2+ caratteri: quelle di un carattere sono nella sezione Caratteri) ----
    raw = subprocess.run(["pdftotext", "-raw", "-f", "80", "-l", "96", str(RAW / "Sillabo_HSK_2026.pdf"), "-"],
                         capture_output=True, text=True, check=True).stdout
    rows = {}
    for line in raw.splitlines():
        m = re.match(r"^(\d{1,3}) ([12])((?:（[\d-]+）)*) (\S+) (.+?)(?: [名动形副代数量助介连叹拟前后缀、（）]+)?$", line.strip())
        if m and int(m.group(1)) <= 500 and int(m.group(1)) not in rows:
            rows[int(m.group(1))] = (int(m.group(2)), re.sub(r"\d$", "", m.group(4)), m.group(5).strip())
    assert len(rows) == 500, [n for n in range(1, 501) if n not in rows]
    anki = {}
    for line in open(CIN / "HSK_1264_vocaboli_Anki.txt", encoding="utf-8"):
        parts = line.rstrip("\n").split("\t")
        if line.startswith("#") or len(parts) < 3:
            continue
        d = anki_back(parts[1])
        for w in re.split(r"[;｜|]", parts[0]):
            w = re.sub(r"（.*?）|[¹²³]", "", w).strip()
            if d and w not in anki:
                anki[w] = d
    wcat = {w: k for k, ws in WORD_CATS.items() for w in ws.split()}
    words, seen = [], set()
    for n in sorted(rows):
        lvl, w, py = rows[n]
        if len(w) < 2 or w in seen:
            continue
        seen.add(w)
        if w in NEW_WORDS:
            p, m, ez, ep, ei = NEW_WORDS[w]
            d = dict(p=p, m=m, ez=ez, ep=ep, ei=ei)
        else:
            d = anki[w]
        assert w in wcat, "categoria mancante: " + w
        assert w in d["ez"], "frase senza la parola: " + w
        words.append(dict(c=w, p=d["p"], m=d["m"], l=lvl, k=wcat[w], ez=d["ez"], ep=d["ep"], ei=d["ei"]))
    extra = set(wcat) - seen
    assert not extra, "parole in categoria ma non nel sillabo: " + " ".join(sorted(extra))

    integrate_anki(chars, words, cat)
    (APP / "data/chars.json").write_text(json.dumps(chars, ensure_ascii=False), encoding="utf-8")
    (APP / "data/words.json").write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    (APP / "data/cats.json").write_text(json.dumps(CATS, ensure_ascii=False), encoding="utf-8")
    cnt = lambda L, l: sum(x["l"] == l for x in L)
    print(f"caratteri: {cnt(chars, 1)} HSK1 + {cnt(chars, 2)} HSK2, da scrivere {sum(x['w'] for x in chars)}")
    print(f"parole: {cnt(words, 1)} HSK1 + {cnt(words, 2)} HSK2")
    needed = {c for x in chars + words for c in x["c"]}
    missing = needed - set(json.loads((APP / "data/strokes.json").read_text(encoding="utf-8")))
    print("caratteri per i tratti:", len(needed), "| mancanti in data/strokes.json:", "".join(sorted(missing)) or "nessuno")


if __name__ == "__main__":
    main()
