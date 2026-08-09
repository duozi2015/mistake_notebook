# 家长作业打卡模块 — 最终报告

> 分支：`feat/parent-tasks`　|　设计：`docs/parent-tasks/design.md`　|　计划：`docs/parent-tasks/plan.md`　|　评审：`docs/parent-tasks/review.md`

---

## 1. 交付内容

为智能错题本系统新增「家庭任务闭环 + 错题本共管 + 成就激励」能力，含 **P1–P7 全部阶段**。

### 后端（FastAPI + SQLAlchemy）
- **数据模型**（新增 4 表 + 存量 1 列）：
  - `users.role`（存量账号默认 student）
  - `family_bindings`（多家长↔多学生，pending→active）
  - `task_templates`（内容 + 周期规则 + version 乐观锁）
  - `task_instances`（状态机四态 + source + created_by_id/reviewed_by_id + version；部分唯一索引保证每天一条自动复习任务）
  - `task_images`（插图 / 完成证据 / 纠错批注）
- **迁移铁律**：`migrations.py` 增量、幂等、非破坏（PRAGMA 检查缺列才 ALTER），存量数据零影响；lifespan 自动执行。
- **认证/权限**：角色注册、`require_parent/require_student`、`is_active_binding`、`resolve_student_id`（家长只读孩子数据）。
- **家庭绑定**：家长发起 → 孩子确认 → 生效，可解绑。
- **任务模块**：模板 CRUD + 周期惰性生成；每日任务（布置/学生自主/编辑/删除/复制昨日去重）；图片上传（10MB + 白名单，复用压缩方案）。
- **状态机**：`pending → submitted → approved/rejected → resubmit` + 撤回；仅任务当天可提交；家长检查不限日期。
- **记忆曲线自动复习任务**：按 `questions.next_review_date` 自动生成「错题复习」，无到期自动完成。
- **乐观锁**：编辑/批改用 version，冲突 409。
- **家长只读错题本**：questions/statistics 支持 `student_id`（绑定家长）+ `due` 过滤（今日待复习清单）。
- **成就引擎**：学生 14 项 / 家长 9 项，实时聚合 + 徽章墙。

### 前端（React + TS）
- **角色分流路由**：学生 `/`（MobileLayout + `/tasks`），家长 `/parent`（ParentLayout）。
- **家长端**：首页（孩子今日概览）、今日任务管理（日期/增删改/复制昨日）、检查台（证据图→通过/需修改）、周期模板、错题本只读（统计/复习情况/错题）、设置（关联孩子）、成就。
- **学生端**：今日待办（提交证据图/备注/撤回/重交/自主任务⭐）、历史、成就；首页「今日任务」卡片；设置页「家庭」区（同意/拒绝/解绑）。
- **复用**：`compressImage` 压缩、`ImageViewer` 放大、现有 UI 风格。

### 运维
- `backup.sh` 重构：sqlite3 在线安全备份，每日一份，保留 15 份轮转。
- `com.mistake-notebook.backup.plist`：每天 00:00 自动备份（launchd）。
- `startup.sh`：登录时幂等注册备份任务。

---

## 2. 测试结果（全绿）

| 项 | 结果 |
|---|---|
| 后端 pytest | **100 通过**（新增 64：迁移 3 / 角色 7 / 家庭 14 / 任务 27 / 家长视图 6 / 成就 7） |
| 前端 vitest | **13 通过** |
| 前端 build / lint | `tsc -b` ✅；oxlint 仅存量 warning |
| 真实服务器冒烟 | 注册→绑定→确认→建任务→提交校验→模板→汇总→成就 全流程 ✅ |
| 备份演练 | 16 天→保留 15 份、删最旧、备份可打开 ✅ |

---

## 3. 部署说明

1. **升级**：`./deploy.sh`（重建前端 + 重启后端；启动时自动执行数据库迁移，存量数据不受影响）。
2. **备份**：登录后 `startup.sh` 自动注册 `com.mistake-notebook.backup`（每天 00:00 + 登录时补做一次）；也可手动 `./backup.sh`。
3. **家长账号**：注册页选择「家长」创建；在家长端「设置→关联孩子」输入孩子用户名发起绑定，孩子端确认后生效。

---

## 4. 已知限制（详见 review.md）
- 已上传未挂载的任务图片无自动清理（家庭场景可忽略）。
- 长周期模板逐日生成，极端大跨度下略慢。
- 学生传 `student_id` 于任务接口被忽略（返回本人数据，不泄漏）。

---

## 5. 后续可扩展
- 未读/通知提醒；WebSocket 实时。
- 成解锁弹窗（需解锁记录表）。
- 孩子错题本向家长开放编辑（当前只读）。
- 补打卡/请假机制（当前仅当天提交）。
