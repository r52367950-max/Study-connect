/* ════════════════════════════════════════════════════════════
   StudyConnect — Font Comparison Canvas
   4 typography variants, same home-page sample.
   ════════════════════════════════════════════════════════════ */

/* ─── Tokens ─── */
const T = {
  ink: '#0A0A0A', ink2: '#1F1F1F', muted: '#737373', muted2: '#9CA3AF',
  line: '#E5E5E5', line2: '#F0F0F0', fill: '#F7F7F7', bg: '#FFFFFF',
};

/* ─── Font variants ─── */
const VARIANTS = [
  {
    id: 'A',
    name: 'A · Geist + 系统苹方',
    desc: '现行方案 · OpenAI / Vercel 几何风',
    note: '中性极简、技术感强；中英都偏现代。教育属性偏弱。',
    fonts: {
      sans:    '"Geist", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
      display: '"Geist", -apple-system, "PingFang SC", sans-serif',
      mono:    '"Geist Mono", ui-monospace, Menlo, monospace',
      bodyLs:  '-0.011em',
      displayLs: '-0.03em',
      displayWeight: 600,
    },
  },
  {
    id: 'B',
    name: 'B · Inter Tight + 思源黑体',
    desc: '行业标准 · 人文中性',
    note: '稳重、信息密度高；思源黑体在中文阅读上更扎实，字面更宽。',
    fonts: {
      sans:    '"Inter Tight", "Noto Sans SC", -apple-system, "PingFang SC", sans-serif',
      display: '"Inter Tight", "Noto Sans SC", sans-serif',
      mono:    '"JetBrains Mono", "Geist Mono", ui-monospace, Menlo, monospace',
      bodyLs:  '-0.008em',
      displayLs: '-0.025em',
      displayWeight: 600,
    },
  },
  {
    id: 'C',
    name: 'C · Manrope + 霞鹜文楷',
    desc: '友好现代 · 学习/文学气质',
    note: '亲和、温暖、富有文气；文楷的弧线让"学习"场景更柔。注意笔画偏粗，小字慎用。',
    fonts: {
      sans:    '"Manrope", "LXGW WenKai", "Noto Sans SC", "PingFang SC", sans-serif',
      display: '"Manrope", "LXGW WenKai", "PingFang SC", sans-serif',
      mono:    '"Geist Mono", ui-monospace, Menlo, monospace',
      bodyLs:  '0',
      displayLs: '-0.02em',
      displayWeight: 600,
    },
  },
  {
    id: 'D',
    name: 'D · Instrument Serif + Geist + 思源宋体',
    desc: '编辑风 · 杂志/书卷气',
    note: '标题用衬线（斜体可选），正文几何无衬线，中文宋体压稳整体气质。差异化最强。',
    fonts: {
      sans:    '"Geist", -apple-system, "Noto Serif SC", "Songti SC", "PingFang SC", sans-serif',
      display: '"Instrument Serif", "Noto Serif SC", "Songti SC", Georgia, serif',
      mono:    '"Geist Mono", ui-monospace, Menlo, monospace',
      bodyLs:  '-0.008em',
      displayLs: '-0.015em',
      displayWeight: 400,
      displayItalic: true,
      bodySerif: true, // body uses sans + Chinese serif
    },
  },
];

/* ─── Dandelion mark (shared) ─── */
const DandelionMark = ({ size = 26, bg = '#0A0A0A', color = '#FFFFFF' }) => {
  const seeds = 14, cx = 16, cy = 16, inner = 4.5, outer = 12, tip = 13.5;
  return (
    <div style={{
      width:size, height:size, borderRadius: Math.round(size*0.28),
      background:bg, color, flexShrink:0,
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <svg width={Math.round(size*0.74)} height={Math.round(size*0.74)} viewBox="0 0 32 32" fill="none">
        {Array.from({ length: seeds }).map((_, i) => {
          const a = (i/seeds)*Math.PI*2;
          const x1 = cx+Math.cos(a)*inner, y1 = cy+Math.sin(a)*inner;
          const x2 = cx+Math.cos(a)*outer, y2 = cy+Math.sin(a)*outer;
          const tx = cx+Math.cos(a)*tip,   ty = cy+Math.sin(a)*tip;
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

/* ─── Subject icon system (Morandi) ─── */
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
const _g = { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.5, strokeLinecap:'round', strokeLinejoin:'round' };
const G_chinese = p => <svg {..._g} {...p}><circle cx="12" cy="4.6" r="0.85" fill="currentColor" stroke="none"/><path d="M5 8.5h14"/><path d="M11 9.5l-4.5 11"/><path d="M13 9.5l4.5 11"/></svg>;
const G_math    = p => <svg {..._g} {...p}><path d="M4 8.5h16"/><path d="M8.5 9v9c0 .9.6 1.5 1.6 1.5"/><path d="M15.5 9v8.8c0 1.1.7 1.7 1.9 1.7H19"/></svg>;
const G_english = p => <svg {..._g} {...p}><path d="M3 19.5L8 5l5 14.5"/><path d="M5 15h6"/><circle cx="17.5" cy="14.5" r="3.2"/><path d="M20.7 11.3v6.4"/></svg>;
const G_physics = p => <svg {..._g} {...p}><ellipse cx="12" cy="12" rx="8.5" ry="3.2" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="8.5" ry="3.2" transform="rotate(30 12 12)"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>;
const G_chem    = p => <svg {..._g} {...p}><path d="M9.5 3.5h5"/><path d="M10.2 3.5v5.4l-5.3 10.4c-.45.88.19 1.95 1.18 1.95h11.84c.99 0 1.63-1.07 1.18-1.95l-5.3-10.4V3.5"/><path d="M7.6 15.5h8.8"/></svg>;
const G_bio     = p => <svg {..._g} {...p}><path d="M4 20C4 11.2 10.4 4.5 20 4.5c0 9.6-6.4 16-15.5 16z"/><path d="M4.5 19.5L16 8"/></svg>;
const GLYPHS = { '语文':G_chinese,'数学':G_math,'英语':G_english,'物理':G_physics,'化学':G_chem,'生物':G_bio };

const SubjectIcon = ({ name, size = 36 }) => {
  const c = SUBJECT_COLORS[name] || { bg:T.fill, fg:T.ink };
  const Glyph = GLYPHS[name] || G_math;
  const ic = Math.round(size*0.56);
  return (
    <div style={{ width:size, height:size, borderRadius: Math.round(size*0.26), background:c.bg, color:c.fg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <Glyph width={ic} height={ic} />
    </div>
  );
};

/* ─── Kind tag (Morandi) ─── */
const KindTag = ({ kind, font }) => {
  const map = { '习题':'#E1E6EC','讲义':'#E4E8DD','真题':'#EBE0D5','模拟':'#E2DCE2' };
  const tc  = { '习题':'#5E6B7A','讲义':'#6A7259','真题':'#7C6A57','模拟':'#71636B' };
  return <span style={{ padding:'2px 8px', borderRadius:3, fontSize:10.5, background:map[kind], color:tc[kind], fontWeight:500, fontFamily:font.sans }}>{kind}</span>;
};
const Dot = () => <span style={{ width:2, height:2, borderRadius:'50%', background:'#C0C0C0', display:'inline-block', flexShrink:0 }} />;

/* ─── Sample data ─── */
const RECENT = [
  { title:'2024 高考数学全国卷 II 完整解析', subject:'数学', stage:'高三', when:'今天',  kind:'真题' },
  { title:'高二英语完形填空专项 200 题',     subject:'英语', stage:'高二', when:'昨天',  kind:'习题' },
  { title:'初三物理 · 力学综合复习讲义',     subject:'物理', stage:'初三', when:'3天前', kind:'讲义' },
];
const RECO = [
  { title:'高三数学 · 圆锥曲线 50 题精讲', subject:'数学', stage:'高中', grade:'高三', score:4.9, dl:2890, size:'3.1 MB', kind:'习题', reason:'与你的学科·年级匹配' },
  { title:'高三英语 · 2024 全国卷真题精析', subject:'英语', stage:'高中', grade:'高三', score:4.8, dl:1876, size:'2.2 MB', kind:'真题', reason:'你常用的学科' },
  { title:'高二化学 · 有机化学基础专题卷',  subject:'化学', stage:'高中', grade:'高二', score:4.6, dl: 743, size:'2.5 MB', kind:'习题', reason:'好评推荐' },
];

/* ─── Home sample renderer ─── */
const HomeSample = ({ font }) => {
  const sansStyle = { fontFamily: font.sans, letterSpacing: font.bodyLs, color: T.ink };
  const displayStyle = {
    fontFamily: font.display,
    letterSpacing: font.displayLs,
    fontWeight: font.displayWeight,
    fontStyle: font.displayItalic ? 'italic' : 'normal',
    color: T.ink,
  };

  return (
    <div style={{ ...sansStyle, background:'#fff', height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Topbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 22px', borderBottom:`1px solid ${T.line}` }}>
        <DandelionMark size={26} />
        <span style={{ fontSize:14.5, fontWeight:600, letterSpacing:'-0.025em', ...sansStyle }}>StudyConnect</span>
        <span style={{ flex:1 }} />
        <span style={{ fontSize:12, color:T.muted }}>首页</span>
      </div>

      {/* Content */}
      <div style={{ padding:'26px 28px 24px', flex:1, overflow:'hidden' }}>
        {/* Greeting */}
        <div style={{ marginBottom:24 }}>
          <h1 style={{ ...displayStyle, fontSize:32, margin:0, lineHeight:1.15 }}>
            下午好，<span style={{ fontWeight: font.displayItalic ? 500 : 600, fontStyle: font.displayItalic ? 'italic' : 'normal' }}>林老师</span>
          </h1>
          <p style={{ fontSize:13, color:T.muted, margin:'10px 0 0', ...sansStyle }}>
            已收藏 <span style={{ fontFamily: font.mono, color:T.ink, fontWeight:500 }}>7</span> 份资料 · 数学今日上新 <span style={{ fontFamily: font.mono, color:T.ink, fontWeight:500 }}>4</span> 份
          </p>
        </div>

        {/* Section header */}
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:12 }}>
          <h2 style={{ fontSize:14, fontWeight:600, margin:0, letterSpacing:'-0.015em', ...sansStyle }}>最近下载</h2>
          <a style={{ fontSize:12, color:T.muted }}>查看全部 <span style={{ fontFamily:font.mono, color:T.muted2 }}>→</span></a>
        </div>

        {/* Recent cards */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:24 }}>
          {RECENT.map((r,i) => (
            <div key={i} style={{ padding:'13px 14px 11px', border:`1px solid ${T.line}`, borderRadius:10, background:'#fff', display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                <SubjectIcon name={r.subject} size={34} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:500, lineHeight:1.4, marginBottom:3, ...sansStyle, letterSpacing:'-0.01em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.title}</div>
                  <div style={{ fontSize:11, color:T.muted, ...sansStyle }}>{r.subject} · {r.stage}</div>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:8, borderTop:`1px solid ${T.line2}`, fontSize:11, color:T.muted }}>
                <KindTag kind={r.kind} font={font} />
                <span style={{ flex:1 }} />
                <span style={{ fontFamily:font.mono, color:T.muted2 }}>{r.when}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Section: 按学科 */}
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:12 }}>
          <h2 style={{ fontSize:14, fontWeight:600, margin:0, letterSpacing:'-0.015em', ...sansStyle }}>按学科浏览</h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', border:`1px solid ${T.line}`, borderRadius:10, overflow:'hidden', marginBottom:24, background:'#fff' }}>
          {['语文','数学','英语','物理','化学','生物'].map((s,i) => {
            const col = i%3, row = Math.floor(i/3);
            const n = { '语文':312, '数学':487, '英语':401, '物理':198, '化学':156, '生物':142 }[s];
            return (
              <div key={s} style={{
                padding:'12px 14px',
                borderRight: col<2 ? `1px solid ${T.line2}` : 'none',
                borderBottom: row<1 ? `1px solid ${T.line2}` : 'none',
                display:'flex', alignItems:'center', gap:11,
              }}>
                <SubjectIcon name={s} size={32} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, ...sansStyle, letterSpacing:'-0.012em' }}>{s}</div>
                  <div style={{ fontSize:10.5, color:T.muted, fontFamily:font.mono, marginTop:1 }}>{n} 份</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Section: 为您推荐 */}
        <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:10 }}>
          <h2 style={{ fontSize:14, fontWeight:600, margin:0, letterSpacing:'-0.015em', ...sansStyle }}>为您推荐</h2>
          <span style={{ fontSize:10.5, color:T.muted, padding:'2px 8px', border:`1px solid ${T.line}`, borderRadius:20, fontFamily:font.mono, display:'inline-flex', alignItems:'center', gap:5 }}>
            <span style={{ width:4, height:4, borderRadius:'50%', background:'#90A07A' }} />
            基于 数学 · 高三 · 北京
          </span>
        </div>
        {RECO.map((m,idx) => (
          <div key={idx} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 2px', borderBottom:`1px solid ${T.line2}` }}>
            <span style={{ width:20, textAlign:'right', flexShrink:0, fontFamily:font.mono, fontSize:11.5, color: idx<3 ? T.ink : T.muted2, fontWeight: idx<3 ? 600 : 400 }}>
              {String(idx+1).padStart(2,'0')}
            </span>
            <SubjectIcon name={m.subject} size={30} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12.5, fontWeight:500, marginBottom:3, ...sansStyle, letterSpacing:'-0.012em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.title}</div>
              <div style={{ display:'flex', gap:7, alignItems:'center', fontSize:10.5, color:T.muted, ...sansStyle }}>
                <span>{m.subject} · {m.stage} · {m.grade}</span>
                <Dot /><KindTag kind={m.kind} font={font} />
                <Dot /><span style={{ padding:'1px 7px', background:'#EAE5DE', color:'#7A6F5F', borderRadius:3, fontSize:10 }}>{m.reason}</span>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'baseline', fontFamily:font.mono, fontSize:10.5, color:T.muted, flexShrink:0 }}>
              <span style={{ width:52, textAlign:'right', color:T.ink }}>★ {m.score.toFixed(1)}</span>
              <span style={{ width:62, textAlign:'right', color:T.ink2 }}>↓ {m.dl.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── Specimen — show font name + alphabet + numerals at top of each artboard ─── */
const Specimen = ({ v }) => (
  <div style={{
    padding:'18px 28px 14px',
    background: '#F7F6F2',
    borderBottom: `1px solid ${T.line}`,
    fontFamily: v.fonts.sans,
  }}>
    <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:6 }}>
      <span style={{ fontFamily: v.fonts.mono, fontSize:11, color:T.muted, letterSpacing:'0.08em' }}>{v.id}</span>
      <h3 style={{
        margin:0,
        fontFamily: v.fonts.display,
        fontStyle: v.fonts.displayItalic ? 'italic' : 'normal',
        fontWeight: v.fonts.displayWeight,
        fontSize: 22,
        letterSpacing: v.fonts.displayLs,
        color: T.ink,
      }}>{v.name.replace(/^[A-D] · /, '')}</h3>
    </div>
    <p style={{ fontSize:11.5, color:T.muted, margin:'0 0 10px', maxWidth:560, lineHeight:1.55 }}>{v.desc} — {v.note}</p>
    <div style={{ display:'flex', gap:18, alignItems:'baseline', flexWrap:'wrap' }}>
      <span style={{ fontFamily: v.fonts.display, fontStyle: v.fonts.displayItalic ? 'italic' : 'normal', fontSize:26, color:T.ink, fontWeight: v.fonts.displayWeight }}>蒲公英 · Dandelion</span>
      <span style={{ fontFamily: v.fonts.sans, fontSize:13, color:T.muted2 }}>Aa Bb 数学 物理 化学</span>
      <span style={{ fontFamily: v.fonts.mono, fontSize:12, color:T.muted2 }}>0123456789</span>
    </div>
  </div>
);

/* ─── Artboard content: specimen + home sample ─── */
const VariantBoard = ({ v }) => (
  <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
    <Specimen v={v} />
    <div style={{ flex:1, minHeight:0 }}>
      <HomeSample font={v.fonts} />
    </div>
  </div>
);

/* ─── App ─── */
function FontCompareApp() {
  return (
    <DesignCanvas title="StudyConnect · 字体方案对比" subtitle="同一首页样张，4 种中英文搭配方案">
      <DCSection id="home" title="首页 · 字体对比">
        {VARIANTS.map(v => (
          <DCArtboard key={v.id} id={`home-${v.id}`} label={v.name} width={780} height={1100}>
            <VariantBoard v={v} />
          </DCArtboard>
        ))}
      </DCSection>
    </DesignCanvas>
  );
}

window.FontCompareApp = FontCompareApp;
