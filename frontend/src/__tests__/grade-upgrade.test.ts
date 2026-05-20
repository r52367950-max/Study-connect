import { describe, expect, it } from 'vitest'
import {
  applyGradeUpgrade,
  planGradeUpgrade,
  shouldPromptGradeUpgrade,
} from '@/lib/grade-upgrade'

describe('shouldPromptGradeUpgrade', () => {
  const september = new Date(2026, 8, 5) // month is 0-based → September
  const june = new Date(2026, 5, 1)

  it('does not prompt before September', () => {
    expect(shouldPromptGradeUpgrade({ grades: ['初二'], gradesUpdatedAt: null }, june)).toBe(false)
  })

  it('prompts in September when grades were never updated', () => {
    expect(shouldPromptGradeUpgrade({ grades: ['初二'], gradesUpdatedAt: null }, september)).toBe(
      true,
    )
  })

  it('prompts in September when last updated before Aug 1 of this year', () => {
    expect(
      shouldPromptGradeUpgrade({ grades: ['初二'], gradesUpdatedAt: '2026-06-01' }, september),
    ).toBe(true)
  })

  it('does not prompt again once updated on/after Aug 1 of this year', () => {
    expect(
      shouldPromptGradeUpgrade({ grades: ['初三'], gradesUpdatedAt: '2026-09-01' }, september),
    ).toBe(false)
  })

  it('does not prompt when there are no grades to upgrade', () => {
    expect(shouldPromptGradeUpgrade({ grades: [], gradesUpdatedAt: null }, september)).toBe(false)
    expect(shouldPromptGradeUpgrade(null, september)).toBe(false)
  })
})

describe('planGradeUpgrade', () => {
  it('promotes non-terminal grades within their stage', () => {
    expect(planGradeUpgrade(['初一', '高一'])).toEqual({
      promotions: [
        { from: '初一', to: '初二' },
        { from: '高一', to: '高二' },
      ],
      graduating: [],
      unchanged: [],
    })
  })

  it('flags terminal grades as graduating', () => {
    const plan = planGradeUpgrade(['初二', '初三'])
    expect(plan.promotions).toEqual([{ from: '初二', to: '初三' }])
    expect(plan.graduating).toEqual(['初三'])
  })
})

describe('applyGradeUpgrade', () => {
  it('keeps graduating grades when not archiving', () => {
    expect(applyGradeUpgrade(['高一', '初三'], { archiveGraduating: false }).sort()).toEqual(
      ['高二', '初三'].sort(),
    )
  })

  it('drops graduating grades when archiving (without deleting other data)', () => {
    expect(applyGradeUpgrade(['初一', '初三'], { archiveGraduating: true })).toEqual(['初二'])
  })
})
