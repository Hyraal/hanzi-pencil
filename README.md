# Hanzi Pencil

Web app per iPad per esercitarsi nella scrittura dei caratteri e delle parole HSK 1-2 con la Apple Pencil, secondo l'esame HSK 3.0 ed. 2026: 371 caratteri (246 + 125, di cui 100 da saper scrivere) e 279 parole di 2+ caratteri (163 + 116), più il resto dell'elenco Anki HSK1-2 (standard 2021): in tutto 616 caratteri (271 + 345) e 898 parole (272 + 626), divisi per categoria.

I dati (`data/chars.json`, `data/words.json`, `data/cats.json`) si rigenerano con `python3 tools/build_2026.py` dalle liste ufficiali 2026 del wiki Obsidian e dai mazzi Anki (dettagli nell'intestazione dello script).
Ordine dei tratti e dati: [Hanzi Writer](https://hanziwriter.org) (MIT) e Make Me a Hanzi.
