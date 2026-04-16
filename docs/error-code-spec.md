# API Error Code Spec (Task8)

本文档约定项目常用错误码语义，覆盖 Auth / Materials / Admin / Ratings 关键流程。

## 状态码语义

| 状态码 | 语义 | 典型触发条件 |
| --- | --- | --- |
| `401 Unauthorized` | 未认证 | 缺失 Bearer Token、Token 非法或过期 |
| `403 Forbidden` | 已认证但无权限 | 角色不满足（如 USER 访问 ADMIN 接口） |
| `404 Not Found` | 资源不可见或不存在 | 资料不存在，或资料不满足公开语义（`status=APPROVED` 且 `visibility=PUBLIC`） |
| `422 Unprocessable Entity` | 参数/文件校验失败 | DTO 参数不合法、上传文件类型/大小不合法 |

## 接口场景映射

### Auth
- `POST /auth/register`
  - `422`: DTO 校验失败（如邮箱格式、密码长度不满足）。
- `POST /auth/login`
  - `401`: 凭据错误。
- `GET /auth/me`
  - `401`: 未登录或 Token 不合法。

### Materials Upload / Download
- `POST /materials`
  - `401`: 未登录上传。
  - `422`: 文件类型不支持、文件超过 `MAX_UPLOAD_SIZE_MB`、DTO 参数不合法。
- `GET /materials/:id/download`
  - `401`: 未登录下载。
  - `404`: 资料不存在，或不是 `APPROVED + PUBLIC`（含 `PRIVATE + APPROVED`）。

### Admin Review
- `GET /admin/materials/pending`
- `POST /admin/materials/:id/approve`
- `POST /admin/materials/:id/reject`
- `POST /admin/materials/:id/offline`
  - `401`: 未登录。
  - `403`: 非 ADMIN 角色访问。
  - `404`: 管理操作目标资料不存在。
  - `422`: reject/offline body 不合法（如 reason 缺失或字段越界）。

### Ratings
- `POST /materials/:id/ratings`
  - `401`: 未登录评分。
  - `404`: 资料不存在、未 `APPROVED` 或已 `OFFLINE`（不可评分）。
  - `422`: `score` 超范围、`content` 长度越界。
- `GET /materials/:id/ratings`
  - `404`: 资料不存在、未 `APPROVED` 或已 `OFFLINE`（公开列表不可见）。
  - `422`: 分页参数非法（`page` / `pageSize`）。

## 一致性说明
- 所有鉴权失败优先返回 `401`。
- 所有角色权限失败返回 `403`。
- 对未通过审核资料的访问信息统一弱化为 `404`，避免暴露内部审核状态。
- 所有参数与文件校验失败统一返回 `422`。
