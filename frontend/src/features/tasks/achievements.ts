import type { Achievement } from '../../types'

/** 成就「即将达成」判定：未解锁、有进度、且进度 ≥ 80% */
export function isNearAchievement(a: Achievement): boolean {
  return !a.unlocked && a.progress > 0 && a.progress_pct >= 80
}

export function hasNearAchievement(items: Achievement[]): boolean {
  return items.some(isNearAchievement)
}

export function nearAchievements(items: Achievement[]): Achievement[] {
  return items.filter(isNearAchievement)
}

/** 距离解锁最近的一个成就（无进度者为 null） */
export function nearestAchievement(items: Achievement[]): Achievement | null {
  const locked = items.filter((a) => !a.unlocked && a.progress > 0)
  if (!locked.length) return null
  return [...locked].sort((a, b) => b.progress_pct - a.progress_pct)[0]
}
