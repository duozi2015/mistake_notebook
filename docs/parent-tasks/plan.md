# 家长作业打卡模块 — 实施计划（v2）

> 设计文档：`docs/parent-tasks/design.md`
> 开发方式：TDD（先写失败测试 → 最小实现 → 重构），每阶段跑通后进入下一阶段

**常用命令**
```bash
backend/venv/bin/python -m pytest backend/tests -q
cd frontend && npm test && npm run build && npx oxlint
```

---

## 阶段总览

| 阶段 | 内容 |
|------|------|
| **P1 后端-基础** | 模型+迁移、role 认证、权限依赖、family（多家长绑定） |
| **P2 后端-任务** | 模板+生成、daily/复制、图片上传、状态机（submit/withdraw/review）、乐观锁、学生自主任务、history/overview |
| **P3 后端-共享错题本** | questions/statistics 加 `student_id`（绑定家长只读） |
| **P4 后端-成就** | 成就规则引擎 + 指标聚合 + 测试 |
| **P5 前端-家长** | 角色分流、家长布局、首页、今日任务、检查台、模板、错题本、成就 |
| **P6 前端-学生** | 任务页（提交/撤回/重交/证据图/自主任务）、历史、成就、首页入口、设置家庭区 |
| **P7 收尾** | 全量测试、评审（review.md）、最终报告（final_report.md） |

---

## P1 后端-基础

### P1-T1 数据模型 + 迁移框架（铁律：不破坏存量数据）
**文件**：`backend/app/models.py`、`backend/app/migrations.py`（新）、`backend/app/main.py`
- `User.role`；`FamilyBinding`（status=pending/active，唯一(parent,student)）；`TaskTemplate`（含 `version`）；`TaskInstance`（含 `status` 四态、`source`、`created_by_id`、`reviewed_by_id`、`version`、`require_evidence`）；`TaskImage`（target_type/target_id/kind）；`task_instances` 部分唯一索引（自动复习任务每天一条）。
- `migrations.py`：`COLUMN_MIGRATIONS` 列表 + `run_migrations(engine)`（create_all 新表 → PRAGMA 检查缺列才 ALTER，幂等）；lifespan 调用。
- **测试** `test_migrations.py`：临时引擎建**旧结构 users 表 + 存量行**→ 运行迁移 → 断言新列/默认值正确、**存量行原样保留**、重复运行幂等不报错、create_all 不动已有表。

### P1-T2 认证 + 权限依赖
**文件**：`backend/app/schemas.py`、`backend/app/routers/auth.py`、`backend/app/auth.py`
- `UserRegister.role`、`UserResponse.role`；register/login/me 带 role。
- `require_parent`、`require_student`；`is_active_binding(db, parent, student)` 辅助。
- **测试** `test_auth_role.py`：注册默认/家长、login/me 返回 role、403 校验。

### P1-T3 家庭绑定 API
**文件**：`backend/app/routers/family.py`（新）、`main.py`
- bind/children/requests/confirm/delete（多对多，pending→active）。
- **测试** `test_family.py`：绑定流程、重复发起、确认/拒绝、解绑、孩子见请求、绑定后家长才有权、403。

### P1-T4 数据库自动备份（每天 24:00 · 保留 15 天）
**文件**：`backup.sh`（重构）、`com.mistake-notebook.backup.plist`（新）、`startup.sh`（加装载步骤）
- `backup.sh`：用 `sqlite3 "$DB" ".backup '$FILE'"` 安全在线备份到 `backend/data/backups/mistake_notebook_YYYYMMDD.db`；轮转保留最近 15 份（第 16 份删最旧）；日志 `backend/logs/backup.log`。
- 新增 plist：`StartCalendarInterval Hour=0 Minute=0` + `RunAtLoad=true`，运行 `backup.sh`。
- `startup.sh`：幂等装载该 plist 到 `~/Library/LaunchAgents/` 并 `launchctl load -w`（已装载跳过）。
- **测试**：临时 SQLite 库演练 `backup.sh` —— 备份生成、命名正确、15 份封顶删最旧、备份库可打开且表/行一致。

---

## P2 后端-任务

### P2-T1 模板 CRUD + 惰性生成
**文件**：`backend/app/services/task_generation.py`（新）、`backend/app/routers/tasks.py`（新）
- `local_today()`、`ensure_instances(db, student, up_to)`（active 模板按周期补齐，复制插图，幂等）。
- 模板端点：list/create/update(乐观锁)/archive。
- **测试** `test_tasks_templates.py`：创建校验、daily/weekly 生成、start/end、幂等、插图复制、编辑、停用。

### P2-T2 每日任务 + 复制 + 图片上传 + 自动复习任务
**文件**：`backend/app/routers/tasks.py`、`routers/images.py`（新增任务图片端点）
- `POST /tasks/images/upload`（复用尺寸/白名单，存 uploads/tasks/）。
- daily list/create（家长布置 + **学生自主**）、PUT/DELETE 实例（权限：家长全部/学生仅自己）、`daily/copy`（合并去重、复制插图、version）。
- **自动复习任务**：`task_generation.py` 增加 `ensure_auto_review(db, student, date)` —— 统计 `next_review_date<=今天` 的错题数，>0 生成/刷新 `source='auto_review'` 实例（部分唯一索引幂等）；=0 时把今日 pending 自动复习任务置 approved。
- **测试** `test_tasks_daily.py`：创建/自主创建/编辑(乐观锁409)/删除/复制去重/权限；`test_auto_review.py`：到期生成、无到期自动完成、分科描述、幂等、不可删除。

### P2-T3 状态机：submit / withdraw / review
**文件**：`backend/app/routers/tasks.py`
- submit(T1/T4，require_evidence 强制)、withdraw(T5)、review(T2/T3，含 version)。
- **测试** `test_tasks_state_machine.py`：全迁移路径、当天限制、证据必传、乐观锁、非本人/状态不符错误。

### P2-T4 历史 + 汇总 + 全量校验
- history、overview（四状态计数）；`pytest backend/tests -q` 全绿。

---

## P3 后端-共享错题本（家长只读）

### P3-T1 questions 加 student_id + due 过滤
**文件**：`backend/app/routers/questions.py`
- list/get 支持 `student_id`（绑定家长 → 用该学生过滤；学生 → 禁止他人）；list 增加 `due=1`（今日待复习清单）。
- **测试** `test_questions_parent_view.py`：家长看孩子错题/待复习、未绑定 403、学生传他人 403。

### P3-T2 statistics 加 student_id
**文件**：`backend/app/routers/statistics.py`
- overview/trends/report/mastery/heatmap 支持 `student_id`（绑定家长）。
- **测试** `test_statistics_parent_view.py`。

---

## P4 后端-成就

### P4-T1 成就引擎
**文件**：`backend/app/services/achievements_service.py`（新）、`backend/app/routers/achievements.py`（新）
- 指标聚合：学生（tasks_completed/stars/streak/self/review_streak/questions_total）、家长（assign_days/reviews_count/timely_streak/stars_given）。
- 规则表（§9.2/9.3）+ 评估 → `{unlocked, progress, target}`。
- **测试** `test_achievements.py`：造数据验证解锁阈值与进度、角色区分。

---

## P5 前端-家长

### P5-T1 类型/服务/角色分流
**文件**：`types/index.ts`、`services/auth.ts`、`services/family.ts`（新）、`services/tasks.ts`（新）、`services/achievements.ts`（新）、`stores/authStore.ts`、`App.tsx`
- User.role；路由：学生 `/`（MobileLayout），家长 `/parent`（ParentLayout）；登录按角色跳转；RootGate。

### P5-T2 家长布局 + 首页
**文件**：`components/Layout/ParentLayout.tsx`、`ParentNav.tsx`、`features/tasks/ParentHomePage.tsx`
- 孩子切换 + 今日四状态统计 + 错题本/成就入口卡片。

### P5-T3 今日任务管理 + 检查台
**文件**：`features/tasks/TaskManagePage.tsx`、`ReviewPage.tsx`、`components/`（TaskForm/TaskItem/CategoryTag/ImageViewer 复用）
- 日期选择、增删改（乐观锁 409 处理）、复制昨日、任务表单（分类/学科/名称/要求/插图/需上传开关）。
- 检查台：证据图查看 → 通过（星级+评语）/ 需修改（评语+纠错图）。

### P5-T4 模板 + 错题本 + 设置 + 成就
**文件**：`TemplateManagePage.tsx`、`ParentNotebookPage.tsx`、`ParentSettingsPage.tsx`、`AchievementsPage.tsx`
- 错题本只读：statisticsApi 加 `student_id` 参数，只读错题列表；Tab **统计 / 复习情况 / 错题列表**（复习情况：待复习/逾期/完成率/趋势/自动复习任务状态 + 今日待复习清单 `due=1`）。
- 设置：关联孩子/孩子列表；成就页按角色渲染徽章墙。

### P5-T5 家长端验证：`npm run build`、`npx oxlint`、手测。

---

## P6 前端-学生

### P6-T1 学生任务页
**文件**：`features/tasks/StudentTaskPage.tsx`
- 今日待办（四状态渲染 + 提交证据图/备注/撤回/重交 + 自主任务徽标）、历史 Tab、成就 Tab、自主添加入口。

### P6-T2 首页入口 + 设置家庭区
**文件**：`features/dashboard/DashboardPage.tsx`、`features/settings/SettingsPage.tsx`
- 今日任务卡片；学生设置「家庭」区（同意/拒绝/解绑）。

### P6-T3 前端全量验证：`npm test`、`npm run build`、`npx oxlint`、学生+家长两条完整流程手测。

---

## P7 收尾
全量后端 pytest + 前端 test/build/lint 通过 → 代码评审产出 `review.md`（Critical 修复）→ 最终报告 `final_report.md` → 询问提交方式。
