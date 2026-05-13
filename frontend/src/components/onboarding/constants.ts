// Mirror of backend constants in `src/modules/users/dto/update-profile.dto.ts`.
// The backend revalidates server-side; this list only drives the UI.

export const STAGES = ['高中', '初中', '初中（五四制）'] as const

export const GRADES_BY_STAGE: Record<(typeof STAGES)[number], string[]> = {
  高中: ['高一', '高二', '高三'],
  初中: ['初一', '初二', '初三'],
  '初中（五四制）': ['六年级', '七年级', '八年级', '九年级'],
}

export const SUBJECTS = [
  '语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治',
] as const

export const VIEWED_KINDS = ['习题', '讲义', '真题', '模拟'] as const

export const DEMO_CITIES = ['北京', '上海', '广州', '深圳', '成都'] as const
