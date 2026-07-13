# 安全与性能审计报告 / Security & Performance Audit

**日期 Date:** 2026-07-13
**范围 Scope:** 全仓库（NestJS 后端 `src/**` + Next.js 前端 `frontend/src/**` + Prisma schema + 构建/测试链）

本次审计从**前端、后端、功能、构建链、证据链**多个角度进行扫描，采用多 agent 并行审计（后端安全、后端性能、前端安全+性能），再由主线统一修复、验证并出具证据。全部改动均在上述分支完成。

---

## 0. 执行摘要 / Executive Summary

审计发现并**修复了 4 个阻断级（Blocker）缺陷**——这些缺陷会让整个仓库无法构建、无法启动、所有 `npm` 脚本失效——以及一批**安全加固**与**性能优化**。安全审计未发现 Critical/High 可利用漏洞（该仓库已经过多轮安全加固，纵深防御到位）；核心安全增益集中在中低危加固；性能层面修掉了一个仍在做全表扫描的搜索端点。

| 类别 | 已修复 | 已记录待办（需迁移/更大改动） |
|---|---:|---:|
| 阻断级构建/启动缺陷 | 4 | 0 |
| 安全加固 | 4 | 1（刷新令牌轮换）|
| 后端性能 | 3 | 4 |
| 前端安全/性能 | 3 | 3 |

**验证结论:** 修复前 `npm run lint`/`build`/`test:min-all` 全部失败;修复后 `check:quality`、`test:min-all`(含安全门禁 `test:min-rate-limit` 的 429 证据链)、前端 `quality:gate` 全部通过。证据见 §5。

---

## 1. 阻断级缺陷（修复前仓库不可用）/ Blocker fixes

> 这些是本次审计**最重要**的发现:在修复前，后端根本无法编译或启动，CI 也无法通过。

### B1. `package.json` 是无效 JSON（缺少逗号）
- **文件:** `package.json`（`recommend:evaluate` 行末缺少 `,`）
- **影响:** 整个文件不是合法 JSON → **所有 `npm run *` 命令失效**（lint / build / test / prisma 全部无法运行），CI 直接崩。
- **修复:** 补上逗号。`node -e "JSON.parse(...)"` 现已通过。

### B2. 构建失败:`AdminService.getMaterialScanDetails` 缺失
- **文件:** `src/modules/admin/admin.controller.ts:54` 调用了一个不存在的方法。
- **根因:** 该方法在提交 `4d84cbe` 中存在，之后的一次合并把它丢了，但 controller 的路由还在 → `tsc` 报 `TS2339`。
- **修复:** 从历史提交恢复 `getMaterialScanDetails(materialId)` 到 `AdminService`（返回 material 的 `fileSafetyStatus` + 关联的 `fileScanJob` 及最近 10 条扫描报告）。

### B3. 构建失败:`FileScanJob` 类型未导入
- **文件:** `src/modules/materials/file-scan.service.ts:286,301` 使用 `FileScanJob[]`，但第 3 行只导入了 `FileScanJobStatus`。
- **修复:** 在 `@prisma/client` 导入中加入 `FileScanJob` 类型。

### B4.（Critical 运行时）`FileScanService` 依赖注入失败 → 后端无法启动
- **文件:** `src/modules/materials/file-scan.service.ts:181`
- **根因:** `FileScanner` 抽象化（提交 `2d88122`）后，构造函数第 3 个参数 `scanner: FileScanner` 是一个**接口**且带默认值，但**没有 `@Optional()`**。NestJS 会尝试为该接口解析 provider（接口无运行时 token）→ 抛 `UnknownDependenciesException`。由于 `MaterialsModule` 被 `AppModule` 引入，**整个应用无法 bootstrap**，所有加载该模块的 `min-*` 测试全部失败。
- **修复:** 给该参数加 `@Optional()`,NestJS 传入 `undefined`,构造函数默认值 `createFileScannerFromEnv()` 生效。与 CORS/密钥的「生产启动即断言」风格一致。
- **验证:** 修复后 `min-auth` 等模块测试从「DI 崩溃」变为通过。

---

## 1.5 被「红色套件」长期掩盖的测试/门禁回归 / Regressions hidden behind a red suite

> 由于 B4 的 DI 崩溃让 `test:min-all` 在第 1 个脚本就失败，后续多个测试从未真正运行，掩盖了它们各自的过期问题。修复 B1–B4 后逐个暴露并修复:

### R1. 前端 CI 门禁全红:CSRF 令牌 fixture 过期
- **文件:** `frontend/src/__tests__/api-client-{csrf,401,refresh}.test.ts`
- **根因:** 提交 `534ace0` 给 `client.ts` 加了 `CSRF_TOKEN_PATTERN = /^[a-f0-9]{64}$/i`(与后端 `randomBytes(32).toString('hex')` 一致)但**未更新测试**;测试仍用 `test-csrf` 等短 token,不满足 64-hex → 客户端改走 `GET /auth/csrf` 引导 → mock 未处理 → 断言快失败/超时。7 个用例失败,前端 `quality:gate` 全红。
- **修复:** 把 4 处 fixture 改为合法 64-hex(贴合真实后端格式)。65/65 通过。

### R2. `min-auth-session-invalidation` 的 Prisma mock 缺 `$transaction`
- **文件:** `scripts/min-auth-session-invalidation-check.ts`
- **根因:** 提交 `3e0979b`(admin 审计日志)把 `banUser` 包进 `$transaction` 并写 `adminAuditLog`,但该测试 mock 未同步 → `this.prisma.$transaction is not a function`。
- **修复:** 给 mock 补 `$transaction`(交互式事务语义)与 `adminAuditLog.create`。

### R3.（安全门禁盲区）`min-csrf-regression` 路由发现漏掉整个 materials 控制器
- **文件:** `scripts/min-csrf-regression-check.ts`
- **根因:** 该安全回归脚本用正则发现所有写路由并断言其受 CSRF 保护,但正则只认**单引号**装饰器;提交 `abca142` 把 `materials.controller.ts` 改成**双引号**(`@Controller("materials")`)后,整个文件被跳过 → 写路由从 16 变 14。**后果是该守卫从此不再校验 `/materials` 写路由的 CSRF 覆盖——一个隐蔽的安全检查盲区。**
- **修复:** 正则改为引号无关(`['"]`)。守卫现覆盖 16 条写路由(含 `POST /materials`、`POST /materials/:id/ratings`),**强化**而非削弱检查。

### R4. `min-file-scan-async` mock 与断言双重过期
- **文件:** `scripts/min-file-scan-async-check.ts`
- **根因:** 提交 `cc2af1c`(强化扫描任务领取)把领取逻辑改为 `updateMany` 条件领取、并把终态从 `FAILED` 改为 `DEAD_LETTER`,同步更新了代码与专门的并发测试,但**未更新**这个更早的异步测试:mock 缺 `updateMany`/`findUnique`,断言仍期望 `FAILED`。
- **修复:** mock 补 `updateMany`/`findUnique`(时间闸门由 `min-file-scan-claim-concurrency-check` 覆盖);终态断言改为 `DEAD_LETTER`(贴合当前设计)。超时重试链 attempts 1→2→3 终态 DEAD_LETTER 验证通过。

> 这些都不是「为过测而改测」:R1/R2/R4 是让 fixture/mock 贴合已合入的真实实现;R3 是修复安全守卫自身的盲区(反而更严格)。

---

## 2. 安全加固 / Security hardening

后端安全审计（覆盖 authN/authZ、IDOR、CSRF、限流、注入、上传扫描绕过、JWT、OTP、密钥、错误处理）**未发现 Critical/High 可利用漏洞**。已确认到位的纵深防御见 §2.3。本次落地的加固:

### S1.（已修复，Low→Med）`POST /auth/refresh` 缺少专用限流
- **文件:** `src/modules/auth/auth.controller.ts`
- **问题:** 除 refresh 外的所有 auth 端点都有 `@RateLimit`;refresh 仅受全局 `global-basic`(默认 120/min/IP)约束,持有 refresh token 者可低摩擦地反复 churn access token。
- **修复:** 新增 `@RateLimit({ name: 'auth-refresh', limit: 30, windowMs: 60_000 })`,并在 `docs/rate-limit-rules.md` 补充该规则。

### S2.（已修复，Low）登录计时侧信道导致用户枚举
- **文件:** `src/modules/auth/auth.service.ts`（login 无用户/被封分支）
- **问题:** 对不存在/被封用户,代码**不运行** scrypt 直接返回 401;对存在用户会先跑 scrypt(数十毫秒)。尽管错误信息一致,scrypt 的耗时差成为「账号是否存在」的可观测预言机。
- **修复:** 无用户分支若带 password,则对一个惰性生成的 decoy hash 执行一次等价 scrypt,抹平计时差。

### S3.（已修复,Low）OTP 控制台兜底 provider 会明文打印验证码
- **文件:** `src/modules/auth/otp/sms.provider.ts`、`mail.provider.ts`
- **问题:** 未配置 Aliyun/SMTP 时会自动回退到 `Console*Provider`,后者用 `logger.log` 明文输出 `code=<OTP>`;pino redact 只脱敏结构化字段,不含这些自由文本。生产若漏配即把实时验证码写进日志。
- **修复:** 两个工厂在 `NODE_ENV=production` 且未配置真实 provider 时**快速失败抛错**(拒绝启动),而非静默回退到会泄露验证码的 console provider;开发环境行为不变。

### S4.（已修复,构建/运行安全）见 §1 B4——`FileScanService` 无法注入本质上也是可用性/安全影响(文件扫描是下载放行的前置门禁)。

### 待办（需更大改动，已记录）

**S-TODO1.（Medium，安全审计首要建议）刷新令牌未真正轮换 / 无重放检测**
- **文件:** `src/modules/auth/auth.service.ts:refreshAccessToken`;schema 无 `RefreshToken`/`Session` 表。
- **问题:** refresh token 是无状态 JWT,刷新时以**相同 `tokenVersion`** 重新签发,不递增、无服务端 jti/allow-list、非一次性。被窃取的 refresh token 在其 TTL(默认 7 天)内可反复重放,且无重用检测;只能全局吊销(bump `tokenVersion`),无法单设备下线。
- **建议修复:** 引入服务端令牌族追踪——持久化每个 refresh token 的 hash/jti,使用即标记 consumed;若出现已 consumed 令牌被再次提交,则吊销整族并告警。缓解现状:cookie 为 HttpOnly + Secure(生产) + SameSite,浏览器侧 XSS 窃取不是主要通道。
- **为何未在本次落地:** 需新增 Prisma 模型 + 迁移 + 改动认证核心路径,风险与体量较大;`min-*` 无对应回归;宜作为独立、带完整安全门禁证据的 PR 推进,而非在本次自动化审计中仓促改认证。同时建议给该端点叠加更强限流(已由 S1 部分覆盖)。

### 2.3 已验证到位的防御（正向确认）
- 全局 guard 链 `RateLimit → Csrf → JwtAuth → Roles`;admin 路由类级 `@Roles(ADMIN)`;所有 `@Public` 均为真正公开的读/认证端点。
- CSRF 双提交 token(`timingSafeEqual` + 64-hex 校验) **叠加** Origin/Referer 白名单,缺失即 fail-closed,覆盖全部写方法。
- 无 SQL 注入:所有 `$queryRaw/$executeRaw` 使用参数化 `Prisma.sql`;唯一的 `Prisma.raw` 注入的是硬编码数值常量。
- 无 IDOR:favorites/ratings/view-events/profile/下载令牌兑换均以 `req.user.id`/`token.userId` 归属校验。
- JWT 强制 `alg==='HS256'` + `timingSafeEqual` 验签,无 alg 混淆/`alg:none`。
- 上传扫描不可绕过:下载要求 `status=APPROVED` 且 `fileSafetyStatus=PASSED`;新上传初始 `QUARANTINED`。
- cookie HttpOnly/Secure(生产)/SameSite;安全响应头 CSP `default-src 'none'`、`X-Frame-Options: DENY`、HSTS、`nosniff`。
- 生产启动断言:强 JWT/OTP 密钥、严格 HTTPS CORS 白名单、Secure cookie。

---

## 3. 性能优化 / Performance

前次 `docs/perf-optimization-report.md` 已优化 `/materials` 列表/详情/推荐热路径(计数器去规范化、GIN-trigram 搜索、gzip)。本次聚焦其**遗留缺口**。

### P1.（已修复，High）`/search/suggestions` 仍在做全表 `similarity()` 顺序扫描
- **文件:** `src/modules/search/search.service.ts`
- **问题:** `WHERE similarity(m.title, q) > 0 OR similarity(description, q) > 0` 是左侧函数调用,**无法命中** `materials_title/description_trgm_idx`,对每一条 approved+public 行都计算 `similarity()`——正是 perf 报告 §2 在 `/materials?q=` 已消除的反模式(该报告实测同形状查询 238ms → 16ms)。而本端点是 `@Public()` 自动补全,按键触发,延迟更敏感。
- **修复:** 改用索引可用的 `%` trigram 运算符做 `WHERE`,并用 `SET LOCAL pg_trgm.similarity_threshold` 事务(与 `materials.service.ts` 完全一致的写法),`similarity()` 只保留在 `ORDER BY` 里排序已匹配行。**无需迁移**(GIN 索引已存在)。

### P2.（已修复，Medium）推荐候选查询未做列投影(`SELECT *`)
- **文件:** `src/modules/materials/recommendations.service.ts`(profile/popular/recent/byIds 四个 `findMany`)
- **问题:** 四个候选查询都没有 `select`,每行返回全部列(含大字段 `description` 及 `fileKey`/`reviewComment`/`status` 等 ranker 用不到的列)。按候选上限,单次 recommend 最多水合 ~300 行全列。
- **修复:** 抽出共享 `CANDIDATE_SELECT`(仅 ranker 实际读取的 12 列)并用 `Prisma.MaterialGetPayload` 推导类型,四个 `findMany` 全部加 `select`,收窄行宽与反序列化成本。

### P3.（已修复，Medium）审计日志分页 `page` 无上界
- **文件:** `src/modules/admin/dto/audit-logs-query.dto.ts`
- **问题:** `pageSize` 有 `@Max(100)` 但 `page` 无 `@Max`(与其他分页 DTO 不一致),`OFFSET=(page-1)*pageSize` 可被推到任意深,offset 分页会扫描并丢弃全部跳过行。
- **修复:** 给 `page` 加 `@Max(1000)`,与 `material-search-query.dto.ts` 对齐。

### 待办（需迁移或更大改动，已记录）
- **P-TODO1（High）:** phase-3 推荐把最重的「同校收藏」三表 join `COUNT(DISTINCT)` 跑了**两次**(`schoolCandidateIds` 与 `getColleagueSignals`,后者是前者超集)。可合并为一次查询并在内存取 top-N。需仔细改推荐逻辑,建议单独 PR 带 `min-recommend*` 回归。
- **P-TODO2（Medium，需迁移）:** `popularCandidates`/`sort=downloads` 的 `ORDER BY downloadCount DESC` 无 `(status, downloadCount)` 索引;审计日志无过滤时 `ORDER BY createdAt DESC` 无 `(createdAt)` 单列索引。建议加 `@@index`(注意 `prisma/migrations` 被 git-ignore,需本地生成迁移)。
- **P-TODO3（Medium）:** 无 HTTP 缓存/`Cache-Control`;`/schools`(~500 近静态行,onboarding 每次按键都查)是理想缓存目标。建议先给公开 GET 加 `Cache-Control`+`ETag`,后续接 Redis 读穿透缓存(roadmap 工作流 P)。
- **P-TODO4（Medium）:** 审计日志列表 `getAuditLogs` 未投影,拖带 `before`/`after` 两个完整 JSON 快照。因涉及 admin API 契约变更,建议与前端协同后单独收窄。
- 其余 Low 项(评分写入的聚合重算、view-event 三次串行往返、下载令牌串行校验、深 offset 分页)见 agent 明细,按容量增长择机处理。

---

## 4. 前端安全与性能 / Frontend

前端整体加固良好:无 `dangerouslySetInnerHTML`/HTML 注入点,token 从不落 web storage(仅内存 + HttpOnly cookie),open-redirect 有 `safeRedirect` 统一防护,CSRF 双提交正确,外链/`window.open` 均带 `noopener`。**无 Critical/High 安全问题。** 本次落地:

### F1.（已修复，Medium 性能）`useAuth()` 订阅整个 zustand store → token 刷新触发全列表重渲染
- **文件:** `frontend/src/hooks/use-auth.ts`
- **问题:** `const { user, ... } = useAuthStore()` 无 selector,store 任一字段变化(包括每 ~15 分钟 token 刷新写入 `accessToken`)都会让所有消费者重渲染;而 `useAuth()` 被**每个 `MaterialRow`**、侧边栏、详情页调用。
- **修复:** 改用逐字段 selector(`useAuthStore(s => s.user)` 等),消费者只在 `user`/`initialized` 变化时重渲染,与 `use-favorites`/`use-profile` 的既有写法一致。

### F2.（已修复，Low 安全）下载 URL 未校验协议即 `window.open`
- **文件:** `frontend/src/app/materials/[id]/page.tsx`
- **问题:** 直接 `window.open(downloadUrl, ...)`,未断言是 `http(s):`。后端若被错配/篡改返回 `javascript:`/`data:` URL,存在在应用上下文执行的纵深风险(来源可信,现实概率低)。
- **修复:** 打开前 `new URL(...)` 解析并校验 `protocol` 仅允许 `http:`/`https:`,否则抛错走失败提示。

### F3.（已修复，Low 性能）命令面板(`cmdk`)静态引入、常驻每个 DirB 路由
- **文件:** `frontend/src/app/(app)/layout.tsx`
- **问题:** `CommandPalette`(及 `cmdk`)进了每个 `(app)` 路由的首屏 bundle,尽管仅 ⌘K 时才显示。
- **修复:** 改为 `next/dynamic`(`ssr:false`)懒加载。它平时渲染 `null`,无布局抖动;⌘K 监听在 chunk 加载后即刻挂载。

### 待办（已记录）
- **F-TODO1:** 长无限滚动列表未虚拟化,且收藏切换 `onSettled` 会 invalidate 整个 `['materials']`/`['recommendations']`,长列表下触发全量刷新+重渲染。建议虚拟化 + 收窄失效范围。
- **F-TODO2:** 个性化查询(profile/favorites/recommendations)串行等待 `AuthBootstrap` 的 `getMe()`;可服务端水合 user 削减一次 RTT。
- **F-TODO3:** profile「我的上传」取 20 显示 6 且缓存键不与首页共享;等 `/users/me/materials` 端点落地后收敛。

---

## 5. 证据链 / Evidence chain

> 采集命令与结果(在本分支修复后)。

### 修复前基线（Blocker 证据）
```
$ node -e "JSON.parse(fs.readFileSync('package.json'))"   # 修复前: SyntaxError（缺逗号）
$ npm run lint    # 修复前: TS2339 getMaterialScanDetails / TS2304 FileScanJob
$ npm run test:min-all   # 修复前: min-auth FAIL —— FileScanService UnknownDependenciesException
```

### 修复后（本分支实测，全部通过）

**后端 `npm run check:quality`（lint + build + prisma validate）:** 退出码 0，`The schema at prisma/schema.prisma is valid 🚀`。

**后端 `npm run test:min-all`（19 个验证脚本，安全门禁全集）:** `MIN_ALL_EXIT:0`，`ALL PASS - min validation scripts completed successfully.`
```
PASS - test:min-auth                              PASS - test:min-rate-limit
PASS - test:min-auth-session-invalidation         PASS - test:min-rate-limit-identity
PASS - test:min-material-upload                   PASS - test:min-recommendations
PASS - test:min-admin-review                      PASS - test:min-recommend-tiering
PASS - test:min-material-search                   PASS - test:min-admin-update-review-errors
PASS - test:min-search-fts                        PASS - test:min-material-upload-size-boundary
PASS - test:min-material-download                 PASS - test:min-material-upload-security-regression
PASS - test:min-material-rating                   PASS - test:min-cors-config
PASS - test:min-csrf-regression                   PASS - test:min-auth-token-hardening
PASS - test:min-file-scan-async
```

**前端 `npm run quality:gate`（build → lint → vitest）:** 退出码 0，`Test Files 9 passed (9) / Tests 65 passed (65)`。

**修复前 vs 修复后:** 修复前 `npm run test:min-all` 在**第 1 个脚本**（min-auth）即因 FileScanService DI 崩溃而失败；本次修复了 4 个阻断级缺陷 + 4 个被「红色套件」长期掩盖的过期测试/门禁缺口（session-invalidation mock、CSRF 前端 fixture、CSRF 路由发现盲区、file-scan-async mock/断言），使 **19/19 后端 + 65/65 前端**全绿。

### 安全门禁 429 证据链（`test:min-rate-limit`，CI 硬校验）
```
login 429 check passed: 429
upload 429 check passed: 429
admin 429 check passed: 429
rate_limit_blocked log assertion passed: login/upload/admin
```
(改动 `/auth/refresh` 限流后仍完整,三条链路 429 + 日志断言未被破坏。)

---

## 6. 结论 / Conclusion

本次改动**恢复了仓库的可构建、可启动状态**(4 个阻断级缺陷),并在不弱化任何安全门禁的前提下落地了 4 项安全加固、3 项后端性能与 3 项前端优化,全部通过 `check:quality`、`test:min-all`(含 429 证据链)与前端 `quality:gate`。更大体量的项(刷新令牌轮换、索引迁移、Redis 缓存、列表虚拟化)已按风险与依赖拆分为带明确修复路径的待办,建议各自独立成 PR 并按 `docs/security-gate-policy.md` 补齐证据。

> 注:凡涉及 `schema.prisma` 索引的待办都需要本地 `npm run prisma:migrate` 生成迁移(`prisma/migrations` 被 git-ignore,不提交迁移文件)。
