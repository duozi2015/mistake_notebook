# 代码评审报告 — 家长作业打卡模块

> 评审范围：`docs/parent-tasks/design.md`（v4）涉及的本次全部改动
> 评审方式：对照设计文档逐项核查 + 全量测试 + 真实服务器冒烟

---

## 结论

- **Critical（阻塞）**：0
- **Major（需修复）**：0
- **Minor（已知限制）**：3
- **评审中发现并已修复**：1

---

## 已修复（评审中发现）

### 1. 「复制昨日」会复制自动复习任务（重复）
- **位置**：`backend/app/routers/tasks.py` → `copy_yesterday`
- **问题**：`source == 'auto_review'` 的昨日实例被当作普通任务复制到今日（`source` 重置为 `manual`），与今日自动生成的复习任务重复，孩子会看到两条「错题复习」。
- **修复**：复制时跳过 `auto_review` 来源行；新增测试 `test_copy_yesterday_skips_auto_review`。

---

## Minor（已知限制，暂不处理）

| # | 位置 | 说明 |
|---|------|------|
| 1 | `frontend ImagePicker` | 已上传但未挂载（取消表单）的任务图片会残留在 `uploads/tasks/`，无自动清理。家庭单机场景影响可忽略，后续可加定期清理任务。 |
| 2 | `task_generation.ensure_instances` | 对长周期 daily 模板逐日迭代生成，历史跨度大时耗时线性增长。家庭数据量级可接受，不做预生成优化。 |
| 3 | `/tasks/daily?student_id=`（学生角色） | 学生传 `student_id` 会被忽略（始终返回本人数据），不构成数据泄漏，行为与文档一致。 |

---

## 核查清单（对照设计）

| 设计项 | 实现 | 状态 |
|--------|------|------|
| 数据模型：User.role / FamilyBinding / TaskTemplate / TaskInstance / TaskImage + 部分唯一索引 | `models.py` | ✅ |
| 数据库升级铁律：增量、幂等、非破坏（存量 users 加 role，新表 create_all） | `migrations.py` + `main.py` lifespan | ✅ |
| 角色注册 / 登录 / me 返回 role；require_parent/require_student | `auth.py` / `routers/auth.py` | ✅ |
| 家庭绑定两步确认（多对多） | `routers/family.py` | ✅ |
| 模板 CRUD + 周期惰性生成（daily/weekly/start/end/幂等） | `services/task_generation.py` + `tasks.py` | ✅ |
| 记忆曲线「错题复习」自动任务（今日生成/无到期自动完成/每天一条） | `services/task_generation.py` | ✅ |
| 每日任务：布置/学生自主/编辑/删除/复制昨日（去重+插图） | `tasks.py` | ✅ |
| 图片上传（复用压缩方案：前端 compressImage + 后端 10MB/白名单） | `tasks.py` + `ImagePicker.tsx` | ✅ |
| 状态机：pending→submitted→approved/rejected→resubmit + 撤回；仅当天提交 | `tasks.py` submit/withdraw/review | ✅ |
| 乐观锁并发控制（version，编辑/批改 409） | `tasks.py` `_check_version` | ✅ |
| 家长只读错题本 + 复习情况 + due 过滤 | `questions.py` / `statistics.py` | ✅ |
| 成就引擎（学生/家长两套规则） | `services/achievements_service.py` + `achievements.py` | ✅ |
| 备份：sqlite3 在线备份 + 15 份轮转 + launchd 每日 00:00 | `backup.sh` + plist + `startup.sh` | ✅ |

---

## 测试结果

- 后端 pytest：**100 通过**（迁移 3 + 角色 7 + 家庭 14 + 任务 27 + 家长视图 6 + 成就 7 + 原有 36）
- 前端 vitest：**13 通过**；`npm run build`（tsc -b）通过；oxlint 仅存量 warning
- 真实服务器冒烟（临时库）：注册→绑定→确认→建任务→提交校验→模板生成→汇总→成就 全流程通过
