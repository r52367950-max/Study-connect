# 后端性能优化报告(2026-06)

一轮以**数据证据**驱动的后端读路径优化。所有数字都可用仓库内工具复现:
`scripts/perf-bench.ts`(端到端压测)+ 本文记录的 `pg_stat_statements` / `EXPLAIN ANALYZE` 证据。

## 测试环境与方法

| 项 | 值 |
|---|---|
| 数据库 | PostgreSQL 16.13(本地,`shared_buffers=256MB`,pg_stat_statements 开启) |
| 数据量 | 24,000 份资料(15,840 条公开可见)/ 179,779 评分 / 300,000 下载 / 59,955 收藏 / 120,000 浏览事件 / 3,000 用户 / 500 学校 |
| 应用 | `nest build` 产物,Node v22,`LOG_LEVEL=warn`,前后两轮环境完全一致 |
| 方法 | 每端点先预热再采样(公开端点 150–300 次、并发 4–8;受限端点 50 次、并发 2),报告 p50/p95/p99、吞吐、响应字节;另用 `pg_stat_statements` 做单 SQL 归因 |
| 复现 | 起一个带种子数据的库 → 启服务 → `BASE_URL=… DATABASE_URL=… ts-node scripts/perf-bench.ts` |

## 端到端结果(BEFORE → AFTER)

| 端点 | p50 (ms) | p95 (ms) | 吞吐 (req/s) | 传输字节 |
|---|---|---|---|---|
| `GET /materials`(默认列表) | 105.1 → **22.7**(4.6×) | 152.0 → 35.1 | 73 → **332** | 4710 → **1538** |
| `GET /materials?page=50` | 97.3 → **10.9**(9.0×) | 128.1 → 20.4 | 40 → **329** | 4727 → 1558 |
| `GET /materials?sort=downloads` | 150.6 → **29.9**(5.0×) | 185.2 → 41.1 | 26 → **127** | 4721 → 1575 |
| `GET /materials?sort=rating` | 158.7 → **38.4**(4.1×) | 188.5 → 50.7 | 24 → **99** | 4632 → 1579 |
| `GET /materials?q=数学 模拟`(关键词) | 290.0 → **56.9**(5.1×) | 320.9 → 71.6 | 14 → **67** | 4676 → 1382 |
| `GET /materials?q=…&subject=…` | 53.1 → 48.0 | 71.0 → 68.2 | 72 → 78 | 4765 → **1273** |
| `GET /materials/:id`(详情) | 11.4 → **7.9**(1.4×) | 19.0 → 16.0 | 657 → **880** | 617 → 617 |
| `GET /materials/:id/ratings` | 13.9 → 14.6(未改动) | 20.7 → 27.2 | 551 → 491 | 3536 → **974** |
| `GET /materials/recommend`(phase-3 重路径) | 86.6 → **15.8**(5.5×) | 99.5 → 24.0 | 22 → **113** | 3116 → **1047** |

SQL 层归因(`pg_stat_statements` 并发压测下的单查询均值):

| 查询 | BEFORE | AFTER | 倍数 |
|---|---|---|---|
| 默认列表 findMany | 79.84 ms | **0.20 ms** | ~400× |
| 推荐候选池(200 行) | 66.42 ms | **0.75 ms** | ~89× |
| 下载排序页查询 | 136.96 ms | **22.50 ms** | 6.1× |
| 评分排序页查询 | 154.87 ms | **30.57 ms** | 5.1× |
| 关键词搜索页查询 | 165.81 ms | **48.05 ms** | 3.5× |
| 列表 COUNT(*) | 20.66 ms | **3.93 ms** | 5.3× |

## 改了什么(及参数)

### 1. 资料计数反规范化(根因修复)

Prisma 的 `_count: { downloads }`/`orderBy: { downloads: { _count } }` 会生成
`LEFT JOIN (SELECT material_id, COUNT(*) FROM downloads GROUP BY material_id)` ——
**每翻一页都对 30 万行下载表做一次全量聚合**(下载排序做两次);评分排序的相关子查询则是
每候选行 3 次索引扫描(15,840 行 ≈ 每页 4.7 万次扫描)。

新增 `materials.download_count / rating_sum / rating_count` 三列:

- 读路径(列表 4 个分支、详情、收藏列表、推荐候选池)直接读列,均值 0.2–0.75 ms;
- 写路径:下载 = `$transaction([download.create, downloadCount increment])` 原子自增(插入型表,无漂移);
  评分 = upsert 后按权威聚合**重算**写回(收敛式,竞态由下一次评分自愈);
- `scripts/backfill-material-counters.ts`(`npm run backfill:material-counters`)可随时重建;
  本次压测库回填 23,997 行后抽查漂移 = **0**。

### 2. 关键词搜索改走 GIN 三元组索引

原谓词 `similarity(title, q) > 0` 是函数调用,**无法使用** `materials_title_trgm_idx`,
对 15,840 行逐行计算相似度(EXPLAIN:Seq Scan,238.8 ms)。

改为 `title % q OR description % q`(索引可驱动),同事务内
`SET LOCAL pg_trgm.similarity_threshold = 0.001`(参数:`TRGM_MIN_SIMILARITY=0.001`,
保持原"共享至少一个 trigram"的召回;SET LOCAL 事务级生效,连接池零泄漏)。
排序表达式不变(仍按精确 similarity 和排序)。

证据(同一查询 `q=数学 模拟`):
- BEFORE:`Seq Scan … rows=1759, Execution Time: 238.790 ms`
- AFTER:`BitmapOr(materials_title_trgm_idx + materials_description_trgm_idx) … rows=1759, Execution Time: 16.113 ms`(**14.8×**,匹配行数完全一致)

### 3. 复合过滤索引

新增 `@@index([status, visibility, fileSafetyStatus])`:列表 COUNT(*) 从 Seq Scan(8.3 ms)
变 Index Only Scan(**2.5 ms**),并发下均值 20.7 → 3.9 ms。

### 4. HTTP gzip 压缩

`compression({ threshold: 1024, level: 6 })`(`COMPRESSION_LEVEL` 环境变量可调)。
列表响应线上传输 4710 → **1538 B(-67%)**;推荐 3116 → 1047 B;评分列表 3536 → 974 B。
低于 1 KB 的响应(如 `/auth/csrf`)不压缩——同时规避 BREACH 类场景。

### 5. 推荐服务并行化

候选池获取与浏览事件探针 `Promise.all` 并行,phase-2/3 的动态偏好与同校信号并行;
配合计数列,phase-3 重路径 p50 86.6 → **15.8 ms**。

### 6. 顺带修复:生产入口启动即崩溃

`main.ts` 此前 `app.get(Logger)` 用的是 `@nestjs/common` 的 Logger(非 DI 提供者),
自接入 nestjs-pino 后 `node dist/src/main.js` 启动必抛 `UnknownElementException`
(min-* 脚本不经过 main.ts,故 CI 未暴露)。已改为注入 `nestjs-pino` 的 Logger。

## 正确性验证

- 19 个 `npm run test:min-all` 校验脚本全部通过(含 CSRF 回归、限流 429 证据链、上传安全回归);
- `npm run check:quality`(tsc + nest build + prisma validate)通过;
- 关键词搜索匹配集与基线**逐数相等**(1759 = 1759);
- 排序语义不变:下载排序降序、评分排序 `avg DESC NULLS LAST, rating_count DESC, created_at DESC`;
- 详情接口计数与源表实时聚合抽查一致(124/10/2.200);
- API 响应字段形状不变(`avg_score`/`download_count`/`rating_count`)。

## 迁移注意

`prisma/migrations` 不入库:部署时需为 `materials` 新增三列与复合索引生成迁移
(本地 `npm run prisma:migrate`),迁移后执行一次 `npm run backfill:material-counters`。

## 已识别、未在本轮做的事

- 关键词搜索 ~48 ms 的剩余成本在匹配行的 similarity 排序与 COUNT(*) OVER(),可再做
  相关性物化或近似计数,收益中等、复杂度高;
- `(status, downloadCount)` 排序索引:top-N heapsort 已 ~10 ms,暂无必要;
- 每请求一次的 JWT 用户查询(主键点查,~0.05 ms)是会话即时失效的安全设计,属安全门控范围,不动。
