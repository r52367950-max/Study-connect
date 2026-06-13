import { PostgresMaterialSearchEngine } from "../src/modules/materials/search/postgres-material-search.engine";
import { MaterialsService } from "../src/modules/materials/materials.service";
import {
  MaterialSort,
  type MaterialSearchQueryDto,
} from "../src/modules/materials/dto/material-search-query.dto";

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
        kind: null,
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
  const engine = new PostgresMaterialSearchEngine(prisma);
  const service = new MaterialsService(
    prisma,
    {} as any,
    { enqueueScan: async () => {} } as any,
    engine,
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
  console.log("min-search-fts-check passed");
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
