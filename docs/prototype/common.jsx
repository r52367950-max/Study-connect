/* Common building blocks — CeladonInk edition */

/* ─── Color tokens ──────────────────────────────────────────
   Near-white bg with barely-there celadon tint.
   Green used sparingly as accent only.
   ─────────────────────────────────────────────────────────── */
const T = {
  ink:        '#0C0E0D',
  ink2:       '#1D201F',
  ink3:       '#3C4140',
  muted:      '#6B7270',
  muted2:     '#9AABA7',
  line:       '#E4E8E6',
  line2:      '#EEF1EF',
  fill:       '#F3F6F4',
  fill2:      '#F8FAF9',
  bg:         '#FAFBFA',        // near-white, ghost of celadon
  accent:     '#7DA898',        // celadon green — small usage only
  accentBg:   '#D6E9E2',        // very light celadon for chip/badge bg
};

/* ─── Fonts ─────────────────────────────────────────────────
   Primary: 思源黑体 (Noto Sans SC)
   Display: 思源宋体 (Noto Serif SC) — login hero, section titles
   Mono:    JetBrains Mono — numbers, labels, code
   ─────────────────────────────────────────────────────────── */
const sans  = '"Noto Sans SC", "PingFang SC", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const serif = '"Noto Serif SC", "Songti SC", "STSong", Georgia, serif';
const mono  = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

/* ─── Sample data ─────────────────────────────────────────── */
const SAMPLE = [
  { id:  1, title: '2024 高考数学全国卷 II 完整解析',     subject: '数学', stage: '高中',          grade: '高三',  year: 2024, score: 4.8, dl: 3201, who: '李伟',   when: '3 天前',  size: '2.4 MB', kind: '真题',  saved: true  },
  { id:  2, title: '高三数学 · 圆锥曲线 50 题精讲',       subject: '数学', stage: '高中',          grade: '高三',  year: 2024, score: 4.9, dl: 2890, who: '林老师', when: '1 周前',  size: '3.1 MB', kind: '习题',  saved: true  },
  { id:  3, title: '高考数学 · 导数压轴专项训练',         subject: '数学', stage: '高中',          grade: '高三',  year: 2024, score: 4.8, dl: 2341, who: '林老师', when: '2 周前',  size: '2.6 MB', kind: '习题',  saved: false },
  { id:  4, title: '高二数学 · 三角函数综合测试卷',       subject: '数学', stage: '高中',          grade: '高二',  year: 2024, score: 4.7, dl: 1890, who: '张老师', when: '3 周前',  size: '1.9 MB', kind: '模拟',  saved: false },
  { id:  5, title: '高一数学必修一 · 函数专题讲义',       subject: '数学', stage: '高中',          grade: '高一',  year: 2023, score: 4.5, dl: 1204, who: '王老师', when: '1 月前',  size: '4.2 MB', kind: '讲义',  saved: false },
  { id:  6, title: '初三数学 · 中考压轴题分类专训',       subject: '数学', stage: '初中',          grade: '初三',  year: 2024, score: 4.8, dl: 1560, who: '陈老师', when: '5 天前',  size: '3.0 MB', kind: '习题',  saved: false },
  { id:  7, title: '初中数学（五四制）八年级几何辅导',    subject: '数学', stage: '初中（五四制）', grade: '八年级', year: 2024, score: 4.9, dl: 980,  who: '陈老师', when: '2 月前',  size: '8.4 MB', kind: '讲义',  saved: false },
  { id:  8, title: '高二英语完形填空专项 200 题',         subject: '英语', stage: '高中',          grade: '高二',  year: 2025, score: 4.9, dl: 2104, who: '陈思雨', when: '2 周前',  size: '1.8 MB', kind: '习题',  saved: true  },
  { id:  9, title: '高三英语 · 2024 全国卷真题精析',     subject: '英语', stage: '高中',          grade: '高三',  year: 2024, score: 4.8, dl: 1876, who: '陈思雨', when: '1 月前',  size: '2.2 MB', kind: '真题',  saved: false },
  { id: 10, title: '初三物理 · 力学综合复习讲义',         subject: '物理', stage: '初中',          grade: '初三',  year: 2024, score: 4.6, dl: 832,  who: '张老师', when: '6 天前',  size: '4.1 MB', kind: '讲义',  saved: false },
  { id: 11, title: '高二物理 · 电磁感应专项测试',         subject: '物理', stage: '高中',          grade: '高二',  year: 2024, score: 4.7, dl: 1123, who: '王磊',   when: '3 周前',  size: '2.8 MB', kind: '模拟',  saved: false },
  { id: 12, title: '高一化学必修一元素周期表速记法',       subject: '化学', stage: '高中',          grade: '高一',  year: 2023, score: 4.4, dl: 567,  who: '王老师', when: '1 月前',  size: '3.2 MB', kind: '讲义',  saved: false },
  { id: 13, title: '高二化学 · 有机化学基础专题卷',       subject: '化学', stage: '高中',          grade: '高二',  year: 2024, score: 4.6, dl: 743,  who: '赵老师', when: '2 周前',  size: '2.5 MB', kind: '习题',  saved: true  },
  { id: 14, title: '初二语文 · 文言文阅读专项训练',       subject: '语文', stage: '初中',          grade: '初二',  year: 2024, score: 4.7, dl: 419,  who: '李老师', when: '1 月前',  size: '0.9 MB', kind: '习题',  saved: false },
  { id: 15, title: '高三语文 · 现代文阅读得分策略',       subject: '语文', stage: '高中',          grade: '高三',  year: 2024, score: 4.6, dl: 890,  who: '孙老师', when: '2 周前',  size: '1.5 MB', kind: '讲义',  saved: false },
  { id: 16, title: '初三历史 · 中考热点专题汇编',         subject: '历史', stage: '初中',          grade: '初三',  year: 2024, score: 4.5, dl: 612,  who: '刘老师', when: '3 周前',  size: '3.8 MB', kind: '习题',  saved: false },
  { id: 17, title: '高二地理 · 自然地理综合专题',         subject: '地理', stage: '高中',          grade: '高二',  year: 2024, score: 4.7, dl: 534,  who: '吴老师', when: '1 月前',  size: '5.1 MB', kind: '讲义',  saved: false },
  { id: 18, title: '初三生物 · 中考遗传与变异专项',       subject: '生物', stage: '初中',          grade: '初三',  year: 2024, score: 4.6, dl: 487,  who: '林老师', when: '2 月前',  size: '2.3 MB', kind: '习题',  saved: false },
];

/* ─── User context ────────────────────────────────────────── */
const DEFAULT_USER = {
  name: '林老师', role: 'teacher',
  school: '', city: '北京',
  stages: ['高中'], grades: ['高一'], subjects: ['数学'],
  viewedKinds: ['习题','真题'],
};
const UserCtx = React.createContext(DEFAULT_USER);

function formatUserTitle(u) {
  const head = (u.grades && u.grades[0]) || (u.stages && u.stages[0]) || '';
  if (u.role === 'student') return head ? `${head}学生` : '学生';
  const tail = (u.subjects && u.subjects[0]) || '';
  return (head + tail) || '中学教师';
}

/* ─── Recommendation ──────────────────────────────────────── */
function scoreMaterial(m, u) {
  let s = 0;
  if (u.subjects?.includes(m.subject)) s += 5.0;
  if (u.grades?.includes(m.grade))     s += 3.0;
  if (u.stages?.includes(m.stage))     s += 2.0;
  if (u.city && m.city === u.city)     s += 1.5;
  if (u.viewedKinds?.includes(m.kind)) s += 1.0;
  s += Math.log10((m.dl||1) + 1) * 0.8;
  s += ((m.score||4) - 4) * 2.0;
  if (m.year >= 2024) s += 0.6;
  return s;
}
function reasonFor(m, u) {
  if (u.subjects?.includes(m.subject) && u.grades?.includes(m.grade))  return '与你的学科·年级匹配';
  if (u.subjects?.includes(m.subject) && u.stages?.includes(m.stage))  return '你常用的学段·学科';
  if (u.subjects?.includes(m.subject))  return '你常用的学科';
  if (u.stages?.includes(m.stage))      return '你常用的学段';
  if (m.dl >= 1500)                     return '高人气';
  if (m.score >= 4.8)                   return '好评推荐';
  if (m.year >= 2024)                   return '近期热点';
  return '基于浏览记录';
}
function recommend(user, materials, limit = 6) {
  return materials
    .map(m => ({ ...m, _score: scoreMaterial(m, user), _reason: reasonFor(m, user) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}
function recoChipText(u) {
  const parts = [];
  if (u.subjects?.length) parts.push(u.subjects.slice(0,2).join('/'));
  if (u.grades?.length)   parts.push(u.grades[0]);
  else if (u.stages?.length) parts.push(u.stages[0]);
  if (u.city) parts.push(u.city);
  return '基于 ' + parts.join(' · ');
}

/* ─── Responsive ──────────────────────────────────────────── */
const BP = { mobile: 720, tablet: 1080 };
function useViewport() {
  const [w, setW] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  React.useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return { w, isMobile: w < BP.mobile, isTablet: w >= BP.mobile && w < BP.tablet, isDesktop: w >= BP.tablet };
}

/* ─── Brand: Dandelion logomark ───────────────────────────── */
const DandelionMark = ({ size = 26, bg = '#0C0E0D', color = '#FAFBFA', radius }) => {
  const seeds = 14;
  const cx = 16, cy = 16;
  const inner = 4.5, outer = 12, tip = 13.5;
  return (
    <div style={{
      width: size, height: size,
      borderRadius: radius ?? Math.round(size * 0.28),
      background: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={Math.round(size * 0.74)} height={Math.round(size * 0.74)} viewBox="0 0 32 32" fill="none" aria-label="Dandelion">
        {Array.from({ length: seeds }).map((_, i) => {
          const a = (i / seeds) * Math.PI * 2;
          const x1 = cx + Math.cos(a) * inner, y1 = cy + Math.sin(a) * inner;
          const x2 = cx + Math.cos(a) * outer, y2 = cy + Math.sin(a) * outer;
          const tx = cx + Math.cos(a) * tip,   ty = cy + Math.sin(a) * tip;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity="0.85" />
              <circle cx={tx} cy={ty} r="0.95" fill={color} />
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="2.4" fill={color} />
      </svg>
    </div>
  );
};

/* ─── Subject palette (Morandi · low saturation) ─────────── */
const SUBJECT_COLORS = {
  '语文': { bg:'#E8DDD3', fg:'#7A6F5F' },
  '数学': { bg:'#DDE3EA', fg:'#5E6B7A' },
  '英语': { bg:'#DEE4D4', fg:'#6A7259' },
  '物理': { bg:'#DCD6DD', fg:'#6E6471' },
  '化学': { bg:'#D7DEDB', fg:'#5F6B69' },
  '生物': { bg:'#DBDFCB', fg:'#6E7553' },
  '历史': { bg:'#E1D7CB', fg:'#75695A' },
  '地理': { bg:'#D7DCE2', fg:'#5F6770' },
  '政治': { bg:'#DDD9D2', fg:'#6B675F' },
};

Object.assign(window, {
  T, sans, mono, serif,
  SAMPLE, UserCtx, DEFAULT_USER, formatUserTitle,
  recommend, recoChipText, useViewport, BP,
  DandelionMark, SUBJECT_COLORS,
});
