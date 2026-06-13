# Material search engine evaluation

## Current PostgreSQL adapter

`MaterialSearchEngine` is the application boundary for approved-material search. The current implementation is `PostgresMaterialSearchEngine`, backed by PostgreSQL `pg_trgm` indexes on `materials.title` and `materials.description`.

### Ranking and filtering

- Weighted text relevance: `title` similarity is multiplied by `3.0`; `description` similarity is multiplied by `1.0`.
- Structured filters: `subject`, `stage`, `grade`, `kind`, `year`, and `region` remain exact/case-insensitive database filters rather than free-text-only signals.
- Safety/public constraints stay mandatory in the adapter: `APPROVED`, `PUBLIC`, and scan status `PASSED` or legacy `NULL`.

## PostgreSQL tsvector option

A PostgreSQL-native next step is adding a generated/search-maintained `tsvector` column such as:

```sql
setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
setweight(to_tsvector('simple', coalesce(description, '')), 'B')
```

Pros: one datastore, transactional consistency, simple deployment. Cons: built-in PostgreSQL tokenizers are weak for Chinese; production Chinese relevance usually requires `zhparser`, `pg_jieba`, or another Chinese segmentation extension that must be supported by the hosting platform.

## External engine options

- **Meilisearch**: easiest operational model, typo tolerance, good fit for small/medium public material catalogs. Chinese quality should be benchmarked with domain queries before adoption.
- **OpenSearch/Elasticsearch**: strongest analyzer ecosystem and scaling controls. Use IK/Jieba/smartcn analyzers for Chinese, plus index aliases for zero-downtime rebuilds. Higher operating cost and more moving parts.
- **PostgreSQL Chinese segmentation extension**: keeps Postgres as the only serving dependency while improving `tsvector` tokenization. Feasibility depends on managed database extension availability.

## Migration guidance

Keep API callers behind `MaterialSearchEngine`. Add index-write events after material approval/offline transitions, run a full backfill, then compare `scripts/fixtures/material-search-quality-samples.json` against both adapters before switching traffic.
