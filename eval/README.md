# Continual learning eval (Applicable)

Frozen gold set + baseline/learned metrics. **Never** write corrections for `gold.jsonl` job IDs.

## Commands

```bash
npm run db:migrate
npm run eval:export-gold          # stratified freeze → eval/gold.jsonl
npm run learn:seed -- --limit=50  # corrections from rules↔prod disagreements (non-gold)
npm run eval:baseline
npm run eval:learned
npm run eval:compare
npm run eval:curve
npm run correct -- <job_id> <label> "<evidence>"
```

MCP: `report_label` + `stats.learning`.

## Graph queries used

- Upsert `Correction` / `Pattern` nodes; edges `CORRECTED_BY`, `ABOUT_COMPANY`, `USES_PATTERN`
- Similar few-shots: `Pattern <-[:USES_PATTERN]- Correction`
- Soft company prior: `Company -[:POSTS]-> Job` label counts (Postgres prior preferred)
