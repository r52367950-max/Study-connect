import { MaterialKind } from "@prisma/client";
import { MaterialSearchQueryDto } from "../dto/material-search-query.dto";

const SUBJECT_ALIASES: Record<string, string> = {
  math: "数学",
  maths: "数学",
  数学: "数学",
  语文: "语文",
  中文: "语文",
  国文: "语文",
  english: "英语",
  英语: "英语",
  英文: "英语",
  物理: "物理",
  化学: "化学",
  生物: "生物",
  历史: "历史",
  地理: "地理",
  政治: "政治",
  道法: "道德与法治",
  道德与法治: "道德与法治",
};

const GRADE_ALIASES: Record<string, string> = {
  一年级: "一年级",
  "1年级": "一年级",
  小一: "一年级",
  二年级: "二年级",
  "2年级": "二年级",
  小二: "二年级",
  三年级: "三年级",
  "3年级": "三年级",
  小三: "三年级",
  四年级: "四年级",
  "4年级": "四年级",
  小四: "四年级",
  五年级: "五年级",
  "5年级": "五年级",
  小五: "五年级",
  六年级: "六年级",
  "6年级": "六年级",
  小六: "六年级",
  小升初: "六年级",
  初一: "初一",
  七年级: "初一",
  "7年级": "初一",
  初二: "初二",
  八年级: "初二",
  "8年级": "初二",
  初三: "初三",
  九年级: "初三",
  "9年级": "初三",
  中考: "初三",
  高一: "高一",
  高二: "高二",
  高三: "高三",
  高考: "高三",
};

const STAGE_BY_GRADE: Record<string, string> = {
  一年级: "小学",
  二年级: "小学",
  三年级: "小学",
  四年级: "小学",
  五年级: "小学",
  六年级: "小学",
  初一: "初中",
  初二: "初中",
  初三: "初中",
  高一: "高中",
  高二: "高中",
  高三: "高中",
};

const KIND_ALIASES: Record<string, MaterialKind> = {
  练习: MaterialKind.EXERCISE,
  习题: MaterialKind.EXERCISE,
  作业: MaterialKind.EXERCISE,
  讲义: MaterialKind.HANDOUT,
  课件: MaterialKind.HANDOUT,
  知识点: MaterialKind.HANDOUT,
  真题: MaterialKind.EXAM,
  试卷: MaterialKind.EXAM,
  试题: MaterialKind.EXAM,
  考卷: MaterialKind.EXAM,
  模拟: MaterialKind.MOCK,
  模拟卷: MaterialKind.MOCK,
  模考: MaterialKind.MOCK,
};

export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\u3000\s]+/g, " ")
    .trim();
}

export function normalizeMaterialSearchQuery(
  query: MaterialSearchQueryDto,
): MaterialSearchQueryDto {
  const q = query.q ? normalizeSearchText(query.q) : undefined;
  const normalized: MaterialSearchQueryDto = { ...query, q };
  const tokens = q ? q.split(" ") : [];
  const haystack = q ?? "";

  for (const token of tokens) {
    normalized.subject ??=
      SUBJECT_ALIASES[token.toLowerCase()] ?? SUBJECT_ALIASES[token];
    normalized.grade ??= GRADE_ALIASES[token];
  }
  for (const [alias, subject] of Object.entries(SUBJECT_ALIASES))
    if (!normalized.subject && haystack.includes(alias))
      normalized.subject = subject;
  for (const [alias, grade] of Object.entries(GRADE_ALIASES))
    if (!normalized.grade && haystack.includes(alias)) normalized.grade = grade;
  for (const [alias, kind] of Object.entries(KIND_ALIASES))
    if (!normalized.kind && haystack.includes(alias)) normalized.kind = kind;

  normalized.stage ??= normalized.grade
    ? STAGE_BY_GRADE[normalized.grade]
    : undefined;
  normalized.stage = normalized.stage
    ? normalizeSearchText(normalized.stage)
    : normalized.stage;
  normalized.grade = normalized.grade
    ? normalizeSearchText(normalized.grade)
    : normalized.grade;
  normalized.subject = normalized.subject
    ? normalizeSearchText(normalized.subject)
    : normalized.subject;
  normalized.region = normalized.region
    ? normalizeSearchText(normalized.region)
    : normalized.region;
  return normalized;
}
