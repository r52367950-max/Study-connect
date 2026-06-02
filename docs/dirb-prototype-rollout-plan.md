# DirB 原型落地 — 实施路线图

> 本文件是 StudyConnect "Claude Design 交互原型 → 真实 Next.js + NestJS 仓库" 落地工作的**单一事实来源**。
> 任何开发窗口在动相关代码前先读本文件 + `docs/security-gate-policy.md`。
> 维护约定：每个阶段 / 工作流推进时，更新下面的「状态表」；阶段全文随实际改动同步校正。

---

## 状态表

| 编号 | 内容 | 状态 | 关联 PR / 备注 |
|---|---|---|---|
| 阶段 1 | 后端基础扩展（Prisma profile/Favorites/Schools/ViewEvents、OTP、推荐打分、seed） | ✅ 已完成（已 merge） | PR #48（`claude/check-design-access-JDMor`）+ `44bd4a9` / `cbcf537` / `254974c` |
| 阶段 2 | 前端入职流程 + 双标识登录（邮箱/手机 OTP）+ UserCtx → Zustand | ✅ 已完成（已 merge） | 开发分支 `claude/check-design-access-JDMor` |
| 阶段 3 | DirB shell + 5 页移植（破坏性覆盖 `/materials`，新增 `(app)` 路由组） | ✅ 已完成（已 merge） | PR #71（commit `3f0a129`） |
| 阶段 4 | HANDOFF P0：学校 autocomplete + ⌘K 命令面板 + 真实分页接入 | ✅ 已完成（已 merge，已验收） | PR #72（commit `db397cb`） |
| 阶段 5 | HANDOFF P1+P2：切页 loading/动效/年级升级/响应式 + 推荐算法升级 + 协同隐私 + 浏览埋点 | ✅ 已完成（已 merge，已验收） | PR #73（commit `5acda5b`）；后端推荐引擎（5.6/5.7 + P3 冷启动）随工作流 P 先期落地；余低级打磨项见 review（年级弹窗跨用户抑制、dwell 抽取等） |
| 阶段 6 | HANDOFF P3：正式退出登录 + 空状态插画 + 微信 OAuth + 组卷导出 PDF/Word | 🔄 进行中（6.1 退出登录 + 6.2 空状态已完成；6.3/6.4 未开始 ← **当前起点**） | 6.1+6.2 轻量包已 merge（PR #76，`claude/elegant-goldberg-8HP3z`）；剩 6.3 微信需 ICP 备案 + 安全门禁、6.4 组卷依赖 Redis/BullMQ（工作流 P2） |
| 工作流 S | 安全与稳定性加固（含生产部署前必修红线） | 🔄 进行中（S1/S3/S4/S5/S6/S7/S9/S10 已落地；S2a/S2b/S2c/S8b/S-data/CI-net 已修；剩 S11 = 工作流 P2 Redis） | round-2 已 merge（PR #78，`claude/workflow-s2-hardening`）：S2a TRUST_PROXY 安全解析、S2b 手机号归一化限流、S2c 登录锁加 IP 维度（取舍记入 `docs/rate-limit-rules.md`）、S8b file-scan 终态分类 + 重试、S-data `buildApprovedWhere` 加扫描状态过滤、CI-net `min-admin-review` 修复 + `set -o pipefail` 真门禁 + D5 health 启动修复；仅剩 S11 限流/OTP 迁 Redis（并入 P2） |
| 工作流 P | 性能与平台化（搜索 / 缓存 / Node 22 / 推荐冷启动 / 监控） | 🔄 进行中（P5 已完成：Pino + Sentry + /health；P3 推荐冷启动 phase-0~3 已落地；Redis/队列/metrics 后续） | 推荐响应已回传 `rankerId`、`?ranker=` 已接入；`ranker_v2` 目前为同算法占位（无独立打分），见 §P3 |

状态图例：⬜ 未开始 / 🔄 进行中 / ✅ 已完成。

---

## 与原计划不符、需按现状执行的校正

阶段 1 已落地，实际实现与最初草案有几处有意/必要偏差，后续阶段一律以**现状**为准：

1. **主键是 `@default(uuid()) @db.Uuid`，不是 `cuid()`**（见 `prisma/schema.prisma`）。新模型沿用 uuid。
2. **包管理是 npm，不是 pnpm**；命令用 `npm run prisma:migrate` / `npm run prisma:generate` / `npx prisma db seed`。
3. **`prisma/migrations` 是 git-ignored** —— 改 `schema.prisma` 后在本地生成迁移，不要把迁移文件提交进 git；在 PR 描述里说明"需要生成迁移"即可。
4. **当前没有 Redis**。OTP 用 `OtpAttempt` 表 + HMAC-SHA256(`OTP_SECRET`，回落 `JWT_SECRET`) + `timingSafeEqual`；OTP 校验次数桶 + 限流 + 登录失败锁都是**内存**实现（`RateLimitService`）。"OTP 存 Redis""BullMQ + Redis"是工作流 P 的待引入项，不是已有设施。
5. **短信服务商是阿里云 SMS**（`ALIYUN_SMS_*`，见 `.env.example`），不是腾讯云。Provider 选择策略：凭据齐全用 `AliyunSmsProvider` / `SmtpMailProvider`，否则回落 `ConsoleSmsProvider` / `ConsoleMailProvider`；"配了凭据但没装 SDK" 现在是 **fail-loud（throw）**，不是静默 no-op。`@alicloud/dysmsapi20170525` / `@alicloud/openapi-client` / `nodemailer` 是按需 `require` 的可选依赖，不在 `package.json`/lockfile —— 生产装它们需单独 audit + 锁版本。
6. **OTP 用途隔离**：`purpose: REGISTER | LOGIN | RESET`，验证码不可跨用途复用。
7. **阶段 1 已经实现并合并的接口/模块**（后续阶段不要重复造）：`/auth/otp/send`、`/auth/otp/verify`、`/auth/login`（邮箱+手机双标识）、`/auth/register`、`GET|PUT /users/me/profile`、`GET /schools`、`GET|POST|DELETE /favorites`、`GET /materials/recommend`、`POST /view-events`、`src/modules/materials/recommendations.service.ts`（含 `getColleagueSignals` K-匿名 `HAVING COUNT(DISTINCT) >= 3`）、`prisma/seed.ts`（学校 + 样本资料）。
8. 推荐算法的"内容匹配"打分（subject/grade/stage/city/kind）**已实现**，它本身就是冷启动的正确核心；后续是在它之上做行为信号 + 协同（见工作流 P §P3）。

---

## 用户已确认的决策（全局，勿擅改）

| 决策 | 选择 |
|---|---|
| 工作位置 | 真实仓库 `frontend/` + `src/` + `prisma/` |
| 范围 | HANDOFF P0 + P1 + P2 + P3 全做 |
| 登录方式 | 邮箱 + 手机号并存，**两者都做验证码**（手机短信 OTP / 邮箱邮件 OTP） |
| 侧栏与 `/materials` | DirB 完全覆盖原 `/materials` UI（沿用 URL，作为「全部资料」子页） |
| 协同推荐隐私 | 必须做：不暴露同事姓名，仅显示"同校老师常用"；K-匿名阈值 ≥3；可 opt-out |
| OTP 服务商 | 阿里云短信 + 邮箱 SMTP；dev 用 console provider，prod 用真实 provider（凭据后续提供） |
| 微信 OAuth | 阶段 6 实现前先出研究方案；备案/审核约 7–15 工作日，可先 mock |
| 学校数据 | 50 所热门 demo（北京/上海/广州/深圳/成都 各 10），其余靠"找不到我的学校"入口收集 |
| 交付节奏 | 每阶段一个可独立 merge 的 PR；前一阶段 merge 后再启动下一阶段 |
| 开发分支（功能） | `claude/check-design-access-JDMor` |

---

## 阶段 1：后端基础扩展 ✅ 已完成

> 已 merge，留档备查。当前 `prisma/schema.prisma` 即为准；下列为当初范围摘要。

- Prisma：`User` 加 `phone`（可空唯一）、`role`、`status`、`tokenVersion`、`avatarUrl`、入职字段（`profileRole`/`displayName`/`schoolId`/`schoolNameFreeText`/`city`/`stages`/`grades`/`subjects`/`viewedKinds`/`collaborativeOptIn`/`onboardedAt`/`gradesUpdatedAt`）；新增 `School` / `Favorite` / `ViewEvent` / `OtpAttempt`；`Material` 加 `kind`(EXERCISE/HANDOUT/EXAM/MOCK)、`fileSafetyStatus`；枚举 `ProfileRole` / `OtpChannel` / `OtpPurpose` / `MaterialKind`。
- NestJS：`auth/otp/`（send/verify、HMAC 入库、`timingSafeEqual`、5 分钟 TTL、5 次校验上限、`purpose` 隔离、Provider 自动降级 + fail-loud）；`users`（`/users/me/profile` GET/PUT）；`schools`（`/schools?city&q&limit`）；`favorites`（list/add/remove）；`view-events`（`POST /view-events`）；`materials/recommendations.service.ts`（内容匹配打分 + `getColleagueSignals` K-匿名 + opt-out）；`materials/recommend`。
- Seed：北京/上海/广州/深圳/成都 各 10 所学校（含拼音首字母）+ 样本资料（带 `kind`）。
- 安全 review pass：OTP 暴力破解桶、phone 登录锁修复（key 统一回 `login-email:`）、Provider fail-loud。

---

## 阶段 2：前端入职流程 + 双标识登录 ✅ 已完成

### 2.1 登录页改造 — `frontend/src/app/(auth)/login/page.tsx`
- 顶部 Tab「邮箱登录 / 手机号登录」决定提交字段名 `email` 或 `phone`。
- 次级切换「密码 / 验证码」：验证码模式右侧「发送验证码」按钮 60s 倒计时禁用，提交 `POST /auth/otp/verify`；密码模式 `POST /auth/login`。
- 新增 `frontend/src/components/auth/otp-input.tsx`（6 位 segmented input，Radix 风格）。
- 视觉沿用现有 shadcn 表单结构，**不照搬原型左黑右白布局**（原型 UI 留到阶段 3 局部应用）。

### 2.1.1 注册页同步 — `frontend/src/app/(auth)/register/page.tsx`
- 同上 Tab + OTP；注册先发 OTP，verify 成功后再提交 password + username 完成注册。

### 2.2 入职路由 — 新建 `frontend/src/app/onboarding/page.tsx`（受 auth-guard 保护）
- 复用原型 `Onboarding` 双步结构：第 1 步 role + displayName；第 2 步 school(autocomplete) + city + stages/grades + subjects。
- 提交 `PUT /users/me/profile`，成功后 `router.replace('/')`。
- 拆成可复用 `<OnboardingForm initialValue editing>`，阶段 5/6 的 `/profile` 编辑页复用。

### 2.3 Auth guard 改造 — `frontend/src/middleware.ts` + `frontend/src/lib/auth-guard.ts`
- 登录后从 `/auth/me` 读 `onboardedAt`，为 null 则强制重定向 `/onboarding`；`/onboarding` 本身受登录保护，未登录跳 `/login`。

### 2.4 UserCtx 等价物
- 不 port 原型 `UserCtx`；复用 `frontend/src/lib/auth-store.ts`（Zustand），给 `frontend/src/types/index.ts` 的 `User` 加 profile 字段（`profileRole`/`displayName`/`school`/`city`/`stages`/`grades`/`subjects`/`viewedKinds`/`onboardedAt`）。
- `frontend/src/hooks/use-auth.ts` 暴露 `useProfile()` hook 供 DirB 各页用（对应原型 `useContext(UserCtx)`）。

### 2.5 视觉令牌 — `frontend/tailwind.config.ts`
- 把原型 `common.jsx` 的 `T` 颜色 + `sans/mono/serif` 字体写进 theme（`colors.ink / colors.muted / fontFamily.serif` 等），阶段 3 直接用 Tailwind 类。

---

## 阶段 3：DirB shell + 5 页移植（破坏性） ✅ 已完成

### 3.1 路由覆盖
- 删除 `frontend/src/app/materials/page.tsx` 现有 grid，改为 DirB「全部资料」子页（保留 `/materials` URL）。
- 新建 `frontend/src/app/(app)/layout.tsx`：侧栏 + 顶栏，包裹 `/`(PageHome) / `/rank` / `/favorites` / `/subject/[name]` / `/grade/[stage]/[grade]` / `/materials`。
- 现有 `frontend/src/components/layout/navbar.tsx` 在 `(app)` 组里隐藏，由侧栏替代。
- 可选 feature flag `NEXT_PUBLIC_DIRB_ENABLED` 控制上线节奏。

### 3.1.1 `/materials` 覆盖影响清单（8 处硬编码 + 3 个测试）
| 文件 | 现状 | 改成 |
|---|---|---|
| `frontend/src/app/page.tsx:4` | `redirect('/materials')` | `redirect('/')`（渲染 DirB 首页） |
| `frontend/src/app/(auth)/login/page.tsx:36` | `redirect ?? '/materials'` | `redirect ?? '/'` |
| `frontend/src/app/(auth)/register/page.tsx:34,45` | `replace('/materials')` | `replace('/onboarding')` |
| `frontend/src/app/upload/page.tsx:72` | 成功 push `/materials` | 沿用（进「全部资料」子页能看到新上传项） |
| `frontend/src/lib/api/client.ts:98` | 403 跳 `/materials?forbidden=1` | 跳 `/?forbidden=1`，在 `(app)/layout.tsx` 读 query 弹 toast |
| `frontend/src/components/layout/navbar.tsx:20` | "资料库"→`/materials` | navbar 在 `(app)` 组隐藏 |
| `frontend/src/app/admin/page.tsx:176` | `<a href="/materials/[id]">` | 保留（详情路由不动） |
| `material-card.tsx` / `rating-*.tsx` | 链接到详情 | 保留 |

同步要改的测试：`api-client-403.test.ts`（403 落点 URL）、`materials-api-rating.test.ts`（DOM 选择器可能因 grid→row 变）、`admin-guard.test.ts`（admin 跳转）。
**不受影响**：`/materials/[id]` 详情、`/upload`、`/profile`、`/admin`（都在 `(app)` 组内复用新侧栏）、API 客户端 / 认证 / CSRF / Bearer / React Query cache、`RatingForm`/`RatingList`。
**风险**：外链指向 `/materials` 会落到「全部资料」子页（功能同、视觉变，可接受）；着陆页从 `/materials` 变 `/`，需更新 `metadata`/sitemap（如有）。

### 3.2 组件迁移映射
| 原型组件 | 真实仓库 |
|---|---|
| `SubjectIcon` / `G_*` glyphs | `frontend/src/components/study/subject-icon.tsx`（保留 SVG，包 Tailwind） |
| `FileRow` | `frontend/src/components/materials/material-row.tsx` |
| `TabBar` | Radix `Tabs` 重写：`frontend/src/components/ui/tab-bar.tsx` |
| `NavItem`/`SectionLabel`/`Caret` | `frontend/src/components/layout/sidebar.tsx` |
| `KindTag` | `frontend/src/components/materials/kind-tag.tsx` |
| `PageHome`/`PageRank`/`PageFav`/`PageSubject`/`PageGrade` | 对应 5 个 `app/(app)/*/page.tsx`，数据走 React Query |
| `recommend()` 客户端实现 | 删除，改调 `GET /materials/recommend` |
| `SAMPLE` | 删除，改调 `GET /materials` 各筛选参数 |

### 3.3 收藏交互
- `material-row.tsx` 加星标按钮，`POST/DELETE /favorites/:id`，mutate 后 invalidate `['favorites']` + `['materials']`。

### 3.4 顶栏按钮
- 「上传资料」→ `router.push('/upload')`（真实页已存在）；「新建组卷」先沿用原型 toast「演示模式下未实现」（阶段 6 实现）。

### 3.5 新增文件
- `frontend/src/app/(app)/layout.tsx`、`(app)/page.tsx`、`(app)/rank/page.tsx`、`(app)/favorites/page.tsx`、`(app)/subject/[name]/page.tsx`、`(app)/grade/[stage]/[grade]/page.tsx`
- `frontend/src/components/layout/sidebar.tsx`、`frontend/src/components/study/*`
- `frontend/src/lib/api/favorites.ts`、`recommendations.ts`、`schools.ts`

---

## 阶段 4：HANDOFF P0 ✅ 已完成

### 4.1 学校 autocomplete
- 后端 `GET /schools?city&q&limit` 已开；本阶段补：拼音首字母搜索（seed 时用 `pinyin` npm 包预计算，仅 seed 脚本用）、限频 + 分页、"找不到我的学校"兜底（前端跳自由输入，写 `schoolNameFreeText`，`schoolId` 留空，后台审核合并）。
- 前端 `frontend/src/components/study/school-combobox.tsx`（Radix Combobox 或 `cmdk`），挂在 `/onboarding` step 2 和 `/profile` 编辑页。

### 4.2 ⌘K 全局命令面板
- 库 `cmdk`；新建 `frontend/src/components/shared/command-palette.tsx`，挂在 `(app)/layout.tsx` 根部；`keydown` 监听 `(metaKey||ctrlKey)&&key==='k'`，Esc 关闭。
- 数据：资料 = debounce 200ms 调 `GET /materials?q=...&limit=8`；学科/年级 = 常量列表（命中跳 `/subject/[name]` / `/grade/[stage]/[grade]`）。
- 最近搜索 `localStorage` 存 5 条；侧栏"搜索资料…"输入框 click 也触发同一面板。

### 4.3 真实分页接入
- `/rank` → `GET /materials?sort=downloads|rating&page=...`；`/subject/[name]` → `?subject=...&kind=...&page=...`；`/grade/...` 同上。
- 用 `useInfiniteQuery` + 列表底部 IntersectionObserver 触发 `fetchNextPage`。

---

## 阶段 5：HANDOFF P1 + P2 ✅ 已完成

### 5.1 切页 loading + 动效一致
- Tailwind 加 `transitionTimingFunction['ease-rise'] = cubic-bezier(0.2,0.7,0.2,1)`；各 `page.tsx` 用 Suspense + 自定义 fallback（100ms 延迟显示 skeleton，切完淡入 200ms）；欢迎 toast 与 page transition 复用同一缓动。

### 5.2 年级升级机制
- 后端：`User.gradesUpdatedAt`（已在 schema）；工具函数 `shouldPromptGradeUpgrade(user, now)`：`now.month >= 8 && gradesUpdatedAt < new Date(now.year, 7, 1)` 为 true（不持久化）。
- 前端：`(app)/layout.tsx` mount 时调一次，true 则弹 Radix `Dialog`，CTA「整体升一档」调 `PUT /users/me/profile` 映射 grades（高一→高二，高三→保留并询问是否毕业归档）。

### 5.3 入职数据持久化（补完）
- 登录后从 `/auth/me` 拉写 Zustand；`/profile` 加「修改入职信息」入口，复用 `<OnboardingForm editing>`。

### 5.4 侧栏多 stage 展开
- `sidebar.tsx` 的 `openStage` 改 `Set<string>`，多个 stage 可同时展开；`user.stages.length > 1` 时默认全展开。

### 5.5 响应式
- 侧栏 `<lg` 改抽屉（Radix Dialog/Sheet）+ 顶栏汉堡按钮；`<sm` 主内容 `sm:grid-cols-1 lg:grid-cols-3`；`FileRow` 在 `<md` 折叠右侧元数据为单行小字。

### 5.6 推荐算法升级（P2）
| 信号 | 实现 |
|---|---|
| 浏览历史 CTR | `ViewEvent` 按 `kind` 聚合用户偏好，覆盖静态 `viewedKinds` |
| 协同（同校同事） | SQL 查同校 user 高分材料加权 `+1.5`（见 §5.7 隐私约束） |
| 学情驱动 | 本轮仅占位，错题本不做，留 hook |
| A/B 框架 | 响应加 `rankerId`；「换一批」调 `?ranker=ranker_v2` 对照 |
- 前端埋点：`material-row.tsx` IntersectionObserver 满 500ms 算一次 view，POST `/view-events`（节流 + 批量）；详情页 dwell 累计，离开时 `sendBeacon`。

### 5.7 协同过滤隐私（强制）
- 后端 SQL 返回**绝不**带同事 `userId/displayName/phone/email`，只返聚合后的 `materialId` + `schoolHitCount`；K-匿名阈值 `HAVING COUNT(DISTINCT u.id) >= 3`（已在 `recommendations.service.ts`）。
- 前端 `_reason` 文案固定 `"同校老师常用"`，不显示数字。
- opt-out：`/profile` 开关「参与同校推荐」，默认开；关闭后该用户既不进统计源也不接收协同信号（`colleagueScore = 0`）。`User.collaborativeOptIn`（已在 schema）。

---

## 阶段 6：HANDOFF P3 ← 当前起点

### 6.1 正式退出登录
- 删原型右下角"↻ 重新体验"；侧栏底部用户卡 `⋮` → Radix `DropdownMenu`：「个人中心」→ `/profile`，「修改入职信息」→ `/profile/onboarding`（复用 `<OnboardingForm editing>`），「退出登录」→ `POST /auth/logout`（已存在）+ `clearAuth()` + `router.replace('/login')`。

### 6.2 空状态插画 + CTA — 新建 `frontend/src/components/shared/empty-state.tsx`
| 场景 | 插画 | CTA |
|---|---|---|
| 搜索无结果 | 放大镜 | 「清除筛选」「上传一份」 |
| 新用户无收藏 | 空收藏盒 | 「去浏览资料」→ `/` |
| 年级页无资料 | 空书架 | 「上传第一份」→ `/upload` |
| 学科页无资料 | 同上 | 同上 |
| ⌘K 无结果 | 小放大镜 | 「直接上传同名资料」 |
- 纯内联 SVG（不引依赖），风格随原型黑灰线条。调用位点：`(app)/favorites`、`(app)/subject/[name]`、`(app)/grade/...`、`materials/page.tsx`、`command-palette.tsx`。

### 6.3 微信 OAuth（实现前先出研究方案）
- 后端新建 `src/modules/auth/wechat/`：`WechatStrategy` 调 `sns/oauth2/access_token` + `sns/userinfo` 拿 openid/unionid/nickname；用户匹配 unionid → openid → 首登流程。
- `User` 加 `wechatOpenId String? @unique` / `wechatUnionId String? @unique`。
- 接口：`GET /auth/wechat/authorize`（302 到授权 URL，带 state CSRF）、`GET /auth/wechat/callback?code&state`（验 state、换 token、查用户、签 JWT cookie、重定向 `/` 或 `/onboarding`）。
- 前端：登录页「微信登录」改 `window.location.href = '/auth/wechat/authorize'`；首登落 `/onboarding`，`displayName` 预填微信昵称。
- env：`WECHAT_APP_ID` / `WECHAT_APP_SECRET` / `WECHAT_REDIRECT_URI`（写进 `.env.example` + `docker-compose.yml`）。备案/审核约 7–15 工作日，可先 mock。

### 6.4 组卷 / 导出 PDF / Word
- 新模型：`PaperSet`（id/userId/title/stage/grade/subject/items/createdAt）、`PaperSetItem`（id/paperSetId/materialId/order）。
- UI：「新建组卷」→ `/papers/new` 全屏页（左资料抽屉 + drag，右预览，顶栏导出 PDF/Word/保存草稿）；`/papers/[id]`。
- 导出：PDF 用 `puppeteer` 渲 HTML 模板（`src/modules/papers/templates/paper.hbs`）→ MinIO → 临时 URL；Word 用 `docx` npm 包生成 `.docx` → MinIO → URL。
- 接口：`POST /papers`、`GET /papers/:id`、`POST /papers/:id/export?format=pdf|docx`（202 + jobId）、`GET /papers/:id/export/:jobId`（轮询状态 + URL）。后台 worker 用 BullMQ + Redis（与工作流 P §P2 的 Redis 引入合并）。
- 新增文件：`prisma/schema.prisma`（PaperSet/PaperSetItem/WeChat 字段）、`src/modules/auth/wechat/*`、`src/modules/papers/*`、`frontend/src/components/shared/empty-state.tsx`、`frontend/src/components/layout/sidebar.tsx`（加底部 dropdown）、`frontend/src/app/papers/new/page.tsx`、`frontend/src/app/papers/[id]/page.tsx`、`frontend/src/lib/api/papers.ts`。

---

## 工作流 S：安全与稳定性加固

> 来源：项目安全审计（102 commits 全量审 + `npm audit` + `.env.example` + CI）。
> 这些**不是**第 7 个 UI 阶段，而是贯穿性工作；每条改动仍须走 `docs/security-gate-policy.md` 的门禁（四项自查 + 429 证据链 + 不削弱现有检查）。优先级按严重度，红线建议尽早清。

| 编号 | 严重度 | 项 | 要点 |
|---|---|---|---|
| S1 | 🔴 | `JWT_SECRET` / `OTP_SECRET` 无强度校验 | bootstrap 断言 length ≥ 32 且 ≠ 占位符 `"replace-with-strong-secret"`，否则拒启。否则用占位符部署 = 任何人可伪造 ADMIN token = 完全认证绕过。 |
| S2 | 🔴 | `X-Forwarded-For` 被无条件信任 | `rate-limit.guard.ts` 直接取 `xff.split(',')[0]`，`main.ts` 从未 `app.set('trust proxy', ...)`。仅在配置可信代理(`TRUST_PROXY`)时才信任 XFF，否则用 `req.socket.remoteAddress`。否则可逐请求伪造 IP 绕过所有按 IP 限流 + 登录锁。 |
| S3 | 🔴 | 生产未强制安全 cookie / https CORS | bootstrap 断言：生产 `AUTH_COOKIE_SECURE === 'true'` 且 `CORS_ORIGIN` 全为 https，否则拒启。 |
| S4 | 🟠 | 密码哈希 `scryptSync` 同步阻塞 | 每次登录/注册/改密阻塞事件循环 ~50–100ms，是 DoS 放大器。改异步 `scrypt`（promisify）。 |
| S5 | 🟠 | 缺 `Strict-Transport-Security` | `main.ts` 加 `Strict-Transport-Security: max-age=63072000; includeSubDomains`（HTTPS 暴露时）。 |
| S6 | 🟠 | OTP 无"每标识日上限" | 现在仅 60s/次 + IP 1 分钟 5 次；缺按 identifier 的日上限 → 可对受害者手机持续轰炸（短信成本 + 骚扰）。加日上限。`AUTH_OTP_TEST_BYPASS=true` 时启动期打 loud warning。 |
| S7 | 🟠 | `logout` 仅在 access token 仍有效时才 bump `tokenVersion` | `auth.controller.ts` 先 `verifyAccessToken` 再 `rotateTokenVersion`；access 过期 + refresh 还在时登出形同虚设。改：登出也用 refresh-token 取 `sub` 并 bump version。 |
| S8 | 🟡 | 文件扫描在进程内 `setTimeout` + 持 50MB buffer | 重启→该 material 永久 `QUARANTINED`、无重试；高并发上传内存压力。改：先落 MinIO 再从存储扫；加重试/兜底（与阶段 6 的 BullMQ 合并）。 |
| S9 | 🟡 | 文件名 sanitize / 文本长度上限 | 上传文件名 sanitize 成 `[A-Za-z0-9._-]`；`title`/`description`/`displayName`/`schoolNameFreeText` 加最大长度 + 去控制字符。 |
| S10 | 🟡 | access token payload 瘦身 | 去 `email/phone/username` 快照（会过期、膨胀 token；`verifyAccessToken` 本就查库拿最新值），只留 `sub/role/ver`；加 `iat` + 小时钟偏移容忍。 |
| S11 | 🟡 | 限流 / OTP 计数迁 Redis | 见工作流 P §P2（多实例正确性 + 重启不丢）。 |

已确认**没问题**、不必动的（审计结论）：SQL 注入（全 Prisma；唯一 `$queryRaw` 用 `Prisma.sql` + `::uuid` 参数化）、批量赋值（全局 `whitelist`+`forbidNonWhitelisted` + 逐字段构造 `data`）、IDOR（按 `req.user.id` 收口）、会话固定（无状态 JWT）、信息泄露（生产隐藏 5xx 文案 + `disableErrorMessages` + Swagger 关 + 通用 "Invalid credentials"）、`alg` 混淆（恒用 HMAC-SHA256 重算比对，`alg:none` 无效）、`npm audit` 根工程 0 漏洞、Next 14.2.29 已过 CVE-2025-29927。低危取舍（不强制改）：用户枚举（register / otp/send 对不存在标识也响应）、CSRF token 未绑会话（双提交模式仍成立）、refresh token 不可单独吊销（只有全局 `tokenVersion`）。

### 全量代码审计结论（2026-05，4 域 Opus 扫描）

**已在代码落地的条目**（与上方 S1–S11 计划表对照）：
- **S1** ✅：`src/common/security/secret-strength.ts` + `main.ts` `assertSecretStrength`；长度 ≥32 + 非占位符双重断言，不达则拒启。
- **S3** ✅：`main.ts` `assertCorsConfigInProduction`；生产环境 `CORS_ORIGIN` 非空、全 https、cookie `secure` 不达则拒启。
- **S4** ✅：`auth.service.ts` `const scryptAsync = promisify(scrypt)`；登录/注册/改密全走异步哈希。
- **S5** ✅：`main.ts` `applySecurityHeaders` 中 `Strict-Transport-Security: max-age=63072000; includeSubDomains`。
- **S6** ✅：`otp.service.ts` 已有每标识日上限；`AUTH_OTP_TEST_BYPASS=true` 时打 loud warning。
- **S7** ✅：`auth.controller.ts` 已改用 refresh-token 取 `sub` + `rotateTokenVersion`；access token 过期后 logout 仍有效。
- **S9** ✅（部分）：`upload-security.util.ts` 文件名 sanitize；DTO 已有部分文本长度约束。
- **S10** ✅：access token payload 已只含 `sub/role/ver`，无 email/phone 快照。

**round-2 修复（已 merge，PR #78 `claude/workflow-s2-hardening`）**：

| 编号 | 严重度 | 原问题 | 修复 |
|---|---|---|---|
| S2a | 🔴 | TRUST_PROXY 门控反直觉：guard 用 `Boolean(app.get('trust proxy'))` → `Boolean("0")===true`，本想关闭信任的值反而启用 XFF 分支 | 新增 `src/common/security/trust-proxy.ts` `parseTrustProxy`：空/`0` 关闭、正整数设 hop 数、非法值拒启；guard 改用 `typeof setting === 'number' && setting > 0` 门控 |
| S2b | 🟠 | 手机号限流不归一化：`extractIdentifier` 只 `trim()`，与 `auth.service` 的 `normalizePhone()` 不一致，格式变体落不同限流桶 | `extractIdentifier` 复用同一 `normalizePhone` + 小写化，限流键与锁键两侧对齐 |
| S2c | 🟠 | 登录失败锁仅按标识、无 IP 维度 → 任意 IP 发 5 次错误凭据可循环锁受害者账号 | 锁键改 (标识, 客户端 IP)；取舍记入 `docs/rate-limit-rules.md` |
| S8b | 🟠 | file-scan 终态错标：catch 里无论真实原因一律 `TIMEOUT`；`FAILED` job 永不重试 → 资料永久 404 | 区分非法文件(FAILED)/超时(TIMEOUT)/MinIO 拉取失败；瞬时错误指数退避重试；`SCAN_TIMEOUT` 定时器及时 clear |
| S-data | 🟠 | `buildApprovedWhere` 缺 `fileSafetyStatus` 过滤：列表/RATING 排序展示 `QUARANTINED/SCANNING/FAILED` 资料，点进去/下载却 404 | `buildApprovedWhere` 加 `fileSafetyStatus ∈ {PASSED, null}`，四条读路径一致 |
| CI-net | 🔴 | `min-admin-review-check.ts` 漏 `AUTH_OTP_TEST_BYPASS` → 脚本失败；`security-gate.yml` 吞退出码 → CI 假绿；行 251 误判 401 | 脚本补 OTP bypass + CSRF；gate 加 `set -o pipefail` 跑 `min-all` 真门禁；USER→admin 改判 403 |
| D5 | 🔴 | health 模块缺 `TerminusModule`、indicator 未 `@Injectable` → AppModule 起不来、所有 min-* 启动期崩 | 抽出 `prisma.health.ts` 破环 + `@Injectable` + `HealthIndicatorService`；`HealthModule` 导入 `TerminusModule` |

> **剩余**：S11（限流 / OTP 计数迁 Redis）—— 并入工作流 P2（见下）。
>
> **基建尾巴（2026-06 发现）**：codex P5（Pino + Sentry，PR #68–70）往 `package.json` 加了 `nestjs-pino`/`pino-*`/`@sentry/node` 等依赖却没同步 `package-lock.json` → Security Gate 的 `npm ci` 自 05-16 起一直失败（早于 #78 把"假绿"修成真红，故 PR auto-merge 时未被拦）。已重生成锁文件 + 把 `package.json`/`package-lock.json` 纳入 gate 触发路径修复。

---

## 工作流 P：性能与平台化

> 来源：同一审计的"已知改进项评估"。多数与阶段 4–6 自然耦合，按下表挂载。

### P1 — 搜索：PostgreSQL FTS（不上 Elasticsearch）｜挂阶段 4（已完成）
现状：`search.module.ts` 空壳；`materials.searchApproved` 用 `name: { contains: q }`（`LIKE %q%`，全表扫、无相关性、无中文分词）。
路线（托管 PG 友好）：① migration 加 `CREATE EXTENSION pg_trgm` + `materials.title`/`materials.description` 的 GIN trgm 索引（或 `search_vector tsvector` 生成列 + GIN）。② `searchApproved` 改 `$queryRaw`：`WHERE title % :q OR description % :q ORDER BY similarity(title,:q) DESC`（tsvector 路线用 `ts_rank`），结构化 `where` 保留。③ `SearchModule` 落地（"猜你想搜"、最近搜索）。④ 补一个像 `scripts/min-material-search-check.ts` 的回归脚本。
迁 ES 触发条件（V1–V2 不可见）：跨实体搜索（materials+schools+users+paper-sets）+ 分面 + >10M 文档 + 高 QPS p99<50ms。自托管时可升级到 `zhparser` + `tsvector`。

### P2 — Redis 引入（缓存 + 限流/OTP store + 队列）｜挂阶段 5（队列部分到阶段 6）
- `docker-compose.yml` 加 `redis:7`（BullMQ 也要）。
- `@nestjs/cache-manager` + `cache-manager-redis-yet`（或自建 `RedisModule` 包 `ioredis`）：
  - 评分聚合 `material:{id}:rating-agg → {avg,count}` TTL 5–10min，**`upsertMaterialRating` 时删 key**（干掉到处重算的 `groupBy`，尤其 `GET /materials?sort=RATING` 现在每次加载所有匹配行 + groupBy）。
  - 资料详情 `material:{id}:detail` TTL 10min，审核状态变更时失效。
  - 列表/搜索：按 query DTO 的 hash 做 key，TTL 60–120s，不显式失效（新上传是 PENDING 不会立刻出现）；`q` 高基数时跳过缓存或用 LRU 限基数。
  - 推荐 `recommend:{userId}:{ranker}:{limit}` TTL 5–15min，失效用 per-user 版本号 `recommend:{userId}:ver`（profile 变更 `INCR`，嵌进 key）。
  - 学校 `schools:{city}:{q}:{limit}` TTL 1h（近乎静态）。
- 限流 + OTP 计数迁 Redis：抽 `RateLimitStore` 接口，`MemoryStore`/`RedisStore` 两实现，`REDIS_URL` 未设回落内存（dev/测试不用装 Redis）。`INCR`+`EXPIRE`（或 Lua 原子 check-and-consume）`rl:{rule}:{key}` TTL=window；登录锁 `SET lock:{key} 1 EX <s> NX`；OTP 校验 `INCR otp-verify:{key}`+`EXPIRE`。
- 注意：热 key 击穿用 lock key；用户态数据别放共享 key；失效在事务提交后执行。

### P3 — 推荐冷启动分层 fallback｜挂阶段 5（与 P2 推荐升级同处）
在 `RecommendationsService` 加 `pickStrategy(user, signals)` 返回权重，按以下分层：
- Phase 0（匿名/未 onboarded）：纯热度+质量+新鲜度（`log10(dl+1)*0.8 + (avg-4)*2 + freshness`），文案"热门资料"。
- Phase 1（已 onboarded，个人信号少）：**内容匹配（subject/grade/stage/city/kind）—— 已实现，就是冷启动核心**，文案沿用现有匹配理由。
- Phase 2（该用户 ≥ N=20 条 view events）：用 `ViewEvent` 聚合偏好（按 kind 的 CTR、近期 subject）替代静态 `viewedKinds`。对应阶段 5 P2。
- Phase 3（该校 ≥ K_dense=10 个 onboarded 用户 **且** 存在 ≥3 同事重叠）：才开 `collaborativeScore`（现在只要有 `schoolId`+opt-in 就一直算 `$queryRaw`，应按每校密度门控）。
- 切换指标：per-user `viewEventCount >= 20` → Phase 2；per-school onboarded 数 `>= 10` → Phase 3；全局看推荐 CTR（需给 `ViewEvent` 加 `source:'recommend'` 或单独表）——Phase≥2 CTR 不显著优于 Phase 1 则回退；覆盖度不足用热度补位（`.slice(0,limit)` 已隐式做到）。
- 实现：每校密度缓存成小计数器；开始记推荐曝光/点击让切换可度量；A/B 用已有 `rankerId` + `ranker_v2` 并行对照。

### P4 — Node 版本统一到 22 LTS｜可独立小 PR，随时做
现状：`Dockerfile` `node:22-bookworm`；两 workflow `node-version: 20`；docs "Node 20+"；无 `engines`。
步骤：① 根 + `frontend/package.json` 加 `"engines": { "node": ">=22 <23" }`（Next 14.2 支持 18.18+/20+/22）。② 两个 workflow → `node-version: 22`。③ 加 `.nvmrc` = `22`。④ `.devcontainer` 用 Docker 镜像无需改。⑤ 可选 Dockerfile pin digest。20→22 几乎无破坏（`fetch`/`File`/`Blob`、`crypto`/`Buffer`/`URL` 不变；Prisma 6 / NestJS 11 均支持 22；Docker 镜像里 `npm install` 已在 22 跑通）。

### P5 — 监控与日志：Pino + Sentry（暂不上 Prometheus/Grafana/OTel）｜Pino 早做，其余挂阶段 6 附近
现状：`@nestjs/common` Logger（console）+ 一些手写 JSON 日志（`rate_limit_blocked`/`rate_limit_metric`/`SECURITY_ALERT_FILE_SCAN_FAILED`/扫描审计）+ `HttpExceptionFilter` 记未捕获异常；无聚合/追踪/trace/metrics。
- Pino（先做，影响所有日志，上线前要有）：`nestjs-pino` + `pino-http` + `pino-pretty`；`LoggerModule.forRoot({ pinoHttp: { level, redact: ['req.headers.authorization','req.headers.cookie','*.password','*.passwordHash','*.codeHash'], autoLogging: true, genReqId } })`；现有手写 `logger.warn(JSON.stringify(...))` 迁成 `logger.warn({event:'rate_limit_blocked',...})`；dev 走 `pino-pretty`；stdout 交宿主。
- Sentry：`@sentry/node`，`main.ts` `bootstrap` 前 init；在 `HttpExceptionFilter.catch` 的 `if (!isHttpException)` 分支 `Sentry.captureException`；`tracesSampleRate` 0.05–0.1；`release` = git SHA，`environment` = `NODE_ENV`；`beforeSend` 脱敏 email/phone。
- 健康检查：`@nestjs/terminus` `GET /health`（DB + MinIO + 后续 Redis ping）。
- 廉价 metrics（按需）：`prom-client` + `GET /metrics`，暴露 `RateLimitService.metrics` 已有计数器 + 请求耗时直方图。
顺序：① Pino + 脱敏 → ② Sentry 进异常过滤器 → ③ `/health` → ④ request-id 注入安全日志 → ⑤ metrics endpoint（按需）。

---

## 验证方案（按阶段）

- **阶段 1**（已完成）：`npm run prisma:migrate` 成功；`npx prisma db seed` 学校 + 样本资料入库；phone 登录、`PUT /users/me/profile` 往返、`POST /favorites/:id` → `GET /favorites`、`GET /materials/recommend` 随 profile 变化；`recommendations` 打分 4 维度覆盖（可参照 `scripts/min-recommendations-check.ts`）。
- **阶段 2**：浏览器走 `/login`（手机号 tab）→ 强跳 `/onboarding` → 填完跳 `/`；二次登录不再跳 onboarding；Zustand 里看到 `user.stages` 等字段。
- **阶段 3**：五个页面都能渲染、数据从 API 拉（Network 验证）；收藏/取消后侧栏数字立即更新；"换一批"调 `/materials/recommend` reroll；改完的 3 个测试 + `frontend/` `npm run quality:gate` 通过。
- **阶段 4**：`/onboarding` 学校字段拼音搜 "shiyzx" 命中"实验中学"；任意页 ⌘K 输入"数学"看到资料/学科/年级三类；`/rank` 滚到底自动加载下一页。
- **阶段 5**：慢网（DevTools throttling）能看到 skeleton、快网不闪；系统时间调到 9 月 1 日重登弹年级升级 Dialog；375px 宽侧栏变抽屉、卡片单列；`ViewEvent` 表能看到埋点；3 个同校账号都收藏材料 X 后账号 D 推荐里 X 权重提升、只 1 个同校收藏时不触发（验 K=3）；关 `collaborativeOptIn` 后 `/materials/recommend` 不返回同校信号。
- **阶段 6**：侧栏底部 `⋮` 能正常退出登录；各空状态显示插画 + CTA 且跳对应路由；微信扫码走通完整 OAuth callback、首登跳 `/onboarding` 且昵称预填；`/papers/new` 拖资料组卷、导出 PDF/Word 能下载且内容正确（标题/题目顺序/学科年级头）；后台 worker 失败重试 ≤ 3 次、最终失败时前端轮询能看到 `failed`。
- **工作流 S**：每条改动跑 `npm run check:quality` + 相关 `npm run test:min-*`（尤其 `test:min-rate-limit` 的 429 证据链不能破）；红线项额外加启动断言的负路径测试（占位符 secret / 缺 https CORS / 生产非 secure cookie 时应拒启）。
- **工作流 P**：P1 补搜索回归脚本；P2 加 Redis 后 `RateLimitStore` 两实现都跑限流脚本，缓存项验"写后失效"；P4 升 22 后两个 workflow + 本地 `npm run check:quality` / `frontend npm run quality:gate` 全绿。

---

## 待办 / 待用户提供

- OTP 真实 provider 凭据（阿里云 SMS / SMTP）—— prod 用，dev 用 console。
- 微信开放平台 AppID/Secret + 已备案域名（阶段 6 正式上线前）。
- 短信预算确认（按量计费，月活上量后成本需复核）。
- 阶段 3 是否启用 `NEXT_PUBLIC_DIRB_ENABLED` feature flag 控制灰度。

---

## 风险与权衡（提醒）

1. **阶段 3 工作量最大且破坏性**：覆盖 `/materials` 时要保 `/upload`/`/admin`/`/profile` 仍可访问；建议先 feature flag 灰度。
2. **OTP 短信成本**：按量计费，dev 用 console 不烧钱；上量前与产品确认预算。
3. **学校 seed 规模**：全国中学约 3 万所，只 seed 热门城市 Top 50；其余靠"找不到我的学校"异步补全。
4. **微信 OAuth 备案**：需已备案 ICP + 开放平台审核（约 7–15 工作日）；代码可先做完用 mock。
5. **Puppeteer 体积**：镜像约 +300MB；可换 `playwright-core` + 共享 Chromium，或拆独立微服务。


## 本地数据库依赖（搜索）

- 需要 PostgreSQL 13+。
- 需要启用 `pg_trgm` 扩展以支持 `similarity(...)` 与 GIN trgm 索引。
