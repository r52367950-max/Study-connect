# StudyConnect 后端开发指南（V1）+ Codex 任务派发清单

> 目标：在“前端由其他 AI 单独推进”的前提下，快速落地后端可运行版本，并可随时迭代。

---

## 1. 项目范围与原则

### 1.1 当前 V1 范围
- 用户注册/登录（JWT）
- 资料上传（文件 + 元数据）
- 管理员审核（通过/驳回）
- 搜索与筛选（关键词 + 结构化字段）
- 资料详情（含统计）
- 登录用户下载
- 豆瓣式评分/评论（1~5 分）

### 1.2 暂不实现
- AI 语义搜索
- 题目级 OCR 抽取
- 积分/付费系统
- App 端

### 1.3 开发原则（Vibe Coding 友好）
1. **每个任务必须可独立运行与验证**。
2. **先打通主流程，再做优化**。
3. **接口优先，前后端解耦**（前端晚到也不阻塞后端）。
4. **每次只让 Codex 做一个模块**，避免一次性生成过大代码。

---

## 2. 技术栈与项目结构

## 2.1 建议技术栈
- Runtime: Node.js 20+
- Framework: NestJS
- DB: PostgreSQL
- ORM: Prisma（或 TypeORM，二选一，本文默认 Prisma）
- Object Storage: MinIO（本地）/ OSS（线上）
- Auth: JWT
- Validation: class-validator
- API Doc: Swagger
- Test: Jest + Supertest

## 2.2 建议目录结构
```txt
src/
  modules/
    auth/
    users/
    materials/
    reviews/        # 评分评论
    downloads/
    admin/
    search/
  common/
    guards/
    interceptors/
    decorators/
    filters/
  infra/
    prisma/
    storage/
  main.ts
```

---

## 3. 环境变量规范

创建 `.env.example`：

```env
PORT=3000
NODE_ENV=development

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/studyconnect

JWT_SECRET=replace_this
JWT_EXPIRES_IN=7d

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=study-materials
MINIO_USE_SSL=false

MAX_UPLOAD_SIZE_MB=30
```

---

## 4. 数据库模型（V1）

## 4.1 核心实体
1. `users`
- id, email, password_hash, role, status, created_at, updated_at

2. `materials`
- id, title, description, stage, grade, subject, year, region, tags(json/text[])
- file_url, file_key, file_size, mime_type
- uploader_id
- status(`PENDING`,`APPROVED`,`REJECTED`,`OFFLINE`)
- review_comment
- created_at, updated_at

3. `ratings`
- id, user_id, material_id, score(1-5), content
- created_at, updated_at
- unique(user_id, material_id)

4. `downloads`
- id, user_id, material_id, created_at

5. `material_stats`（可选：也可用聚合查询代替）
- material_id, avg_score, rating_count, download_count, view_count

## 4.2 索引建议
- `materials(title)` + 全文索引
- `materials(stage, grade, subject, status)` 复合索引
- `ratings(material_id)`
- `downloads(material_id)`

---

## 5. API 设计（V1）

## 5.1 Auth
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

## 5.2 Materials
- `POST /materials` 上传资料（登录）
- `GET /materials` 公开检索列表（游客可访问，仅返回 APPROVED）
- `GET /materials/:id` 详情
- `GET /materials/:id/download` 下载（登录）

## 5.3 Ratings
- `POST /materials/:id/ratings` 新增或覆盖评分（登录）
- `GET /materials/:id/ratings` 获取评分列表

## 5.4 Admin
- `GET /admin/materials/pending`
- `POST /admin/materials/:id/approve`
- `POST /admin/materials/:id/reject`
- `POST /admin/materials/:id/offline`

---

## 6. 安全与规则

1. 上传前校验：扩展名、MIME、大小。
2. 下载鉴权：游客拒绝下载。
3. 管理员接口统一走 `RoleGuard(Admin)`。
4. 密码使用 `bcrypt` 哈希。
5. 所有写接口做 DTO 校验。
6. 关键审计日志：注册、登录、上传、审核、下载、评分。

---

## 7. 本地开发流程（建议）

1. 启动依赖（Postgres + MinIO）
2. 执行 Prisma migration
3. 启动 NestJS
4. 访问 Swagger 自测
5. 跑测试与 lint

---

## 8. Codex 任务派发总则

> 以下任务按顺序派发；每个任务都要求：
> - 只改动任务涉及文件
> - 提供运行命令
> - 提供测试结果
> - 提供回滚说明

---

## 9. 可直接复制的 Codex 任务单

## Task 1：项目脚手架与基础设施

**派发文本（可直接复制给 Codex）：**

```txt
你负责初始化 StudyConnect 后端（NestJS + Prisma + PostgreSQL）。
要求：
1) 创建基础目录结构（auth/users/materials/admin/reviews/downloads/search/common/infra）。
2) 接入 Prisma，配置 DATABASE_URL，提供初始 schema 占位模型。
3) 接入 Swagger，并在 main.ts 启用。
4) 提供 .env.example。
5) 提供启动命令与 README 小节。
验收标准：npm run start:dev 可启动，/api-docs 可访问。
```

## Task 2：认证与权限

```txt
你负责实现 Auth 模块：register/login/me。
要求：
1) 用户表字段：email/password_hash/role/status。
2) JWT 鉴权与 AuthGuard。
3) RoleGuard（至少支持 ADMIN/USER）。
4) DTO 校验（邮箱、密码长度）。
5) 提供 e2e 测试：注册、登录、me。
验收标准：未登录访问 /auth/me 返回 401；登录后返回用户信息。
```

## Task 3：资料上传与存储

```txt
你负责实现 Materials 上传能力（PENDING 状态）。
要求：
1) POST /materials 支持 multipart 上传文件 + 元数据。
2) 文件写入 MinIO（先封装 storage service）。
3) 落库 materials，状态默认 PENDING。
4) 校验文件类型/大小（参考环境变量 MAX_UPLOAD_SIZE_MB）。
5) 返回 material id 与状态。
验收标准：上传成功后数据库可见记录，状态为 PENDING。
```

## Task 4：审核后台

```txt
你负责实现 Admin 审核接口。
要求：
1) GET /admin/materials/pending 分页。
2) POST /admin/materials/:id/approve。
3) POST /admin/materials/:id/reject（含 reason）。
4) 仅 ADMIN 可访问。
5) 写入审核日志字段（review_comment/updated_at）。
验收标准：普通用户调用 admin 接口返回 403。
```

## Task 5：公开检索与详情

```txt
你负责实现公开检索与详情。
要求：
1) GET /materials 支持 q/stage/grade/subject/year/region/sort/page/pageSize。
2) 仅返回 APPROVED 资料。
3) GET /materials/:id 返回详情与基础统计（评分均值、下载次数）。
4) 查询性能优先：合理索引与分页。
验收标准：游客可访问列表与详情，能按学科和关键词过滤。
```

## Task 6：下载与记录

```txt
你负责实现下载接口。
要求：
1) GET /materials/:id/download 仅登录可访问。
2) 仅 APPROVED 资料可下载。
3) 记录 downloads（user_id, material_id）。
4) 返回可下载 URL 或流式下载。
验收标准：游客请求下载返回 401，登录后可下载且有记录。
```

## Task 7：评分评论

```txt
你负责实现评分评论模块。
要求：
1) POST /materials/:id/ratings 支持 1~5 分和评论。
2) 同一用户同一资料只保留一条（upsert）。
3) GET /materials/:id/ratings 分页返回。
4) 详情页统计包含 avg_score 与 rating_count。
验收标准：重复评分会覆盖旧值，平均分正确变化。
```

## Task 8：测试与质量门禁

```txt
你负责补齐测试与质量检查。
要求：
1) 为 Auth/Materials/Admin/Ratings 添加关键 e2e 测试。
2) 添加 lint + test 命令说明。
3) 增加错误码规范文档（401/403/404/422）。
验收标准：主要流程有自动化测试覆盖，可本地一键验证。
```

---

## 10. 协作机制（你 + 我 + 多个 Codex）

1. 你每次只派发一个 Task 给一个 Codex。
2. Codex 回来后，我负责做代码审查与改进建议。
3. 通过后再派下一个 Task。
4. 若某 Task 偏离目标，我会给你“修复补丁指令”。

---

## 11. 下一步执行建议

- 第一步先派发 **Task 1（脚手架）**。
- 你把 Codex 回传结果贴给我，我来帮你审查并生成下一轮精修指令。

