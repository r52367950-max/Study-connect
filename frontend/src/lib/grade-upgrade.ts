import { GRADES_BY_STAGE, STAGES } from '@/components/onboarding/constants'

interface GradeUpgradeUser {
  grades: string[]
  gradesUpdatedAt: string | null
}

/**
 * Whether to prompt the user to bump their grades for the new school year.
 * Pure (no persistence): true only in/after September (`getMonth()` is 0-based)
 * when grades haven't already been updated on/after Aug 1 of the current year.
 */
export function shouldPromptGradeUpgrade(
  user: GradeUpgradeUser | null | undefined,
  now: Date,
): boolean {
  if (!user || user.grades.length === 0) return false
  if (now.getMonth() < 8) return false
  if (!user.gradesUpdatedAt) return true
  return new Date(user.gradesUpdatedAt) < new Date(now.getFullYear(), 7, 1)
}

export interface GradeUpgradePlan {
  /** Non-terminal grades that move up one within their stage. */
  promotions: Array<{ from: string; to: string }>
  /** Terminal (graduating) grades the user currently holds, e.g. 初三/高三/九年级. */
  graduating: string[]
  /** Grades not found in any stage — left untouched. */
  unchanged: string[]
}

function findGradePosition(
  grade: string,
): { index: number; grades: readonly string[] } | null {
  for (const stage of STAGES) {
    const grades = GRADES_BY_STAGE[stage]
    const index = grades.indexOf(grade)
    if (index !== -1) return { index, grades }
  }
  return null
}

export function planGradeUpgrade(grades: string[]): GradeUpgradePlan {
  const promotions: Array<{ from: string; to: string }> = []
  const graduating: string[] = []
  const unchanged: string[] = []

  for (const grade of grades) {
    const pos = findGradePosition(grade)
    if (!pos) {
      unchanged.push(grade)
    } else if (pos.index < pos.grades.length - 1) {
      promotions.push({ from: grade, to: pos.grades[pos.index + 1] })
    } else {
      graduating.push(grade)
    }
  }

  return { promotions, graduating, unchanged }
}

/**
 * Compute the next grade list. Non-terminal grades advance one level; graduating
 * grades are kept or dropped per `archiveGraduating` (archiving never deletes
 * other data — it only removes the terminal grade from the list).
 */
export function applyGradeUpgrade(
  grades: string[],
  options: { archiveGraduating: boolean },
): string[] {
  const plan = planGradeUpgrade(grades)
  const next = new Set<string>(plan.unchanged)
  for (const { to } of plan.promotions) next.add(to)
  if (!options.archiveGraduating) {
    for (const grade of plan.graduating) next.add(grade)
  }
  return Array.from(next)
}
