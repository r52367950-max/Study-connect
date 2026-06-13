# Study Connect 指标与告警运维手册

## 暴露方式

后端新增 `MetricsModule`，默认在应用同端口暴露 Prometheus 文本格式端点：

```bash
curl http://<api-host>:3000/metrics
```

如需接入 OpenTelemetry Collector，可使用 Collector 的 Prometheus receiver 抓取 `/metrics`，再转发到 Prometheus、Grafana Cloud 或其他后端。

## 核心指标

| 指标 | 类型 | 标签 | 含义 |
| --- | --- | --- | --- |
| `http_requests_total` | Counter | `method`,`route`,`status` | HTTP 请求量，可按状态码统计错误率。 |
| `http_request_duration_seconds` | Histogram | `method`,`route`,`status` | HTTP 延迟分布，用于 API p95/p99。 |
| `rate_limit_blocks_total` | Counter | `rule`,`route`,`method` | 被限流规则拦截的请求数。 |
| `login_failures_total` | Counter | - | 登录失败次数。 |
| `login_locks_total` | Counter | `scope` | 登录锁定次数，`identifier` 表示账号/IP 组合，`ip` 表示纯 IP 凭据填充防护。 |
| `otp_sent_total` | Counter | `channel`,`purpose` | OTP 成功发送次数。 |
| `otp_consumed_total` | Counter | `channel`,`purpose` | OTP 成功消费次数。 |
| `otp_failures_total` | Counter | `channel`,`purpose`,`reason` | OTP 发送、校验、频控等失败次数。 |
| `file_scan_enqueued_total` | Counter | - | 新增文件扫描任务数。 |
| `file_scan_queue_length` | Gauge | - | 当前待处理扫描队列长度。 |
| `file_scan_duration_seconds` | Histogram | `status` | 单个扫描任务耗时。 |
| `file_scan_completed_total` | Counter | `status` | 扫描完成、失败或重试次数。 |
| `materials_search_total` | Counter | `mode` | 资料搜索请求数，`keyword`/`rating`/`default` 区分路径。 |
| `materials_search_duration_seconds` | Histogram | `mode` | 资料搜索耗时。 |
| `materials_search_results` | Histogram | `mode` | 每次搜索返回结果数分布。 |
| `recommendations_total` | Counter | `phase`,`ranker` | 推荐请求量及 phase 分布。 |
| `recommendations_duration_seconds` | Histogram | `phase`,`ranker` | 推荐耗时。 |
| `material_review_processed_total` | Counter | `status` | 审核处理量，按目标状态统计。 |

## 建议告警规则

以下 PromQL 阈值可作为初始值，需按生产基线调优：

```yaml
groups:
  - name: study-connect-alerts
    rules:
      - alert: FileScanQueueBacklog
        expr: file_scan_queue_length > 100
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: 文件扫描队列积压
          description: file_scan_queue_length 连续 10 分钟超过 100。

      - alert: OtpFailureRateHigh
        expr: sum(rate(otp_failures_total[5m])) / clamp_min(sum(rate(otp_sent_total[5m])) + sum(rate(otp_failures_total[5m])), 1) > 0.2
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: OTP 失败率异常
          description: OTP 失败率连续 10 分钟超过 20%。

      - alert: LoginLocksSpike
        expr: sum(increase(login_locks_total[10m])) > 50
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: 登录锁定激增
          description: 10 分钟内登录锁定超过 50 次，可能存在撞库或误杀。

      - alert: MaterialDownloads5xx
        expr: sum(rate(http_requests_total{route=~".*/materials.*/download.*|.*/downloads.*",status=~"5.."}[5m])) > 0.05
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: 资料下载 5xx 增加
          description: 下载相关接口 5xx 速率超过 0.05 req/s。

      - alert: MaterialSearchP95High
        expr: histogram_quantile(0.95, sum by (le) (rate(materials_search_duration_seconds_bucket[5m]))) > 1.5
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: 搜索 p95 超阈值
          description: 资料搜索 p95 延迟连续 10 分钟超过 1.5 秒。
```

## 告警处理流程

1. **确认影响面**：查看 `http_requests_total{status=~"5.."}`、业务 Counter 的增长速度，以及最近发布/配置变更。
2. **定位关联指标**：将告警指标与 HTTP 延迟、数据库慢查询、对象存储错误、日志事件进行同时间窗口比对。
3. **止血优先**：必要时回滚最近版本、临时扩容 worker/API 实例、降低入口流量或放宽非安全类阈值。
4. **修复与复盘**：记录根因、影响范围、处置时间线，并把阈值或仪表盘补齐。

## 常见故障定位

### 扫描队列积压

- 查看 `file_scan_queue_length`、`file_scan_duration_seconds`、`file_scan_completed_total{status="retry"|"failed"}`。
- 检查对象存储连通性和 `MINIO_FETCH_FAILED`、`SCAN_TIMEOUT`、`FILE_TOO_LARGE` 日志。
- 若队列持续增加，可临时缩短扫描间隔、扩容后端实例或排查慢文件类型。

### OTP 失败率异常

- 按 `reason` 拆分 `otp_failures_total`，区分短信/邮件供应商故障、验证码错误、IP 限流和每日上限。
- 若 `reason="dispatch"` 升高，优先检查短信/邮件供应商状态和凭据。
- 若 `invalid_or_expired` 升高，检查客户端时钟、验证码有效期提示、是否存在撞库尝试。

### 登录锁激增

- 查看 `login_locks_total{scope="ip"}` 与 `scope="identifier"` 比例。
- 结合安全日志和 WAF/CDN IP 分布判断是否为撞库；必要时启用上游封禁或验证码。
- 若集中在企业/学校出口 IP，评估是否需要临时调整 IP-only 阈值。

### 资料下载 5xx

- 用 `http_requests_total` 定位具体下载路由和状态码。
- 检查对象存储签名 URL、桶权限、网络连通性和应用错误日志。
- 同时关注 `fileSafetyStatus`，确认是否有未通过扫描的资料被错误暴露。

### 搜索 p95 超阈值

- 按 `materials_search_duration_seconds{mode=...}` 区分关键词、评分排序和默认列表。
- 检查数据库 CPU、连接池、慢查询日志，以及 pg_trgm 索引是否存在并被使用。
- 若只在 `mode="keyword"` 升高，优先检查查询词长度、结果数、索引膨胀和 VACUUM/ANALYZE 状态。
