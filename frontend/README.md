# StudyConnect Frontend

StudyConnect 学习资料共享平台前端，基于 Next.js 14 App Router 构建。

## 技术栈

| 技术 | 用途 |
|------|------|
| Next.js 14 (App Router) | 框架 |
| TypeScript | 类型安全 |
| Tailwind CSS + shadcn/ui | 样式与 UI 组件 |
| TanStack Query v5 | 请求缓存与状态管理 |
| Axios | HTTP 客户端 |
| React Hook Form + Zod | 表单验证 |
| Zustand | 认证状态持久化 |

## 快速启动

### 1. 确保后端已运行

```bash
# 在项目根目录（Study-connect/）
docker-compose up -d       # 启动 Postgres + MinIO
npm run start:dev          # 启动 NestJS API (localhost:3000)
```

### 2. 配置前端环境变量

```bash
cd frontend
cp .env.local.example .env.local
# 编辑 .env.local，确认 NEXT_PUBLIC_API_URL 指向正确的后端地址
```

### 3. 安装依赖并启动

```bash
npm install
npm run dev       # 访问 http://localhost:3001（或 3000，若后端占用）
```

> **注意**：Next.js 默认端口是 3000，若后端已占用 3000，前端会自动使用 3001。也可以指定端口：
> ```bash
> PORT=3001 npm run dev
> ```

## 环境变量说明

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | 后端 API 基础地址（无尾部斜杠） |
| `NEXT_PUBLIC_APP_NAME` | `StudyConnect` | 应用名称（可选） |

### 切换 API 地址

只需修改 `.env.local` 中的 `NEXT_PUBLIC_API_URL` 即可：

```env
# 本地开发
NEXT_PUBLIC_API_URL=http://localhost:3000

# 远程服务器
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

## 页面路由

| 路由 | 页面 | 访问权限 |
|------|------|----------|
| `/` | 重定向至 `/materials` | 公开 |
| `/materials` | 资料列表（搜索、筛选、分页） | 公开 |
| `/materials/:id` | 资料详情 + 评分 | 公开（下载/评分需登录） |
| `/login` | 登录 | 公开 |
| `/register` | 注册 | 公开 |
| `/upload` | 上传资料 | 需登录 |
| `/profile` | 个人中心 | 需登录 |
| `/admin` | 审核后台 | 需 ADMIN 角色 |

## 项目结构

```
src/
├── app/                  # Next.js App Router 页面
│   ├── (auth)/           # 登录/注册（Route Group）
│   ├── materials/        # 资料列表与详情
│   ├── upload/           # 上传页
│   ├── admin/            # 审核后台
│   └── profile/          # 个人中心
├── components/
│   ├── ui/               # shadcn/ui 基础组件
│   ├── layout/           # Navbar 等布局组件
│   ├── materials/        # 资料相关组件
│   └── shared/           # 通用组件（Loading/Empty/Error）
├── lib/
│   ├── api/              # Axios + API 函数封装
│   ├── auth-store.ts     # Zustand 认证状态
│   └── utils.ts          # 工具函数
├── hooks/                # 自定义 Hooks
├── middleware.ts          # 路由守卫
└── types/                # TypeScript 类型定义
```


## CI / 本地门禁命令

以下命令均可在 **无外网** 环境执行（已改为本地系统字体栈，ESLint 也无需交互初始化）：

```bash
cd frontend
npm run build
npm run lint
npm run test:frontend:min
```

推荐在提交前执行一遍本地最小门禁：

```bash
cd frontend && npm run lint && npm run build && npm run test:frontend:min
```

## 手工验证清单

### 游客流程
- [ ] 访问 `/materials` 能看到资料列表
- [ ] 关键词搜索后结果正确过滤
- [ ] 点击筛选器（学段/学科/排序）结果正确变化
- [ ] 点击资料卡片跳转详情页
- [ ] 详情页显示标题、统计（评分/下载数）、评价列表
- [ ] 点击"下载"弹出登录提示弹窗
- [ ] 点击"评分"区域弹出登录提示

### 认证流程
- [ ] 注册新账号成功，自动跳转资料库
- [ ] 用已注册邮箱登录成功
- [ ] 登录后刷新页面仍保持登录状态（localStorage 持久化）
- [ ] 点击退出登录后跳转登录页

### 登录用户流程
- [ ] 登录后访问详情页，下载按钮可正常触发
- [ ] 提交评分（1-5星 + 可选评论）成功后评价列表刷新
- [ ] 重复提交评分，数据被覆盖（upsert）
- [ ] 访问 `/upload`，填写表单并上传文件，提交成功

### 管理员流程
- [ ] 使用 ADMIN 账号登录后，Navbar 显示"审核后台"入口
- [ ] 访问 `/admin` 显示待审核列表
- [ ] 点击"通过"，资料状态变为 APPROVED，公开资料库可见
- [ ] 点击"驳回"，弹出原因输入框，确认后资料状态变为 REJECTED
- [ ] 点击"下线"，资料状态变为 OFFLINE

### 路由守卫
- [ ] 未登录直接访问 `/upload` 跳转至 `/login?redirect=/upload`
- [ ] 登录后 URL 中的 `redirect` 参数生效，跳回原页面
- [ ] 非 ADMIN 账号访问 `/admin` 被重定向

### 错误处理
- [ ] 后端不可用时，列表页显示错误状态 + 重试按钮
- [ ] 401 响应自动清除登录态并跳转登录页
- [ ] 表单提交时 422 错误显示可读提示文字
