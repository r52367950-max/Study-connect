import { MaterialsService } from "../src/modules/materials/materials.service";
import {
  MaterialSort,
  type MaterialSearchQueryDto,
} from "../src/modules/materials/dto/material-search-query.dto";
import { SearchService } from "../src/modules/search/search.service";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(m);
}

async function run() {
  const prisma: any = {
    $queryRaw: async () => [
      {
        id: "1",
        title: "高一数学函数练习",
        description: "",
        stage: "高中",
        grade: "高一",
        subject: "数学",
        year: 2024,
        region: "北京",
        visibility: "PUBLIC",
        createdAt: new Date(),
        downloadCount: 5,
        ratingSum: 49,
        ratingCount: 10,
        totalCount: 1n,
      },
    ],
    $executeRaw: async () => 0,
    $transaction: async (ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(prisma),
    material: { findMany: async () => [], count: async () => 0 },
  };
  const service = new MaterialsService(
    prisma,
    {} as any,
    { enqueueScan: async () => {} } as any,
    {} as any,
  );
  const res = await service.searchApproved({
    q: "数学",
    page: 1,
    pageSize: 10,
    sort: MaterialSort.LATEST,
  } as MaterialSearchQueryDto);
  assert(res.items[0].id === "1", "q path");
  const res2 = await service.searchApproved({
    page: 1,
    pageSize: 10,
    sort: MaterialSort.LATEST,
  } as MaterialSearchQueryDto);
  assert(Array.isArray(res2.items), "no q path");

  // --- SearchService.suggest: index-driven trigram + file-safety invariant ---
  const capturedSql: string[] = [];
  let setLocalCount = 0;
  const suggestPrisma: any = {
    $executeRaw: async (sql: any) => {
      if (String(sql?.sql ?? sql).includes("similarity_threshold")) setLocalCount += 1;
      return 0;
    },
    $queryRaw: async (sql: any) => {
      capturedSql.push(String(sql?.sql ?? sql));
      return [{ materialId: "m1", title: "高一数学函数练习" }];
    },
    $transaction: async (ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(suggestPrisma),
  };
  const searchService = new SearchService(suggestPrisma);

  const suggestions = await searchService.suggest("数学", 10);
  assert(suggestions.length === 1 && suggestions[0].materialId === "m1", "suggest returns rows");
  assert(setLocalCount === 1, "suggest pins pg_trgm.similarity_threshold via SET LOCAL");
  assert(capturedSql.length === 1, "suggest runs exactly one query");
  assert(/m\.title\s*%\s*/.test(capturedSql[0]), "suggest uses index-driven % operator (not similarity()>0 filter)");
  assert(capturedSql[0].includes("file_safety_status"), "suggest enforces file-safety invariant");

  const empty = await searchService.suggest("   ", 10);
  assert(empty.length === 0 && capturedSql.length === 1, "blank query short-circuits without touching the DB");

  console.log("min-search-fts-check passed");
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
