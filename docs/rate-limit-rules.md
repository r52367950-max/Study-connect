# 关键路由限流规则（实际生效）

> 更新时间：2026-04-18

## 全局规则（RateLimitGuard）

- 规则名：`global-basic`
- 作用范围：所有 HTTP 路由（包含 public 与鉴权路由）
- 限流键：`ip:<client-ip>`
- 默认阈值：`120 req / 60s`
- 环境变量：
  - `RATE_LIMIT_GLOBAL_LIMIT`
  - `RATE_LIMIT_GLOBAL_WINDOW_MS`

## 局部规则（按路由/模块叠加）

> 局部规则与全局规则是**叠加生效**，任一命中都会返回 `429`。

| 路由 | 规则名 | 阈值 | 说明 |
|---|---|---:|---|
| `GET /auth/csrf` | `auth-csrf` | 90 / 60s | 限制频繁刷 token |
| `POST /auth/register` | `auth-register` | 12 / 60s | 限制注册刷接口 |
| `POST /auth/login` | `auth-login-ip` | 25 / 60s | 登录 IP 速率上限 |
| `POST /auth/login` | `auth-login-ip-email` | 20 / 60s（默认） | 登录 IP+邮箱组合限流（可 env 覆盖） |
| `POST /auth/login` | `auth-login-lock` | 5 次失败后锁定 5 分钟（默认） | 登录失败熔断锁 |
| `POST /auth/logout` | `auth-logout` | 40 / 60s | 限制登出洪泛 |
| `POST /materials` | `materials-upload` | 10 / 60s | 上传接口保护 |
| `POST /materials/:id/ratings` | `materials-rating-write` | 20 / 60s | 评分写入接口 |
| `GET /materials/:id/download` | `materials-download` | 90 / 60s | 下载接口保护 |
| `GET/POST /admin/*` | `admin-strict` | 30 / 60s | 管理后台统一更严格限流 |

## 登录相关可配置参数

- `RATE_LIMIT_LOGIN_LIMIT`（默认 20）
- `RATE_LIMIT_LOGIN_WINDOW_MS`（默认 60_000）
- `RATE_LIMIT_LOGIN_MAX_FAILURES`（默认 5）
- `RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS`（默认 60_000）
- `RATE_LIMIT_LOGIN_LOCK_MS`（默认 300_000）

## 429 命中验证（脚本）

- 覆盖场景：`login`、`upload`、`admin`
- 脚本：`npm run test:min-rate-limit`
- CI 门禁：`npm run test:min-all` 已纳入 `test:min-rate-limit`
