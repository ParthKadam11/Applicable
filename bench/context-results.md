# Context layer benchmark

Generated: 2026-11-14T15:47:27.374Z
Graph enabled: true

Baselines:
- **A naive** = full title+description blobs for keyword-matched India-OK tech jobs
- **C compact** = same rows as `{id,title,company,label,apply_url}` JSON
- **B graph** = explore path lines or skill_gap JSON (approx chars/4)
- **overlap@10** = |graph∩compact| / 10 on job ids (skill_gap uses example job ids)

| Question | Tool | A jobs | A tokens | A ms | C tokens | B tokens | B ms | B lines/gaps | overlap@10 | B/A | B/C |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| backend jobs similar to companies I'd like, India OK (start rescale) | explore | 2 | 2936 | 60 | 98 | 0 | 306 | 0 | 0.00 | 0.000 | 0.000 |
| what skill unlocks most India remote jobs for a Node+Postgres dev | skill_gap | 2 | 2936 | 21 | 98 | 1 | 30 | 0 | 0.00 | 0.000 | 0.010 |
| India-OK jobs requiring typescript | explore | 1 | 1809 | 13 | 52 | 37 | 21 | 1 | 1.00 | 0.020 | 0.712 |
| open jobs at alpaca | explore | 3 | 4746 | 9 | 150 | 108 | 54 | 3 | 1.00 | 0.023 | 0.720 |
| India-OK kubernetes roles | explore | 2 | 3330 | 11 | 101 | 72 | 24 | 2 | 1.00 | 0.022 | 0.713 |
