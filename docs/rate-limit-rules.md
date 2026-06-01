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
| `POST /auth/login` | `auth-login-lock` | 5 次失败后锁定 5 分钟（默认） | 登录失败熔断锁，按 **标识 + 客户端 IP** 维度（见下方说明） |
| `POST /auth/logout` | `auth-logout` | 40 / 60s | 限制登出洪泛 |
| `POST /auth/change-password` | `auth-change-password` | 5 / 60s | 限制高成本密码校验被持续打满 |
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

### 登录失败锁的键维度（安全设计取舍）

失败熔断锁（`auth-login-lock`）的键为 **`login-id:<标识>:<客户端 IP>`**（标识 = 归一化后的邮箱/手机号）。

- **动机**：早期实现只按标识（`login-id:<标识>`）锁定，任意 IP 连续 5 次错误凭据即可把某个**已知账号**锁死 5 分钟，可被循环利用做远程拒绝服务（锁死任意账号）。
- **现状**：锁改为「标识 + IP」联合维度后：
  - 单一攻击 IP 针对某账号连续失败仍会在 5 次后被锁（按 IP 维度保留暴力破解保护，强度不变）；
  - 受害者从自己的 IP 登录不再被第三方 IP 的失败连累（消除远程锁死 DoS）。
- **取舍**：不再存在「跨 IP 的全账号锁」。分布式撞库改由按 IP 的计数规则（`auth-login-ip` 25/60s、`auth-login-ip-email` 20/60s）与全局限流共同约束——这与 OWASP「优先账号+IP 锁、避免纯账号锁」的建议一致。
- **键对齐**：`RateLimitGuard` 的前置检查与 `AuthService.login` 均通过 `RateLimitService.buildLoginLockKey(identifier, ip)` 生成同一把键；手机号在两侧都先经 `normalizePhone` 归一化，避免格式变体绕过。

## 429 命中验证（脚本）

- 覆盖场景：`login`、`upload`、`admin`
- 脚本：`npm run test:min-rate-limit`
- CI 门禁：`npm run test:min-all` 已纳入 `test:min-rate-limit`


## OtpAttempt 后台清理建议

为避免 `OtpAttempt` 表中的历史记录无限增长，建议每天通过 cron 执行一次：

```bash
npm run cleanup:otp
```

该脚本会删除 7 天前的 `OtpAttempt` 记录（成功与失败都会清理）。后续如果接入 BullMQ，可改为 repeatable job 统一调度。
