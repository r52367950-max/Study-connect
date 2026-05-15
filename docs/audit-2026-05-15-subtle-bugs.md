# StudyConnect — 微小 Bug 与一致性扫描报告

- 日期：2026-05-15
- 分支：`claude/dirb-phase-2-onboarding`（含已合并的阶段 1 + 本次阶段 2 的入职/双标识登录改动）
- 方式：两个独立 sub-agent 并行扫——后端、前端各一个，明确告知避开此前安全审计已覆盖的"大件"（JWT secret 强度、X-Forwarded-For 信任、scryptSync 同步、HSTS、OTP 日上限、文件扫描进程内 setTimeout、Redis、监控等），只挑没列过的微小问题
- 共 52 条；已剔除 agent 自我回收 / 弱信号 / 工作流 S/P 重复项

## TL;DR

约 1/3 是真实可触发的 bug（IDOR / 标识符未归一化 / 状态码 spec 违规 / 中间件 matcher / 跨账号 token 残留 / 开放重定向），1/3 是契约一致性与回归测试漏洞（CSRF/CORS 解析分叉、min-* 测试只 log 不 assert、CI 只跑 1/15 个回归脚本），剩下 1/3 是体验/清理。下面"建议下一个 PR"段落给出了打包顺序。

---

## 1. Critical — 真实 bug，影响安全或功能正确性

| # | 严重度 | 位置 | 问题 |
|---|---|---|---|
| 1 | BUG | `src/main.ts:21-28` | 全局 `ValidationPipe` 未设 `errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY`，所有 DTO 校验失败回 400 而不是 spec 要求的 422，影响每一个写接口 |
| 2 | BUG | `src/modules/auth/auth.service.ts:51,54,109,112` | 用 `BadRequestException`(400) 抛多个本应 422 的错（"Email or phone required"、"Password or OTP required"、"Identifier already exists"）|
| 3 | BUG | `src/common/rate-limit.guard.ts:59-78` | 手机号登录绕过登录失败锁 + 每身份计数器：guard 只从 body 取 `email` 喂给锁；phone 登录全靠全局 IP 桶。`auth.service` 把失败写到 `login-email:<phone>` 但 guard 从不读 |
| 4 | BUG | `src/modules/auth/otp/otp.controller.ts:31` + `auth.service.ts:115` | 手机号未归一化：`138-0000-0000` 与 `13800000000` 在 `otp_attempts` 是不同行，OTP 永远验不上 |
| 5 | BUG | `src/modules/materials/materials.service.ts:273-302, 323-324` | 评分接口可访问 PRIVATE+APPROVED 资料：`upsertMaterialRating` 与 `listApprovedMaterialRatings` 用 `ensureApprovedMaterial`（无 visibility 校验），`getApprovedDetail` 却用 `ensurePublicApprovedMaterial`。猜中私有 UUID 的人可以写评分、读评分列表 |
| 6 | BUG | `src/modules/view-events/view-events.service.ts:9-25` | `/view-events` 是非公开资料的存在性 oracle：接受任意 UUID，PENDING/REJECTED/OFFLINE 都返回 `{logged: true}` |
| 7 | BUG | `src/common/security/csrf.guard.ts:65-71` vs `src/common/security/cors-config.ts:1-23` | CORS 用 `new URL(o).origin` 归一化（去默认端口），CsrfGuard 直接字符串比。配 `CORS_ORIGIN=https://foo:443` 时浏览器 `Origin: https://foo` 过 CORS 但被 CSRF 拒，所有写请求 403 |
| 8 | BUG | `frontend/src/app/(auth)/login/page.tsx:45-48` + `register/page.tsx`（同模式） | 开放重定向：`searchParams.get('redirect')` 直接喂给 `router.replace`，`/login?redirect=//evil.com` 跳外站 |
| 9 | BUG | `frontend/src/components/shared/onboarding-gate.tsx:26` | 首次渲染 `usePathname()` 返回 `null` 时 `pathname.startsWith(...)` 抛 TypeError 崩 |
| 10 | BUG | `frontend/src/middleware.ts:17` | Next.js matcher `:path*` **不**匹配 bare 路径——`/onboarding`、`/upload`、`/profile`、`/admin` 这 4 条 bare URL 实际没被 middleware 守住，只靠各页面的 client-side useEffect。matcher 需同时列出 bare 形式 |
| 11 | BUG | `src/modules/auth/auth.controller.ts:122-133` | `logout` 在 access token 过期时整个失败，cookie 不清——用户卡死无法登出。和工作流 S7 同处不同视角，可一起修 |
| 12 | BUG | `auth.controller.ts:208`、`jwt-auth.guard.ts:58`、`csrf.service.ts:42` | 未捕获的 `decodeURIComponent` 抛 URIError → 500：`Cookie: csrf-token=%FF` 即可触发，trivial DoS |
| 13 | BUG | `materials.controller.ts:100,108,120,132` + `admin.controller.ts:46,53,59,65` | `@Param('id')` 未用 `ParseUUIDPipe`：无效 UUID 进 Prisma 抛 → 500 而不是 spec 要求的 404。`favorites` 已用，跨 controller 不一致 |
| 14 | BUG | `materials.service.ts:46-48` | 文件先写 MinIO 再写 Prisma，DB 失败 → 对象成永久孤儿，无回滚 |
| 15 | LIKELY-BUG | `frontend/src/lib/auth-store.ts:18-23` | `setAuth(user)` 不带 token 时保留前账号 token (`accessToken: accessToken ?? state.accessToken`)：重新登录若响应漏了 token 就跨账号串号 |
| 16 | BUG | `frontend/src/app/(auth)/login/page.tsx:129-135` + `register/page.tsx:99-105` | OTP 倒计时跨标识符 tab 泄漏：给邮箱发码后切到手机号 tab，按钮仍按邮箱那次的 60s 倒计时禁用 |
| 17 | BUG | `auth.controller.ts:135-152` | `change-password` 没 `@RateLimit`，每次跑 `scryptSync`，对单个用户能轻易 grind |
| 18 | BUG | `users.service.ts:38-55,115` | `schoolId` 与 `schoolNameFreeText` 在同一 PUT 中后者覆盖前者；`?? null` 吞没显式 `null`——用户用 `{schoolId: null}` 想清空学校的请求行为不确定 |

## 2. High — Spec / 契约一致性

| # | 严重度 | 位置 | 问题 |
|---|---|---|---|
| 19 | LIKELY-BUG | `materials.service.ts:97-118` | `sort=rating` 全表加载到内存再排序分页（无 `take`），单次请求可吃光内存 |
| 20 | LIKELY-BUG | `materials.service.ts:236-271` | APPROVED 但 `fileSafetyStatus` 不是 `PASSED` 的资料仍在列表/详情/评分中可见，只下载被门禁——和"先隔离再放行"的语义自相矛盾 |
| 21 | LIKELY-BUG | `materials.controller.ts:161-173` | multer 超 size 返回 413，spec 要 422；且 `MAX_UPLOAD_SIZE_MB` 在 decorator 求值，运行时改 env 不影响 multer，与手写 `assertUploadFileSize` 会悄悄不一致 |
| 22 | SMELL | `auth.service.ts:263` | `changePassword` 错误密码返回 403，应是 401（重新认证失败）或 422 |
| 23 | SMELL | 各 paginated query DTO | `page` 都没 `@Max`，`?page=99999999999999` 直接进 Prisma `skip`，无谓 DoS 表面 |
| 24 | SMELL | DTO 跨模块 | 一会儿 `@Type(() => Number)` 一会儿 `@Transform`：`?page=` 空串行为不一致（`@Type` 路径变 0 → 触发 `@Min(1)` 失败；`@Transform` 走 fallback） |
| 25 | LIKELY-BUG | `favorites.service.ts:54-69` | favorites 列表把 `status`/`visibility` 原样返回——资料被驳回/下线后用户能看到状态变化，泄漏审核动作 |
| 26 | SMELL | `auth.service.ts:130-136` | 单元素 `OR` 是为兼容 `PrismaServiceMock` 写的 prod 代码——产品代码迁就 mock |

## 3. High — 测试 / CI 覆盖漏洞

| # | 严重度 | 位置 | 问题 |
|---|---|---|---|
| 27 | BUG | `scripts/min-all-runner.cjs:4-15` | runner 漏跑 4 个脚本：`test:min-admin-update-review-errors`、`test:min-material-upload-size-boundary`、`test:min-material-upload-security-regression`、`test:min-cors-config`——`package.json` 里有，runner 没列 |
| 28 | BUG | `scripts/min-auth-token-hardening-check.ts` | 孤儿脚本，`package.json` 无对应 npm script，永远不跑 |
| 29 | BUG | `scripts/min-auth-check.ts:213-225` + `min-admin-review-check.ts:250-313` | 只 `console.log`，从不 `assert`——回归直接绿灯通过 |
| 30 | BUG | `scripts/min-material-upload-check.ts:249` | 运行时改 `MAX_UPLOAD_SIZE_MB` 对 multer 无效（见 #21），"too large" 在 multer 路径上是假阳性 |
| 31 | BUG | `scripts/min-csrf-regression-check.ts:22-40` | CSRF 回归只扫 3 个 controller，漏掉 `/auth/otp/send`、`/users/me/profile`、`/view-events`、`POST/DELETE /favorites/:id`——5 条状态改变路由不在断言目录 |
| 32 | SMELL | `.github/workflows/security-gate.yml` | CI 只跑 `test:min-rate-limit`：15 个 min-* 脚本里只有 1 个进了强制门禁 |
| 33 | BUG | `frontend/src/__tests__/auth-flow.test.ts:31` | `beforeEach` 只清 `user`，`accessToken`/`initialized` 留存——跨测试污染，未来改 token 会因前测残留"碰巧通过" |
| 34 | SMELL | `frontend/src/__tests__/api-client-401.test.ts:9-23` | 覆盖 `window.location` 没 restore，单文件目前 OK，靠 vitest jsdom 隔离兜底 |

## 4. Medium — UX 与边角

| # | 严重度 | 位置 | 问题 |
|---|---|---|---|
| 35 | LIKELY-BUG | `frontend/src/components/onboarding/school-picker.tsx:32` | `freeMode` 初始 state 一次性算，profile 后到时 picker 已锁死 `freeMode=false` |
| 36 | BUG | `frontend/src/components/onboarding/onboarding-form.tsx:59` | `useState(() => toDraft(initialValue))` 只读一次，profile 后到时表单不刷新 |
| 37 | SMELL | `frontend/src/app/onboarding/page.tsx:45-47` | `useProfile` 报错时静默渲染空表单，无错误提示 |
| 38 | SMELL | `frontend/src/app/(auth)/login/page.tsx` | 登录后手动 `await getMyProfile()` 不进 React Query cache，下一页 `useProfile` 又请求一次。改用 `queryClient.fetchQuery` + `setQueryData(['profile'], ...)` |
| 39 | SMELL | `frontend/src/app/(auth)/login/page.tsx:71` + `register/page.tsx:48` | `cooldownSeconds > 0 ? res.cooldownSeconds : 60`：服务器 0 想表达"无冷却"被前端覆盖成 60s |
| 40 | LIKELY-BUG | `frontend/src/app/profile/page.tsx:57` + `components/layout/navbar.tsx:80` | 渲染 `user.email` 不处理 null，手机号注册的用户看到一行空 `<p>` |
| 41 | SMELL | `frontend/tailwind.config.ts:13` | `var(--font-inter)` 名字误导：globals.css 的 var 是 CJK fallback 栈，没真的加载 Inter |
| 42 | MINOR | `frontend/src/components/auth/otp-input.tsx` | 没处理 IME composition，中文软键盘合成中可能跳一下、backspace 失灵 |

## 5. Low — 烟雾 / 清理

| # | 严重度 | 位置 | 问题 |
|---|---|---|---|
| 43 | MINOR | `src/common/index.ts` | 只有 `export {};`，死文件 |
| 44 | SMELL | 多个 controller | 显式 `@UseGuards(RolesGuard)` 与 `APP_GUARD` 重复注册，guard 跑两次 |
| 45 | SMELL | `src/common/rate-limit.decorator.ts` | `RateLimitRule.keyPrefix` 字段定义了但路由规则从不用，半成品 API |
| 46 | SMELL | `prisma/schema.prisma:124` | `fileSafetyStatus String?` 不是 enum；`materials.service.ts:453` 日志里 `?? 'NULL'` sentinel 还会和真实字符串 `'NULL'` 撞 |
| 47 | MINOR | `src/modules/view-events/view-events.controller.ts:20` | `view-events-log` 限流 120/60s 等于全局默认，加了等于没加 |
| 48 | SMELL | `src/modules/admin/admin.service.ts:50,57,64` | reviewer 身份当字符串塞进 `reviewComment`，没 `reviewedBy` 列——审计困难 |
| 49 | SMELL | `docker-compose.yml` | 没 `minio` 服务但代码强依赖——本地 docker-compose 跑不了上传流程 |
| 50 | SMELL | `.env.example` | 缺 `RATE_LIMIT_*`、`JWT_*_TTL_SECONDS`、`FILE_SCAN_*`、`AUTH_OTP_TEST_BYPASS`、`MINIO_USE_SSL/REGION`——新人不知道 |
| 51 | SMELL | `src/modules/materials/recommendations.service.ts:153-167` | K-匿名 SQL 没过滤 `m.visibility='PUBLIC'`，靠后续 `materials.findMany` 兜底，未来重构易踩坑 |
| 52 | SMELL | `src/modules/auth/auth.service.ts:238-246` | `rotateTokenVersion` 内 `if (typeof prisma.user.update !== 'function') return;` 是 mock 兼容代码，prod 死分支但会掩盖测试 stub 漏洞 |

---

## 建议打包顺序

| 包 | 内容 | 范围 |
|---|---|---|
| **Sweep PR**（紧接阶段 2，独立 PR） | #1、#2、#3、#4、#7、#8、#9、#10、#12、#13；顺手补 #31、#33 测试 | 全是小改但堵真实漏洞，互相低耦合，分支建议 `claude/sweep-phase-2-bugs` |
| **工作流 S 下一轮**（按安全门禁走） | #5、#6、#11、#14、#15、#17、#20、#22 | 安全/正确性；走 `docs/security-gate-policy.md` 四项自查 + 429 证据链 |
| **挂阶段 5**（"修改入职信息"复用本就要碰这些组件） | #35、#36、#37、#38 | `OnboardingForm` / `SchoolPicker` 重写 |
| **挂阶段 3 navbar 重写** | #40 | navbar 反正要被侧栏替代 |
| **挂阶段 4/5 真实分页** | #19、#25 | 列表改造时一起 |
| **专门的"测试质量"小 PR** | #18、#23、#27、#28、#29、#30、#32、#41、#42、#44–#52 | 不阻塞功能，可单独 batch |

## 已**没**找到的（agent 主动报告"看了没问题"）

- SQL 注入：唯一 `$queryRaw` 用 `Prisma.sql` + `::uuid` 参数化（推荐服务）
- 评分计算 / `slice(skip, skip+pageSize)` 边界
- `tokenVersion` 比较精度
- OTP 计数 off-by-one：`count >= VERIFY_MAX_ATTEMPTS` 配合后置 increment 恰好放行 5 次，逻辑正确
- 已读模块的 Prisma `select` vs 返回类型一致性
- 大多数 a11y label / htmlFor 关系
- 明显的 hydration 失配（仅 `<footer>{getFullYear()}</footer>`，可容忍）

## 方法论备注

- 两个 sub-agent 各扫 ~30+ 文件，明确告知避开此前安全审计的 14 类已知项
- 所有引用都给到 `file:line`，未做 fix
- 部分 agent 自标 `BUG` 后又自我回收的（OTP autoFocus effect、useOtpCountdown cleanup 等）已剔除
- 与工作流 S/P 重复的（X-Forwarded-For、JWT_SECRET 强度、scryptSync、HSTS、FTS、Redis、Pino、Sentry…）已合并到现有路线图，本报告不重复列
