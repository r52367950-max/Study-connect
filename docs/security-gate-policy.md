# 安全修补与回滚门禁规范

## 适用范围
- 所有与安全相关的缺陷修补、策略调整、权限逻辑变更。
- 负责人：技术总执行（指定）+ 所有开发窗口负责人。

## 目标
- 修完即自证安全，不留尾巴。

## 验收门禁
以下门禁必须全部满足，任一失败视为不可合并：
1. PR 描述完整填写四项自查并提供证据。
2. 单点修复验证通过。
3. 组合攻击回归测试通过。
4. 无新增高危告警。
5. CORS 严格配置验证通过（生产环境必须配置 `CORS_ORIGIN`，且仅允许精确白名单 origin）。
6. 限流 429 证据链完整（登录、上传、admin 三条链路均需同时具备「响应断言 + 日志断言」）。

## 四项自查（PR 必填）
1. 是否解决原问题。
2. 是否引入新问题。
3. 是否与其他问题可组合利用。
4. 现实测试是否仍可被攻击。

> 缺失任一自查项或证据不足：不可合并，必须回滚。

## 回滚触发条件（自动执行）
任一条件触发后，立即回滚到最近稳定提交并记录：
- 单点修复验证失败。
- 组合攻击回归失败。
- 新增高危告警（SAST/DAST/依赖漏洞/运行时告警）。
- 验收门禁资料缺失或证据不足。
- 上线后安全监控命中异常阈值。

## 安全问题关闭标准
安全问题只有在以下条件同时满足时才允许关闭：
- 单点修复通过。
- 组合攻击回归通过。
- 无新增高危告警。

## 限流 429 证据链（登录 / 上传 / Admin）

### 脚本与断言要求
- 脚本：`npm run test:min-rate-limit`
- 必须同时满足：
  - HTTP 响应断言：三条链路均命中 `429`
  - 日志断言：必须出现 `"event":"rate_limit_blocked"` 且匹配对应路由/规则

### 三条链路对应证据
1. 登录链路（`POST /auth/login`）
   - 429 证据：`login 429 check passed: 429`
   - 日志证据：`rule=auth-login-ip-email`，`route=/auth/login`，`method=POST`
2. 上传链路（`POST /materials`）
   - 429 证据：`upload 429 check passed: 429`
   - 日志证据：`rule=materials-upload`，`route=/materials`，`method=POST`
3. Admin 链路（`GET /admin/materials/pending`）
   - 429 证据：`admin 429 check passed: 429`
   - 日志证据：`rule=admin-strict`，`route=/admin/materials/pending`，`method=GET`

### 证据采集命令（本地/CI）
```bash
npm run test:min-rate-limit | tee artifacts/rate-limit-429-evidence.log
```

日志中必须出现以下关键行（示例，JSON 证据格式）：
- `login 429 check passed: 429`
- `upload 429 check passed: 429`
- `admin 429 check passed: 429`
- `rate_limit_blocked log assertion passed: login/upload/admin`
- `evidence marker: {"event":"rate_limit_blocked"}`

> 任意一条缺失，视为证据链不完整，不可合并。

## CI 接入（强制门禁）
- workflow：`.github/workflows/security-gate.yml`
- 触发：涉及 `src/**`、`scripts/**`、`docs/security-gate-policy.md`、workflow 自身的 PR/push
- 核心步骤：
  1. 安装依赖：`npm ci`
  2. 执行限流证据脚本并落盘：`npm run test:min-rate-limit | tee artifacts/rate-limit-429-evidence.log`
  3. 使用 `grep` 对三条 429 证据 + 日志断言关键行做硬校验
  4. 上传 `artifacts/rate-limit-429-evidence.log` 作为审计附件

## Summary 固定输出要求
每次修补在 Summary 中固定输出以下四部分：
- 尝试过程。
- 失败尝试。
- 回滚记录。
- 最终证据。

## 周期性复盘机制
建议按周或按迭代执行复盘，至少输出：
- 漏检类型统计。
- 重复问题统计。
- 测试集更新清单。
- 下周期改进计划与责任人。
