# 家长作业打卡模块 — 详细设计文档（v4）

> 家庭任务闭环 + 错题本共管 + 成就激励
> 文档：`docs/parent-tasks/design.md`　|　实现计划：`docs/parent-tasks/plan.md`

---

## 0. 需求澄清结论（已确认）

1. 现有账号 = **学生**；家长**单独注册**，与孩子**两步绑定**（发起→确认）。
2. **多位家长 ↔ 同一学生**：同一学生的任务在所有已关联家长间**数据共享**，都能查看、编辑、批改；需**控制同时编辑冲突**（乐观锁）。
3. 家长通常**当天定制明天任务**，也可**当天调整进行中任务**。
4. 任务支持**图片**（任务插图/完成证据/纠错批注），图片大小处理**复用错题本方案**。
5. 孩子完成→**上传证据图**→家长远程**检查**（评语 + 星级1~5）；有错则**驳回+纠错图**→孩子**重新完成再提交**。
6. 孩子**仅任务当天可提交**；未来任务可见但锁卡。
7. **学生可自主添加附加任务**（鼓励自驱力），与家长任务走同一状态机，带「自主」标识。
8. **家长可查看**孩子的**错题本**（只读：错题列表 + 统计/掌握度）。
9. 新增**成就模块**（学生/家长两套），鼓励坚持维护错题本与完成每日任务。
10. 周期任务创建时定义，**对每个绑定孩子分别生成**；「复制昨日」合并去重。
11. **家长可查看孩子错题本的复习情况**；**「错题复习」按记忆曲线（SM-2 `next_review_date`）自动生成任务**，孩子复习后提交，家长可批改。

---

## 1. 角色、绑定与权限模型

### 1.1 角色
`student`（默认）／ `parent`。注册页选择。

### 1.2 绑定（多对多，两步确认）
`family_bindings`：`parent_id ↔ student_id`，`status=pending|active`。一个学生可绑定多位家长；一位家长可绑定多个孩子。仅 `active` 生效。

### 1.3 权限模型（任务归属于学生，家长共享）
- **任务归属主体 = 学生**（`student_id`），不再单属某位家长。
- `created_by_id` 仅作**创建人审计**（可能是某位家长，或学生本人=自主任务）。
- 任一 `active` 绑定的家长：可查看/编辑/批改该学生的**全部**任务与模板（含他人/孩子创建的）。
- 学生：可查看自己的全部任务；可编辑/删除**自己创建**的任务；提交/撤回自己的任务。
- **并发控制**：实例与模板带 `version`，编辑/批改用**乐观锁**（版本不符→`409`，前端提示刷新）。

### 1.4 家长查看错题本（只读）
现有 questions / statistics 接口增加可选 `student_id`：`parent` 角色时，仅能传入**已 active 绑定**的学生；`student` 角色沿用本人（禁止传他人）。

---

## 2. 数据模型（新增）

### 2.1 users 增列
```
role  VARCHAR(20) NOT NULL DEFAULT 'student'
```
幂等迁移：`PRAGMA` 检查缺列则 `ALTER TABLE`。

### 2.2 family_bindings
`id` / `parent_id` / `student_id` / `status(pending|active)` / `created_at`；唯一 `(parent_id, student_id)`。

### 2.3 task_templates（模板 · 内容基准 + 周期）
| 字段 | 说明 |
|---|---|
| id | PK |
| created_by_id | FK users（创建家长） |
| student_id | FK users（面向孩子） |
| category | `learning`/`sports`/`chores` |
| subject | 学习类：语文/数学/英语 |
| name（必填≤100）/ description | 名称 / 要求 |
| require_evidence | Boolean（默认 true） |
| repeat_type | `none`/`daily`/`weekly` |
| repeat_weekdays | JSON `[0..6]`（0=周一…6=周日） |
| start_date / end_date | 生效起止 |
| status | `active`/`paused`/`archived` |
| **version** | Integer（乐观锁） |
| created_at / updated_at | |

### 2.4 task_instances（某天任务 · 状态机载体 · 快照）
| 字段 | 说明 |
|---|---|
| id | PK |
| template_id | FK 可空（复制/一次性为 NULL） |
| **created_by_id** | FK users（家长布置 / **学生自主**） |
| student_id | FK users |
| task_date | Date（索引） |
| category / subject / name / description / require_evidence | 内容快照 |
| **status** | `pending`/`submitted`/`rejected`/`approved` |
| **source** | `manual`（家长布置/学生自主，默认）/ `auto_review`（记忆曲线自动生成） |
| checkin_note | 孩子提交备注 |
| submitted_at | 最近提交时间 |
| **reviewed_by_id** | FK users 可空（哪位家长批改，供成就统计） |
| rating | Integer 1~5 |
| review_comment | Text |
| reviewed_at | DateTime |
| **version** | Integer（乐观锁） |
| created_at / updated_at | |

唯一 `(template_id, task_date)`；索引 `(student_id, task_date)`、`(status, student_id)`；部分唯一索引 `(student_id, task_date, source) WHERE source='auto_review'`（每天仅一条自动复习任务）。

### 2.5 task_images
| 字段 | 说明 |
|---|---|
| id | PK |
| target_type | `template`/`instance` |
| target_id | 所属 |
| kind | `illustration`（任务插图）/`evidence`（完成证据）/`correction`（纠错批注） |
| file_path / original_name / file_size / mime_type | |
| uploaded_by_user_id | 上传人（权限校验） |
| sort_order / created_at | |

索引 `(target_type, target_id)`。

> 插图挂在模板并**复制到实例**；证据/纠错只挂实例。

---

## 3. 任务状态机（核心）

```
                T1 孩子提交(证据图+备注)        T2 家长检查通过(评语+星级)
 ┌────────┐   ────────────────────▶  ┌──────────┐  ─────────────────▶  ┌────────────┐
 │ pending │                          │ submitted │                     │ approved(终态) │
 │ 待完成   │                          │  待检查    │                     └────────────┘
 └────┬───┘                          └────┬─────┘
      │  T5 孩子撤回(可选)                  │ T3 家长需修改(评语+纠错图)
      └──────────────────        ┌───────▼─────┐
                          ┌──────│   rejected   │ ── T4 孩子重新完成并提交 ──▶ submitted
                          │      │    需修改     │
                          │      └─────────────┘
```
| # | 迁移 | 触发者 | 条件 | 动作 |
|---|------|--------|------|------|
| T1 | `pending → submitted` | 孩子 | 本人；**当天** | 备注 + 证据图（require_evidence 必传≥1）；写 `submitted_at` |
| T2 | `submitted → approved` | 任一绑定家长 | `status==submitted`；乐观锁 | 评语 + 星级；写 `reviewed_by_id`/`rating`/`reviewed_at` |
| T3 | `submitted → rejected` | 任一绑定家长 | 同上 | 评语 + 纠错图（可选） |
| T4 | `rejected → submitted` | 孩子 | 本人；**当天** | 重做，替换证据图，再提交 |
| T5 | `submitted → pending` | 孩子 | 本人（检查前） | 撤回 |

约束：提交/撤回仅限当天；检查不限日期；`approved` 终态；重复提交替换证据图时删除旧图。

---

## 4. 并发冲突控制（乐观锁）

- `version` 字段：实例与模板各一个，初始 0，每次成功修改 +1。
- 带版本号的变更接口：`PUT /tasks/{id}`、`POST /tasks/{id}/review`、`PUT /tasks/templates/{id}`。
- 请求携带 `version`；与库中不一致 → `409 VERSION_CONFLICT`「任务已被他人修改，请刷新后重试」；一致则执行并 +1。
- 前端：加载数据带 `version`；变更后遇 409 → toast 提示 + 重新拉取。
- 提交/撤回用状态机本身防冲突（非目标状态 → `400 INVALID_STATE`）。

---

## 5. 图片大小处理（复用错题本方案）

- **前端**：复用 `compressImage()`（最长边 1920、JPEG 0.8、<512KB 小图跳过）。
- **后端**：`POST /tasks/images/upload` —— mime 白名单 `jpeg/png/webp`、≤10MB（超限 `413`）、存 `uploads/tasks/`、返回未挂载图。
- **清理**：删任务/图时删磁盘文件；替换证据图时删旧图。
- 展示复用 `ImageViewer`。

---

## 6. 周期生成与「错题复习」自动任务（惰性，无定时任务）

### 6.1 模板周期生成
任何查询某学生某日任务时，对 `active` 模板补齐 `[start_date, max(请求日,今天)]` 内的实例（daily 每天；weekly 按星期）；`(template_id, task_date)` 唯一保证幂等；生成时复制插图到实例；停用不再生成。

### 6.2 「错题复习」自动任务（结合 SM-2 记忆曲线）
利用现有错题本系统的 `questions.next_review_date`（SM-2 记忆曲线计算的下次复习日期）：

- **触发**：生成学生**今日**任务时（仅今天，不回溯历史日期）。
- **有到期错题**（`status='active' AND next_review_date <= 今天` 计数 > 0）：
  - 确保今日存在一条 `source='auto_review'` 实例：`category=learning`、`name=错题复习`、`description=今日待复习 N 道（分科：语文x/数学x…，按记忆曲线安排）`、`require_evidence=false`、`created_by_id=NULL`、`template_id=NULL`、`status=pending`。
  - 已存在则刷新 description 里的待复习数（每天一条，部分唯一索引保证）。
- **无到期错题**：若今日存在 `pending` 的 `auto_review` 实例 → **自动置 `approved`**（孩子已在错题本完成复习，无评分/评语）。
- 孩子复习后可在任务上**提交**（无需证据图），家长可在检查台**批改**。
- 自动复习任务的完成计入学生成就（完成任务数 / 连续天数）。
- 家长删除自动复习任务不生效（系统任务，仅可编辑名称/要求）。

---

## 7. 学生自主附加任务

- 学生可为**自己**创建一次性附加任务（`created_by_id=自己`，`template_id=NULL`），支持选择日期（默认今天）、分类/学科/名称/要求、插图、`require_evidence` 开关。
- 学生**不创建模板**。
- 自主任务与家长任务**同一状态机**（完成→提交→家长可批改），前端以「⭐ 自主」徽标区分。
- 学生可编辑/删除**自己创建**的任务；家长可查看/批改/删除学生的全部任务。

---

## 8. 家长查看孩子错题本（只读）

### 8.1 后端
- `questions.py`：`list_questions`、`get_question` 增加可选 `student_id`；`list_questions` 增加 `due=1` 过滤（`status='active' AND next_review_date <= 今天`），返回今日待复习清单（家长/学生皆可用）。
- `statistics.py`：`overview`/`trends`/`report`/`knowledge/mastery`/`knowledge/heatmap` 增加可选 `student_id`。
- 解析：`parent` → 校验 `student_id` 为已 active 绑定学生，用该学生 id 过滤；`student` → 忽略/禁止 `student_id`。
- 家长视图**只读**：不开放增删改错题、不开放复习提交。

### 8.2 前端
- 家长新增「错题本」只读页 `/parent/notebook`：孩子切换 + Tab（**统计 / 复习情况 / 错题列表**）。
- **统计**：复用 StatisticsPage 图表，带 `student_id` 拉取。
- **复习情况**：今日待复习数（`overview.today_review_count`）、已逾期数（`overview.overdue_review_count`）、本周/月度复习完成率（`report.review_completion_rate`）、近 30 天复习趋势（`trends`）、**今日自动复习任务状态**（是否已提交/通过，来自 `/tasks/daily`），以及**今日待复习错题清单**（`questions?due=1&student_id=`）。
- **错题列表**：只读紧凑列表（学科/标签/内容/掌握度），无编辑删除操作。

---

## 9. 成就模块

### 9.1 机制
- 无状态规则引擎：`GET /achievements` 按当前用户角色**实时计算**指标并评估规则，返回每项 `{code,title,desc,emoji,unlocked,progress,target}`，前端展示徽章墙（解锁彩色/未解锁灰显+进度）。
- 指标从 DB 实时聚合（任务实例、家长、绑定、错题、复习），无需额外计数字段。

### 9.2 学生成就
| code | 规则 | 目标 |
|------|------|------|
| first_task | 完成第 1 个任务 | 累计完成 ≥1 |
| task_10 / task_50 / task_100 | 累计完成任务 | ≥10 / ≥50 / ≥100 |
| streak_3 / streak_7 / streak_30 | 最长连续完成任务天数 | ≥3 / ≥7 / ≥30 |
| stars_10 / stars_50 | 累计获得星级 | ≥10 / ≥50 |
| self_task_5 | 自主添加并完成 | ≥5 |
| mistake_10 / mistake_50 | 收录错题数 | ≥10 / ≥50 |
| review_7 / review_30 | 最长连续复习天数 | ≥7 / ≥30 |

### 9.3 家长成就
| code | 规则 | 目标 |
|------|------|------|
| assign_first / assign_7 / assign_30 | 布置任务天数 | ≥1 / ≥7 / ≥30 |
| review_first / review_10 / review_50 | 累计批改次数 | ≥1 / ≥10 / ≥50 |
| timely_3 / timely_7 | 连续当日批改天数 | ≥3 / ≥7 |
| stars_give_20 | 送出星级总和 | ≥20 |

### 9.4 前端
- 学生：任务页第三 Tab「成就」。
- 家长：设置/首页入口 `成就` 页（同一组件按角色取规则）。

---

## 10. 界面设计

### 10.1 学生端
- 注册页角色单选；首页「今日任务」卡片（各状态计数）→ `/tasks`。
- **任务页 `/tasks`**：Tab `今日待办 | 历史 | 成就`
  - 待完成：卡片（分类色标+学科角标+插图）+「上传完成图（多张）+备注+提交」；自主任务带 `⭐ 自主`。
  - 待检查：`已提交，等待家长检查` + `撤回`。
  - 需修改：红条 + 家长评语 + 纠错图 + 重新提交。
  - 已完成：✅ + 星级 + 评语。
  - 「+ 自主添加任务」入口。
- 设置页「家庭」：待确认绑定 `[同意]/[拒绝]`、已绑定家长列表 + 解绑。

### 10.2 家长端（底部导航：首页/今日任务/检查/模板/设置）
- **首页 `/parent`**：孩子切换 chips；今日四状态统计；入口卡片：错题本（只读）、成就。
- **今日任务 `/parent/tasks`**：孩子切换 + 日期选择（默认今天/可看明天）；分组列表；编辑/删除；`+ 新增任务`、`复制昨日`；任务表单（分类/学科/名称/要求/插图/**需上传开关**）。
- **检查台 `/parent/review`**：待检查任务（按孩子过滤）→ 看证据图 → 通过（星级+评语）/ 需修改（评语+纠错图）。
- **模板 `/parent/templates`**：周期模板 CRUD（含插图/开关/周期/星期多选/起止日）。
- **错题本 `/parent/notebook`**：孩子统计 + 错题列表（只读）。
- **设置 `/parent/settings`**：改密码、关联孩子（发起绑定）、孩子列表（待确认/已关联+解绑）、成就入口、退出。

---

## 11. API 契约（前缀 `/api/v1`，错误统一 `{"detail":{"code","message"}}`）

### 11.1 图片
`POST /tasks/images/upload`（multipart）→ `{id,file_path,...}`；`DELETE /tasks/images/{id}`。

### 11.2 家庭
`POST /family/bind {username}`→pending；`GET /family/children`；`GET /family/requests`(学生)；`POST /family/bind/{id}/confirm`(学生)；`DELETE /family/bind/{id}`。

### 11.3 模板（家长）
`GET /tasks/templates?student_id`；`POST /tasks/templates`（含 `illustration_image_ids?`）；`PUT /tasks/templates/{id}`（含 `version`）；`DELETE /tasks/templates/{id}`。

### 11.4 实例与状态机
| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/tasks/daily?date&student_id` | 家长/学生 | 某日实例（先惰性生成模板 + **今日自动复习任务**），含 images |
| POST | `/tasks/daily` | 家长/学生 | 创建任务：家长=布置；学生=`student_id=自己`=自主 |
| PUT | `/tasks/{id}` | 家长（全部）/学生（仅自己创建） | 编辑内容+插图，含 `version`；自动复习任务仅家长可改名称/要求 |
| DELETE | `/tasks/{id}` | 家长/学生（自己创建） | 删除 + 清理图片；**自动复习任务不可删除** |
| POST | `/tasks/daily/copy` | 家长 | `{student_id, date?}` → `{copied,skipped}` |
| POST | `/tasks/{id}/submit` | 学生 | T1/T4 `{note?, evidence_image_ids?}` |
| POST | `/tasks/{id}/withdraw` | 学生 | T5 |
| POST | `/tasks/{id}/review` | 家长 | T2/T3 `{result, rating?, comment?, correction_image_ids?, version}` |
| GET | `/tasks/history?student_id&start&end` | 家长/学生 | 历史（只读） |
| GET | `/tasks/overview` | 家长/学生 | 四状态计数 |

实例响应：`{id, template_id, created_by_id, student_id, task_date, category, subject, name, description, require_evidence, source, status, checkin_note, submitted_at, reviewed_by_id, rating, review_comment, reviewed_at, version, images:[...], created_at, updated_at}`

### 11.5 错题本（家长只读）
questions / statistics 端点增加可选 `student_id`（绑定家长可用）；`list_questions` 增加 `due=1`（今日待复习清单）。

### 11.6 成就
`GET /achievements` → `{data:[{code, title, desc, emoji, unlocked, progress, target}]}`（按角色）。

### 11.7 错误码
`403 NOT_BOUND`（未绑定）/ `409 VERSION_CONFLICT` / `400 TASK_DATE_MISMATCH` / `400 EVIDENCE_REQUIRED` / `400 INVALID_STATE` / `403 FORBIDDEN` / `413 FILE_TOO_LARGE` / `415`。

---

## 12. 数据库升级（铁律：不破坏存量数据）

**原则：所有表结构变更采用「增量、幂等、非破坏」迁移，绝不触碰存量数据。**

| 变更类型 | 做法 |
|---|---|
| 新增表 | `Base.metadata.create_all` 启动时自动建；**不修改任何已有表**；新表 FK 只引用 `users.id` 等已存在主键 |
| 存量表加列 | `backend/app/migrations.py` 维护 `COLUMN_MIGRATIONS = [(表, 列, DDL)]`；启动时 `PRAGMA table_info(表)` 检查，**缺列才** `ALTER TABLE ADD COLUMN ... DEFAULT ...`（存量行自动填默认值，如 `role='student'`） |
| 存量表改/删列、加唯一约束 | **不做**（可能冲突存量数据）；需要唯一性时在**新表**上用唯一约束/部分唯一索引，或应用层校验 |

- 迁移在 lifespan 启动时执行；`deploy.sh` 重启后端即自动完成。
- 本次变更涉及存量表仅 `users` 加 `role`（默认 `student`，存量账号全部保留且自动归为学生）。
- 新表 `task_instances` 的「每天仅一条自动复习任务」用 SQLAlchemy **部分唯一索引** `Index(..., sqlite_where=source='auto_review')` 实现（create_all 支持）。
- **测试**：迁移框架有 pytest 覆盖 —— 用临时库造「旧结构 users 表 + 存量行」→ 运行迁移 → 断言：新列出现、默认值正确、**存量行原样保留**、重复运行幂等不报错。

---

## 13. 数据库自动备份（每天 24:00 · 保留 15 天）

**目标**：每晚 00:00 自动备份 SQLite 数据库，最多保留 **15 份**，第 16 天起自动覆盖/删除最旧的。

### 13.1 备份脚本（重构现有 `backup.sh`）
- **安全备份**：用 `sqlite3 "$DB" ".backup '$FILE'"`（SQLite 在线备份 API，即使数据库正被写入也得到**一致快照**）替换原 `cp`。
- **文件**：`backend/data/backups/mistake_notebook_YYYYMMDD.db`（每天一份，同日重跑覆盖该日文件）。
- **轮转**：保留最近 **15 份**，第 16 天自动删除最旧的（`ls -1t | tail -n +16 | xargs rm -f`）。
- 日志写 `backend/logs/backup.log`。

### 13.2 定时（launchd）
- 新增 `com.mistake-notebook.backup.plist`：`StartCalendarInterval` **Hour=0, Minute=0**（每天 00:00）运行 `backup.sh`；`RunAtLoad=true`（开机/登录即补做一次）；日志 `backend/logs/backup.log`。
- `startup.sh` 增加**幂等装载**步骤：将该 plist 复制到 `~/Library/LaunchAgents/` 并 `launchctl load -w`（已装载则跳过），保证登录即注册。

### 13.3 测试
- 用临时 SQLite 库演练：备份文件生成、命名正确、15 份封顶、第 16 份删最旧；用 `sqlite3` 校验备份可打开、表结构与行数一致。

---

## 14. 边界情况
| 场景 | 处理 |
|---|---|
| 两位家长同时编辑/批改同一任务 | 乐观锁 `409`，前端提示刷新 |
| 家长给未绑定/待确认孩子建任务 | `403 NOT_BOUND` |
| 学生提交非当天/过期 | `400` 仅可任务当天提交 |
| 孩子传错图 | 检查前可撤回重传 |
| 作业有错 | 驳回+纠错图 → 重做重交 |
| 复制昨日 | 复制内容+插图，不复制证据/评语/状态；目标日相同项跳过 |
| 家长调整进行中任务 | 可改内容，不改状态/已交证据 |
| 学生编辑家长布置的任务 | 禁止（仅能编辑自己创建的） |

---

## 15. 明确不做（YAGNI）
- 不做补交/补打卡；过期不可补。
- 不做推送/WebSocket（刷新可见）。
- 家长错题本**只读**，不做家长编辑错题。
- 成就不做持久化解锁记录（实时计算；后续要「解锁弹窗」再加表）。
