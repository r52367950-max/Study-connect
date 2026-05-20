/* Direction B — full multi-page prototype
   Pages: Home · 排行榜 · 我的收藏 · 学科页 · 年级页
*/

/* ── Subject glyphs ─────────────────────────────── */
const _g = { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.5, strokeLinecap:'round', strokeLinejoin:'round' };

// 语文 — 「文」字形：横、点、撇捺
const G_chinese = p => <svg {..._g} {...p}>
  <circle cx="12" cy="4.6" r="0.85" fill="currentColor" stroke="none"/>
  <path d="M5 8.5h14"/>
  <path d="M11 9.5l-4.5 11"/>
  <path d="M13 9.5l4.5 11"/>
</svg>;

// 数学 — π
const G_math = p => <svg {..._g} {...p}>
  <path d="M4 8.5h16"/>
  <path d="M8.5 9v9c0 .9.6 1.5 1.6 1.5"/>
  <path d="M15.5 9v8.8c0 1.1.7 1.7 1.9 1.7H19"/>
</svg>;

// 英语 — Aa (上 A 下 a 太挤；改作 A 与小 a 并列)
const G_english = p => <svg {..._g} {...p}>
  <path d="M3 19.5L8 5l5 14.5"/>
  <path d="M5 15h6"/>
  <circle cx="17.5" cy="14.5" r="3.2"/>
  <path d="M20.7 11.3v6.4"/>
</svg>;

// 物理 — 原子（两椭圆 + 核）
const G_physics = p => <svg {..._g} {...p}>
  <ellipse cx="12" cy="12" rx="8.5" ry="3.2" transform="rotate(-30 12 12)"/>
  <ellipse cx="12" cy="12" rx="8.5" ry="3.2" transform="rotate(30 12 12)"/>
  <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>
</svg>;

// 化学 — 锥形瓶
const G_chem = p => <svg {..._g} {...p}>
  <path d="M9.5 3.5h5"/>
  <path d="M10.2 3.5v5.4l-5.3 10.4c-.45.88.19 1.95 1.18 1.95h11.84c.99 0 1.63-1.07 1.18-1.95l-5.3-10.4V3.5"/>
  <path d="M7.6 15.5h8.8"/>
</svg>;

// 生物 — 叶片 + 叶脉
const G_bio = p => <svg {..._g} {...p}>
  <path d="M4 20C4 11.2 10.4 4.5 20 4.5c0 9.6-6.4 16-15.5 16z"/>
  <path d="M4.5 19.5L16 8"/>
</svg>;

// 历史 — 古典立柱
const G_history = p => <svg {..._g} {...p}>
  <path d="M4.5 5.5h15"/>
  <path d="M5.2 7.2h13.6"/>
  <path d="M7.5 7.2v10.6"/>
  <path d="M12 7.2v10.6"/>
  <path d="M16.5 7.2v10.6"/>
  <path d="M4.2 17.8h15.6"/>
  <path d="M3.5 19.5h17"/>
</svg>;

// 地理 — 地球（经线 + 赤道）
const G_geo = p => <svg {..._g} {...p}>
  <circle cx="12" cy="12" r="8.5"/>
  <ellipse cx="12" cy="12" rx="3.5" ry="8.5"/>
  <path d="M3.5 12h17"/>
</svg>;

// 政治 — 天平
const G_politics = p => <svg {..._g} {...p}>
  <path d="M12 4.5v15"/>
  <path d="M6.5 19.5h11"/>
  <path d="M3.5 8h17"/>
  <path d="M7 8l-3 5.5h6z"/>
  <path d="M17 8l-3 5.5h6z"/>
  <path d="M12 4.5l-2 1.4M12 4.5l2 1.4" strokeWidth="1.2"/>
</svg>;

const GLYPHS = { '语文':G_chinese,'数学':G_math,'英语':G_english,'物理':G_physics,'化学':G_chem,'生物':G_bio,'历史':G_history,'地理':G_geo,'政治':G_politics };

const SubjectIcon = ({ name, size = 36, iconSize }) => {
  const c = SUBJECT_COLORS[name] || { bg: T.fill, fg: T.ink };
  const Glyph = GLYPHS[name] || G_math;
  const ic = iconSize || Math.round(size * 0.56);
  return (
    <div style={{
      width:size, height:size, borderRadius: Math.round(size*0.26),
      background: c.bg, color: c.fg,
      display:'flex', alignItems:'center', justifyContent:'center',
      flexShrink:0,
    }}>
      <Glyph width={ic} height={ic} />
    </div>
  );
};

/* ── Shared tiny helpers ─────────────────────────── */
const Dot = () => <span style={{ width:2,height:2,borderRadius:'50%',background:'#C0C0C0',display:'inline-block',flexShrink:0 }} />;

const KindTag = ({ kind }) => {
  // 莫兰迪色系 · 低饱和度
  const map = { '习题':'#E1E6EC', '讲义':'#E4E8DD', '真题':'#EBE0D5', '模拟':'#E2DCE2' };
  const tc  = { '习题':'#5E6B7A', '讲义':'#6A7259', '真题':'#7C6A57', '模拟':'#71636B' };
  return (
    <span style={{
      padding:'2px 8px', borderRadius:3, fontSize:10.5,
      background: map[kind]||T.fill, color: tc[kind]||T.muted,
      fontWeight:500, letterSpacing:0,
    }}>{kind}</span>
  );
};

const FileRow = ({ m, rank, reason }) => {
  const { isMobile, isTablet } = useViewport();
  return (
    <div style={{
      display:'flex', alignItems:'center', gap: isMobile ? 11 : 14,
      padding: isMobile ? '12px 2px' : '13px 4px', borderBottom:`1px solid ${T.line2}`,
      cursor:'pointer',
    }}>
      {rank != null && !isMobile && (
        <span style={{
          width:22, textAlign:'right', flexShrink:0,
          fontFamily:mono, fontSize:12,
          color: rank < 3 ? T.ink : T.muted2,
          fontWeight: rank < 3 ? 600 : 400,
        }}>{String(rank+1).padStart(2,'0')}</span>
      )}
      <SubjectIcon name={m.subject} size={isMobile ? 32 : 34} iconSize={isMobile ? 16 : 17} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize: isMobile ? 13 : 13.5, fontWeight:500, marginBottom:4, letterSpacing:'-0.012em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.title}</div>
        <div style={{ display:'flex', gap: isMobile ? 6 : 8, alignItems:'center', fontSize: isMobile ? 11 : 11.5, color:T.muted, whiteSpace:'nowrap', overflow:'hidden' }}>
          <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis' }}>{m.subject} · {isMobile ? m.grade : `${m.stage} · ${m.grade}`}</span>
          <Dot /><KindTag kind={m.kind} />
          {!isMobile && (reason
            ? (<><Dot /><span style={{ padding:'1px 7px', background:'#EAE5DE', color:'#7A6F5F', borderRadius:3, fontSize:10.5, letterSpacing:0 }}>{reason}</span></>)
            : (<><Dot /><span style={{ fontFamily:mono }}>{m.who}</span></>))}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'baseline', fontFamily:mono, fontSize:11.5, color:T.muted, flexShrink:0 }}>
        <span style={{ width: isMobile ? 50 : 62, textAlign:'right', color:T.ink }}>★ {m.score.toFixed(1)}</span>
        {!isMobile && <span style={{ width: 80, textAlign:'right', color:T.ink2 }}>↓ {m.dl.toLocaleString()}</span>}
        {!isMobile && !isTablet && <span style={{ width: 64, textAlign:'right', color:T.muted2 }}>{m.size}</span>}
      </div>
    </div>
  );
};

const SectionLabel = ({ children }) => (
  <div style={{ fontSize:10, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.12em', padding:'20px 10px 8px', fontWeight:500 }}>{children}</div>
);
const NavItem = ({ label, Icon, active, onClick }) => (
  <a onClick={onClick} style={{
    display:'flex', alignItems:'center', gap:10, padding:'7px 10px', fontSize:13,
    color: active ? T.ink : T.ink2, borderRadius:5, cursor:'pointer',
    background: active ? '#fff' : 'transparent',
    boxShadow: active ? `0 0 0 1px ${T.line}` : 'none',
    fontWeight: active ? 500 : 400, userSelect:'none', letterSpacing:'-0.005em',
  }}>
    <Icon /><span>{label}</span>
  </a>
);
const Caret = ({ open }) => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ color:T.muted2, flexShrink:0, transform:open?'rotate(90deg)':'none', transition:'transform 130ms ease' }}>
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const _ico = { width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round',strokeLinejoin:'round' };
const M_home   = () => <svg {..._ico}><path d="M2.5 7l5.5-4.5L13.5 7v6.5h-3v-4h-5v4h-3z"/></svg>;
const M_trophy = () => <svg {..._ico}><path d="M5 2.5h6v4a3 3 0 0 1-6 0z"/><path d="M5 4.5H3.5v.5a1.5 1.5 0 0 0 1.5 1.5"/><path d="M11 4.5h1.5v.5A1.5 1.5 0 0 1 11 6.5"/><path d="M8 9.5v3"/><path d="M5.5 13.5h5"/></svg>;
const M_star   = () => <svg {..._ico}><path d="M8 2l1.8 3.8L14 6.4l-3 3 .8 4.2L8 11.7 4.2 13.6 5 9.4l-3-3 4.2-.6z"/></svg>;
const M_search = () => <svg {..._ico}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l2.5 2.5"/></svg>;
const ChevronRight = () => <svg {..._ico} style={{ color:T.muted2 }}><path d="M6 4l4 4-4 4"/></svg>;

const btnOutline = { height:30, padding:'0 12px', background:'transparent', color:T.ink2, border:`1px solid ${T.line}`, borderRadius:7, fontSize:12.5, fontFamily:sans, cursor:'pointer', display:'flex', alignItems:'center', gap:6, letterSpacing:'-0.005em' };
const btnPrimary = { height:30, padding:'0 14px', background:T.ink, color:T.bg, border:'none', borderRadius:7, fontSize:12.5, fontWeight:500, fontFamily:sans, cursor:'pointer', letterSpacing:'-0.005em' };

/* ── SUBJECT TABS ─────────────────────────────────── */
const TabBar = ({ tabs, active, onChange }) => (
  <div style={{ display:'flex', gap:2, borderBottom:`1px solid ${T.line}`, marginBottom:0 }}>
    {tabs.map(([l, n]) => (
      <button key={l} onClick={() => onChange(l)} style={{
        padding:'9px 14px', background:'none', border:'none', fontFamily:sans,
        fontSize:13, color: active===l ? T.ink : T.muted,
        fontWeight: active===l ? 500 : 400,
        borderBottom: active===l ? `2px solid ${T.ink}` : '2px solid transparent',
        marginBottom:-1, cursor:'pointer',
        display:'flex', alignItems:'center', gap:6,
      }}>
        {l}
        {n != null && <span style={{ fontFamily:mono, fontSize:11, color:T.muted2 }}>{n}</span>}
      </button>
    ))}
  </div>
);

/* ══════════════════════════════════════════════════
   PAGE: HOME
   ══════════════════════════════════════════════════ */
const PageHome = ({ goSubject, goGrade, onDemo }) => {
  const user = React.useContext(UserCtx);
  const { isMobile, isTablet } = useViewport();
  const pad = isMobile ? '24px 18px 60px' : '34px 36px 60px';
  const subjectCols = isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(3,1fr)';
  const subjects = [
    { name:'语文',n:312 },{ name:'数学',n:487 },{ name:'英语',n:401 },
    { name:'物理',n:198 },{ name:'化学',n:156 },{ name:'生物',n:142 },
    { name:'历史',n:98  },{ name:'地理',n:87  },{ name:'政治',n:76  },
  ];
  const recentOpened = [
    { title:'2024 高考数学全国卷 II 完整解析', subject:'数学', stage:'高三', when:'今天',  kind:'真题' },
    { title:'高二英语完形填空专项 200 题',     subject:'英语', stage:'高二', when:'昨天',  kind:'习题' },
    { title:'初三物理 · 力学综合复习讲义',     subject:'物理', stage:'初三', when:'3天前', kind:'讲义' },
  ];
  const recommended = recommend(user, SAMPLE, 6);

  return (
    <div style={{ padding: pad }}>
      {/* greeting */}
      <div style={{ marginBottom:32 }}>
        <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight:500, margin:0, letterSpacing:'-0.025em', color:T.ink, lineHeight:1.15 }}>
          下午好，<span style={{ fontWeight:600 }}>{user.name || (user.role==='student' ? '同学' : '老师')}</span>
        </h1>
        <p style={{ fontSize:13, color:T.muted, margin:'10px 0 0', letterSpacing:'-0.005em' }}>
          {(() => {
            const fav = SAMPLE.filter(m=>m.saved).length;
            const subj = user.subjects?.[0];
            return user.role==='student'
              ? (subj ? <>为你推荐了 <span style={{ fontFamily:mono, color:T.ink, fontWeight:500 }}>{subj}</span> 相关的新资料</> : <>为你推荐了新的习题和讲义</>)
              : <>已收藏 <span style={{ fontFamily:mono, color:T.ink, fontWeight:500 }}>{fav}</span> 份资料 · <span style={{ fontFamily:mono, color:T.ink, fontWeight:500 }}>{subj||'多学科'}</span> 今日上新4份</>;
          })()}
        </p>
      </div>

      {/* 最近下载 */}
      <SectionHeader title="最近下载" action="查看全部" />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12, marginBottom:36 }}>
        {recentOpened.map((r,i) => (
          <div key={i} style={{ padding:'15px 16px 13px', border:`1px solid ${T.line}`, borderRadius:10, background:T.bg, cursor:'pointer', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
              <SubjectIcon name={r.subject} size={38} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:500, lineHeight:1.4, letterSpacing:'-0.012em', marginBottom:3 }}>{r.title}</div>
                <div style={{ fontSize:11.5, color:T.muted }}>{r.subject} · {r.stage}</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:10, borderTop:`1px solid ${T.line2}`, fontSize:11.5, color:T.muted }}>
              <KindTag kind={r.kind} />
              <span style={{ flex:1 }} />
              <span style={{ fontFamily:mono, color:T.muted2 }}>{r.when}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 按学科浏览 */}
      <SectionHeader title="按学科浏览" action="查看全部" />
      <div style={{ display:'grid', gridTemplateColumns: subjectCols, border:`1px solid ${T.line}`, borderRadius:10, overflow:'hidden', marginBottom:36, background:T.bg }}>
        {subjects.map((s,i) => {
          const colsN = isMobile || isTablet ? 2 : 3;
          const col = i%colsN, row = Math.floor(i/colsN), rows = Math.ceil(subjects.length/colsN);
          return (
            <div key={s.name} onClick={() => goSubject(s.name)} style={{
              padding:'14px 18px',
              borderRight: col<colsN-1 ? `1px solid ${T.line2}` : 'none',
              borderBottom: row<rows-1 ? `1px solid ${T.line2}` : 'none',
              cursor:'pointer', display:'flex', alignItems:'center', gap:14,
            }}>
              <SubjectIcon name={s.name} size={36} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13.5, fontWeight:500, letterSpacing:'-0.012em' }}>{s.name}</div>
                <div style={{ fontSize:11, color:T.muted, fontFamily:mono, marginTop:2 }}>{s.n} 份</div>
              </div>
              <ChevronRight />
            </div>
          );
        })}
      </div>

      {/* 为您推荐 */}
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
          <h2 style={{ fontSize:14, fontWeight:600, margin:0, letterSpacing:'-0.015em' }}>为您推荐</h2>
          <span style={{ fontSize:11, color:T.muted, padding:'2px 8px', border:`1px solid ${T.line}`, borderRadius:20, fontFamily:mono, display:'inline-flex', alignItems:'center', gap:5 }}>
            <span style={{ width:4,height:4,borderRadius:'50%',background:'#90A07A' }} />
            {recoChipText(user)}
          </span>
        </div>
        <a onClick={() => onDemo && onDemo('换一批')} style={{ fontSize:12, color:T.muted, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4 }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 8a6 6 0 1 1-1.5-4M14 3v3h-3"/></svg>
          换一批
        </a>
      </div>
      {recommended.map((m, idx) => <FileRow key={m.id} m={m} rank={idx} reason={m._reason} />)}
    </div>
  );
};

/* ══════════════════════════════════════════════════
   PAGE: 排行榜
   ══════════════════════════════════════════════════ */
const PageRank = () => {
  const [tab, setTab] = React.useState('下载榜');
  const { isMobile } = useViewport();
  const pad = isMobile ? '24px 18px 60px' : '34px 36px 60px';
  const sorted = tab === '下载榜'
    ? [...SAMPLE].sort((a,b) => b.dl - a.dl)
    : [...SAMPLE].sort((a,b) => b.score - a.score);

  return (
    <div style={{ padding: pad }}>
      <h1 style={{ fontSize: isMobile ? 20 : 22, fontWeight:600, margin:'0 0 4px', letterSpacing:'-0.025em' }}>排行榜</h1>
      <p style={{ fontSize:13, color:T.muted, margin:'0 0 24px' }}>全平台资料综合热度排名</p>

      <TabBar tabs={[['下载榜',null],['评分榜',null]]} active={tab} onChange={setTab} />

      {/* top 3 podium */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:12, padding:'20px 0 4px' }}>
        {[sorted[1], sorted[0], sorted[2]].map((m,i) => {
          const rank = [2,1,3][i];
          const isTop = rank===1;
          return (
            <div key={m.id} style={{
              padding:'18px 18px 16px',
              border:`1px solid ${isTop ? T.ink : T.line}`,
              borderRadius:10, background: isTop ? T.ink : T.bg,
              color: isTop ? T.bg : T.ink,
              display:'flex', flexDirection:'column', gap:10,
              marginTop: isMobile ? 0 : (isTop ? 0 : 16),
            }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontFamily:mono, fontSize:28, fontWeight:700, lineHeight:1, opacity: isTop?1:0.5 }}>
                  {String(rank).padStart(2,'0')}
                </span>
                {isTop
                  ? <div style={{ width:34,height:34,borderRadius:8,background:'rgba(255,255,255,0.10)',display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.92)' }}>
                      {React.createElement(GLYPHS[m.subject]||G_math, { width:19,height:19 })}
                    </div>
                  : <SubjectIcon name={m.subject} size={34} iconSize={18} />}
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:500, lineHeight:1.4, letterSpacing:'-0.012em', marginBottom:5 }}>{m.title}</div>
                <div style={{ fontSize:11.5, opacity:0.6 }}>{m.subject} · {m.grade}</div>
              </div>
              <div style={{ display:'flex', gap:14, fontFamily:mono, fontSize:11.5, opacity:0.75, marginTop:2 }}>
                <span>↓ {m.dl.toLocaleString()}</span>
                <span>★ {m.score.toFixed(1)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* rest of list */}
      <div style={{ marginTop:12 }}>
        {sorted.slice(3).map((m, idx) => <FileRow key={m.id} m={m} rank={idx+3} />)}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════
   PAGE: 我的收藏 — 3 layout variants
   ══════════════════════════════════════════════════ */
const KIND_META = {
  '习题': { dot:'#8A99AD', soft:'#E1E6EC' },
  '讲义': { dot:'#90A07A', soft:'#E4E8DD' },
  '真题': { dot:'#B59A7E', soft:'#EBE0D5' },
  '模拟': { dot:'#A28E9D', soft:'#E2DCE2' },
};

const FavVariantSwitch = ({ value, onChange }) => {
  const opts = [['tabs','顶部 Tab'],['grouped','分组列表'],['split','二级侧栏']];
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ fontSize:11, color:T.muted2, letterSpacing:'0.05em', textTransform:'uppercase' }}>布局方案</span>
      <div style={{ display:'flex', padding:2, background:T.fill, border:`1px solid ${T.line}`, borderRadius:8 }}>
        {opts.map(([k,l]) => (
          <button key={k} onClick={() => onChange(k)} style={{
            padding:'5px 11px', fontSize:12, fontFamily:sans,
            background: value===k ? T.bg : 'transparent',
            color: value===k ? T.ink : T.muted,
            border:'none', borderRadius:6, cursor:'pointer',
            boxShadow: value===k ? `0 0 0 1px ${T.line}, 0 1px 2px rgba(0,0,0,0.04)` : 'none',
            fontWeight: value===k ? 500 : 400, letterSpacing:'-0.005em',
          }}>{l}</button>
        ))}
      </div>
    </div>
  );
};

const FavHeader = ({ variant, setVariant, saved }) => {
  const { isMobile } = useViewport();
  return (
    <div style={{ display:'flex', alignItems: isMobile ? 'flex-start' : 'flex-end', flexDirection: isMobile ? 'column' : 'row', justifyContent:'space-between', marginBottom:22, gap: isMobile ? 14 : 24 }}>
      <div>
        <h1 style={{ fontSize:22, fontWeight:600, margin:'0 0 4px', letterSpacing:'-0.025em' }}>我的收藏</h1>
        <p style={{ fontSize:13, color:T.muted, margin:0 }}>
          共收藏 <span style={{ fontFamily:mono, color:T.ink, fontWeight:500 }}>{saved.length}</span> 份资料
        </p>
      </div>
      {!isMobile && <FavVariantSwitch value={variant} onChange={setVariant} />}
    </div>
  );
};

/* — Variant A: 顶部 Tab + 平铺列表 — */
const FavTabs = ({ saved }) => {
  const [tab, setTab] = React.useState('全部');
  const kinds = ['习题','讲义','真题','模拟'];
  const counts = Object.fromEntries(kinds.map(k => [k, saved.filter(m=>m.kind===k).length]));
  const filtered = tab==='全部' ? saved : saved.filter(m=>m.kind===tab);
  return (
    <>
      <TabBar
        tabs={[['全部', saved.length], ...kinds.map(k => [k, counts[k]||0])]}
        active={tab} onChange={setTab}
      />
      <div style={{ marginTop:4 }}>
        {filtered.length===0
          ? <div style={{ padding:'48px 0', textAlign:'center', color:T.muted, fontSize:13 }}>暂无{tab}类收藏</div>
          : filtered.map(m => <FileRow key={m.id} m={m} />)}
      </div>
    </>
  );
};

/* — Variant B: 分组列表（可折叠 section） — */
const FavGrouped = ({ saved }) => {
  const kinds = ['习题','讲义','真题','模拟'];
  const [open, setOpen] = React.useState({ '习题':true,'讲义':true,'真题':true,'模拟':true });
  return (
    <div>
      {kinds.map(k => {
        const items = saved.filter(m => m.kind===k);
        if (items.length===0) return null;
        const isOpen = open[k];
        return (
          <div key={k} style={{ marginBottom: 22 }}>
            <div onClick={() => setOpen({...open, [k]: !isOpen})} style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'10px 0', cursor:'pointer',
              borderBottom:`1px solid ${T.line}`,
              userSelect:'none',
            }}>
              <Caret open={isOpen} />
              <span style={{ width:7, height:7, borderRadius:2, background:KIND_META[k].dot, flexShrink:0 }} />
              <span style={{ fontSize:13.5, fontWeight:600, letterSpacing:'-0.012em' }}>{k}</span>
              <span style={{ fontFamily:mono, fontSize:11.5, color:T.muted }}>{String(items.length).padStart(2,'0')}</span>
              <div style={{ flex:1 }} />
              <a style={{ fontSize:11.5, color:T.muted, cursor:'pointer' }}>查看全部 →</a>
            </div>
            {isOpen && <div>{items.map(m => <FileRow key={m.id} m={m} />)}</div>}
          </div>
        );
      })}
    </div>
  );
};

/* — Variant C: 二级侧栏 + 内容 — */
const FavSplit = ({ saved }) => {
  const [active, setActive] = React.useState('全部');
  const { isMobile, isTablet } = useViewport();
  const kinds = [
    { key:'全部', count: saved.length, dot:'#9CA3AF' },
    ...['习题','讲义','真题','模拟'].map(k => ({
      key:k, count: saved.filter(m=>m.kind===k).length, dot: KIND_META[k].dot,
    })),
  ];
  const filtered = active==='全部' ? saved : saved.filter(m=>m.kind===active);
  if (isMobile) {
    // On mobile fall back to tabbed view
    return (
      <>
        <TabBar
          tabs={kinds.map(k => [k.key, k.count])}
          active={active} onChange={setActive}
        />
        <div style={{ marginTop:4 }}>
          {filtered.length===0
            ? <div style={{ padding:'48px 0', textAlign:'center', color:T.muted, fontSize:13 }}>暂无{active}类收藏</div>
            : filtered.map(m => <FileRow key={m.id} m={m} />)}
        </div>
      </>
    );
  }
  return (
    <div style={{ display:'grid', gridTemplateColumns: isTablet ? '140px 1fr' : '172px 1fr', gap: isTablet ? 20 : 28, marginTop:4 }}>
      {/* mini sidebar */}
      <div style={{ display:'flex', flexDirection:'column', gap:2, alignSelf:'flex-start', position:'sticky', top:0 }}>
        {kinds.map(({ key, count, dot }) => {
          const isActive = active===key;
          return (
            <button key={key} onClick={() => setActive(key)} style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'8px 12px', fontFamily:sans, fontSize:13,
              background: isActive ? T.fill : 'transparent',
              color: isActive ? T.ink : T.ink2,
              border:'none', borderRadius:7, cursor:'pointer',
              fontWeight: isActive ? 500 : 400, textAlign:'left',
              boxShadow: isActive ? `inset 0 0 0 1px ${T.line}` : 'none',
              letterSpacing:'-0.005em',
            }}>
              <span style={{ width:7, height:7, borderRadius:2, background:dot, flexShrink:0 }} />
              <span style={{ flex:1 }}>{key}</span>
              <span style={{ fontFamily:mono, fontSize:11.5, color: isActive ? T.muted : T.muted2 }}>{count}</span>
            </button>
          );
        })}
      </div>
      {/* list */}
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:10.5, color:T.muted, fontFamily:mono, letterSpacing:'0.1em', textTransform:'uppercase', paddingBottom:9, borderBottom:`1px solid ${T.line2}`, marginBottom:2 }}>
          {active}&nbsp;·&nbsp;{filtered.length} 份
        </div>
        {filtered.length===0
          ? <div style={{ padding:'48px 0', textAlign:'center', color:T.muted, fontSize:13 }}>暂无{active}类收藏</div>
          : filtered.map(m => <FileRow key={m.id} m={m} />)}
      </div>
    </div>
  );
};

const PageFav = () => {
  const [variant, setVariant] = React.useState('grouped');
  const { isMobile } = useViewport();
  const saved = SAMPLE.filter(m => m.saved);
  return (
    <div style={{ padding: isMobile ? '24px 18px 60px' : '34px 36px 60px' }}>
      <FavHeader variant={variant} setVariant={setVariant} saved={saved} />
      {variant === 'tabs'    && <FavTabs    saved={saved} />}
      {variant === 'grouped' && <FavGrouped saved={saved} />}
      {variant === 'split'   && <FavSplit   saved={saved} />}
    </div>
  );
};

/* ══════════════════════════════════════════════════
   PAGE: 学科
   ══════════════════════════════════════════════════ */
const PageSubject = ({ subject }) => {
  const [tab, setTab] = React.useState('全部');
  const { isMobile } = useViewport();
  const all = SAMPLE.filter(m => m.subject === subject);
  const kinds = ['全部','习题','讲义','真题','模拟'];
  const counts = Object.fromEntries(kinds.slice(1).map(k => [k, all.filter(m=>m.kind===k).length]));
  const filtered = tab==='全部' ? all : all.filter(m => m.kind===tab);

  return (
    <div style={{ padding: isMobile ? '24px 18px 60px' : '34px 36px 60px' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
        <SubjectIcon name={subject} size={52} iconSize={28} />
        <div>
          <h1 style={{ fontSize:26, fontWeight:600, margin:'0 0 4px', letterSpacing:'-0.025em' }}>{subject}</h1>
          <p style={{ fontSize:13, color:T.muted, margin:0 }}>
            <span style={{ fontFamily:mono, color:T.ink, fontWeight:500 }}>{all.length}</span> 份资料
          </p>
        </div>
      </div>

      <TabBar
        tabs={[['全部', all.length], ...kinds.slice(1).map(k => [k, counts[k]||0])]}
        active={tab} onChange={setTab}
      />
      <div style={{ marginTop:4 }}>
        {filtered.length===0
          ? <div style={{ padding:'48px 0', textAlign:'center', color:T.muted, fontSize:13 }}>暂无{tab}类资料</div>
          : filtered.map(m => <FileRow key={m.id} m={m} />)
        }
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════
   PAGE: 学段 + 年级
   ══════════════════════════════════════════════════ */
const PageGrade = ({ stageKey, grade }) => {
  const [subjectFilter, setSubjectFilter] = React.useState('全部');
  const { isMobile } = useViewport();
  const all = SAMPLE.filter(m => m.stage===stageKey && m.grade===grade);
  const subjs = ['全部', ...new Set(all.map(m=>m.subject))];
  const filtered = subjectFilter==='全部' ? all : all.filter(m=>m.subject===subjectFilter);

  return (
    <div style={{ padding: isMobile ? '24px 18px 60px' : '34px 36px 60px' }}>
      <h1 style={{ fontSize:22, fontWeight:600, margin:'0 0 4px', letterSpacing:'-0.025em' }}>
        {grade}
        <span style={{ fontSize:14, fontWeight:400, color:T.muted, marginLeft:10 }}>{stageKey}</span>
      </h1>
      <p style={{ fontSize:13, color:T.muted, margin:'0 0 22px' }}>
        共 <span style={{ fontFamily:mono, color:T.ink, fontWeight:500 }}>{all.length}</span> 份资料
      </p>

      {/* subject filter chips */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:20 }}>
        {subjs.map(s => (
          <button key={s} onClick={() => setSubjectFilter(s)} style={{
            padding:'5px 12px', borderRadius:20,
            background: subjectFilter===s ? T.ink : 'transparent',
            color: subjectFilter===s ? T.bg : T.muted,
            border: subjectFilter===s ? 'none' : `1px solid ${T.line}`,
            fontSize:12.5, fontFamily:sans, cursor:'pointer',
            display:'flex', alignItems:'center', gap:6,
          }}>
            {s !== '全部' && (
              <span style={{ display:'inline-flex', alignItems:'center', opacity: subjectFilter===s?0.7:1 }}>
                {React.createElement(GLYPHS[s]||G_math, { width:12, height:12, stroke: subjectFilter===s?'#fff':T.muted })}
              </span>
            )}
            {s}
          </button>
        ))}
      </div>

      {filtered.length===0
        ? <div style={{ padding:'48px 0', textAlign:'center', color:T.muted, fontSize:13 }}>暂无相关资料</div>
        : filtered.map(m => <FileRow key={m.id} m={m} />)
      }
    </div>
  );
};

/* ══════════════════════════════════════════════════
   SECTION HEADER (inline)
   ══════════════════════════════════════════════════ */
const SectionHeader = ({ title, action }) => (
  <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:14 }}>
    <h2 style={{ fontSize:14, fontWeight:600, margin:0, letterSpacing:'-0.015em' }}>{title}</h2>
    <a style={{ fontSize:12, color:T.muted, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:3 }}>
      {action}<span style={{ fontFamily:mono, color:T.muted2 }}>→</span>
    </a>
  </div>
);

/* ══════════════════════════════════════════════════
   ROOT
   ══════════════════════════════════════════════════ */
function DirB() {
  const user = React.useContext(UserCtx);
  const { isMobile, isTablet } = useViewport();
  const [nav, setNav]         = React.useState('home');
  const [openStage, setOpenStage] = React.useState((user.stages && user.stages[0]) || '高中');
  const [toast, setToast]     = React.useState(null);
  const showDemoToast = (label) => {
    setToast(`${label}：演示模式下未实现`);
    clearTimeout(window.__scToast);
    window.__scToast = setTimeout(() => setToast(null), 2200);
  };
  const [subject, setSubject] = React.useState(null);
  const [grade, setGrade]     = React.useState(null);
  const [collapsedDesktop, setCollapsedDesktop] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Effective sidebar state based on viewport
  const collapsed = isMobile ? false : (isTablet ? true : collapsedDesktop);
  const setCollapsed = (v) => { if (!isMobile && !isTablet) setCollapsedDesktop(v); };

  const goSubject = s  => { setSubject(s); setGrade(null); setNav(null); setMobileOpen(false); };
  const goGrade   = (sk,g) => { setGrade({ stage:sk, grade:g }); setSubject(null); setNav(null); setMobileOpen(false); };
  const goNav     = n  => { setNav(n); setSubject(null); setGrade(null); setMobileOpen(false); };

  const stages = [
    { key:'高中',         grades:['高一','高二','高三'] },
    { key:'初中',         grades:['初一','初二','初三'] },
    { key:'初中（五四制）', grades:['六年级','七年级','八年级','九年级'] },
  ];

  /* breadcrumb */
  let crumb = '首页';
  if (nav==='rank')  crumb = '排行榜';
  if (nav==='fav')   crumb = '我的收藏';
  if (subject)       crumb = subject;
  if (grade)         crumb = `${grade.stage} · ${grade.grade}`;

  const SW = isMobile ? 0 : (collapsed ? 64 : 252);
  const ToggleBtn = ({ collapsed: c }) => (
    <button onClick={() => setCollapsed(!c)} title={c?'展开侧边栏':'收起侧边栏'} style={{
      width:24,height:24,padding:0,display:'flex',alignItems:'center',justifyContent:'center',
      background:'transparent',border:`1px solid transparent`,borderRadius:6,cursor:'pointer',color:T.muted2,
      transition:'background 120ms, color 120ms',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = T.fill; e.currentTarget.style.color = T.ink2; e.currentTarget.style.borderColor = T.line; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.muted2; e.currentTarget.style.borderColor = 'transparent'; }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {c
          ? <path d="M6 4l4 4-4 4"/>
          : <path d="M10 4L6 8l4 4"/>}
      </svg>
    </button>
  );

  // Brand mark — Dandelion
  const SLogo = ({ size = 26 }) => <DandelionMark size={size} bg={T.ink} color="#FFFFFF" />;

  const sidebarContent = collapsed ? (
    /* ─── COLLAPSED ─── */
    <>
      <div style={{ padding:'18px 0 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        <SLogo size={30} />
        {!isTablet && <ToggleBtn collapsed />}
      </div>
      <div style={{ height:1, background:T.line2, margin:'2px 12px 10px' }} />
      <nav style={{ padding:'0 12px', flex:1, display:'flex', flexDirection:'column', gap:4, alignItems:'center' }}>
        {[
          ['首页',   M_home,   nav==='home' && !subject && !grade, () => goNav('home')],
          ['排行榜', M_trophy, nav==='rank' && !subject && !grade, () => goNav('rank')],
          ['我的收藏', M_star,  nav==='fav'  && !subject && !grade, () => goNav('fav') ],
          ['搜索',   M_search, false, () => !isTablet && setCollapsed(false)],
        ].map(([l, Icon, active, onClick]) => (
          <button key={l} title={l} onClick={onClick} style={{
            width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',
            background: active ? T.bg : 'transparent',
            border: active ? `1px solid ${T.line}` : `1px solid transparent`,
            borderRadius:8, cursor:'pointer',
            color: active ? T.ink : T.muted, padding:0,
          }}>
            <Icon />
          </button>
        ))}
      </nav>
      <div style={{ padding:'10px 0 14px', display:'flex', justifyContent:'center' }}>
        <div title={user.name||'老师'} style={{ width:32,height:32,borderRadius:'50%',background:'linear-gradient(145deg,#1a1a1a 0%,#555 100%)',color:'#fff',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>{(user.name||'我')[0]}</div>
      </div>
    </>
  ) : (
    /* ─── EXPANDED ─── */
    <>
      <div style={{ padding:'22px 14px 14px 18px', display:'flex', alignItems:'center', gap:10 }}>
        <SLogo size={28} />
        <span style={{ fontSize:14.5,fontWeight:600,letterSpacing:'-0.025em',color:T.ink, flex:1 }}>StudyConnect</span>
        {isMobile
          ? <button onClick={() => setMobileOpen(false)} style={{ width:28,height:28,padding:0,display:'flex',alignItems:'center',justifyContent:'center',background:'transparent',border:`1px solid ${T.line}`,borderRadius:6,cursor:'pointer',color:T.muted }} aria-label="关闭"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
          : <ToggleBtn collapsed={false} />}
      </div>

      <div style={{ padding:'0 12px 14px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:8,height:32,padding:'0 10px',background:T.bg,border:`1px solid ${T.line}`,borderRadius:7,color:T.muted,fontSize:12,cursor:'text' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l2.5 2.5"/></svg>
          <span style={{ flex:1,color:T.muted2 }}>搜索资料…</span>
          {!isMobile && <kbd style={{ fontFamily:mono,fontSize:10,color:T.muted2,padding:'1px 5px',border:`1px solid ${T.line}`,borderRadius:3 }}>⌘K</kbd>}
        </div>
      </div>

      <nav style={{ padding:'0 8px', flex:1, overflowY:'auto' }}>
        <NavItem label="首页"    Icon={M_home}   active={nav==='home'   && !subject && !grade} onClick={() => goNav('home')} />
        <NavItem label="排行榜"  Icon={M_trophy} active={nav==='rank'   && !subject && !grade} onClick={() => goNav('rank')} />
        <NavItem label="我的收藏" Icon={M_star}   active={nav==='fav'    && !subject && !grade} onClick={() => goNav('fav')}  />

        <SectionLabel>学段</SectionLabel>
        {stages.map(s => {
          const open = openStage === s.key;
          return (
            <div key={s.key}>
              <a onClick={() => setOpenStage(open ? null : s.key)} style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 10px',fontSize:13,color:open?T.ink:T.ink2,borderRadius:5,cursor:'pointer',fontWeight:open?500:400,userSelect:'none' }}>
                <Caret open={open} />
                <span style={{ flex:1 }}>{s.key}</span>
              </a>
              {open && (
                <div style={{ marginLeft:19,marginBottom:6,paddingLeft:9,borderLeft:`1.5px solid ${T.line}` }}>
                  {s.grades.map(g => {
                    const isActive = grade?.stage===s.key && grade?.grade===g;
                    return (
                      <a key={g} onClick={() => goGrade(s.key,g)} style={{ display:'block',padding:'5px 10px',fontSize:12.5,color:isActive?T.ink:T.muted,borderRadius:4,cursor:'pointer',background:isActive?'#fff':'transparent',boxShadow:isActive?`0 0 0 1px ${T.line}`:'none',fontWeight:isActive?500:400,letterSpacing:'-0.005em' }}>{g}</a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div style={{ margin:'8px 10px 12px',padding:'9px 10px',background:T.bg,border:`1px solid ${T.line}`,borderRadius:9,display:'flex',alignItems:'center',gap:10,cursor:'pointer' }}>
        <div style={{ width:30,height:30,borderRadius:'50%',background:'linear-gradient(145deg,#1a1a1a 0%,#555 100%)',color:'#fff',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>{(user.name||'我')[0]}</div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:13,fontWeight:500,color:T.ink,letterSpacing:'-0.01em' }}>{user.name||'老师'}</div>
          <div style={{ fontSize:11,color:T.muted,marginTop:1 }}>{formatUserTitle(user)}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color:T.muted2,flexShrink:0 }}>
          <circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="13" cy="8" r="1" fill="currentColor"/>
        </svg>
      </div>
    </>
  );

  return (
    <div style={{ background:T.bg, color:T.ink, fontFamily:sans, letterSpacing:'-0.011em', minHeight:'100%', display:'grid', gridTemplateColumns:`${SW}px 1fr`, transition:'grid-template-columns 200ms ease' }}>

      {/* ── SIDEBAR (desktop / tablet, inline) ── */}
      {!isMobile && (
        <aside style={{ borderRight:`1px solid ${T.line}`, display:'flex', flexDirection:'column', background:'#FAFAF9', minHeight:'100%', overflow:'hidden' }}>
          {sidebarContent}
        </aside>
      )}

      {/* ── SIDEBAR (mobile drawer) ── */}
      {isMobile && mobileOpen && (
        <>
          <div onClick={() => setMobileOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.32)', zIndex:90, animation:'sc-fade 180ms ease' }} />
          <aside style={{ position:'fixed', top:0, left:0, bottom:0, width:280, background:'#FAFAF9', borderRight:`1px solid ${T.line}`, display:'flex', flexDirection:'column', zIndex:91, animation:'sc-slide-r 220ms cubic-bezier(0.2,0.7,0.2,1) both' }}>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* ── MAIN ── */}
      <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* topbar */}
        <div style={{ height:54,borderBottom:`1px solid ${T.line}`,display:'flex',alignItems:'center',padding: isMobile ? '0 14px' : '0 30px', gap: isMobile ? 8 : 10, background:T.bg }}>
          {isMobile && (
            <button onClick={() => setMobileOpen(true)} style={{ width:34,height:34,padding:0,display:'flex',alignItems:'center',justifyContent:'center',background:'transparent',border:`1px solid ${T.line}`,borderRadius:7,cursor:'pointer',color:T.ink2,flexShrink:0 }} aria-label="菜单">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>
            </button>
          )}
          {/* breadcrumb */}
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:T.muted, minWidth:0, overflow:'hidden' }}>
            {(subject || grade) && !isMobile && (
              <>
                <a onClick={() => goNav('home')} style={{ cursor:'pointer', color:T.muted }}>首页</a>
                <span style={{ color:T.line }}>›</span>
              </>
            )}
            <span style={{ fontWeight:500, color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{crumb}</span>
          </div>
          <div style={{ flex:1 }} />
          {user.role === 'student' ? (
            <button style={btnPrimary} onClick={() => showDemoToast('开始练习')}>开始练习</button>
          ) : (
            <>
              {!isMobile && (
                <button style={btnOutline} onClick={() => showDemoToast('新建组卷')}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2v12M2 8h12"/></svg>
                  新建组卷
                </button>
              )}
              <button style={btnPrimary} onClick={() => showDemoToast('上传资料')}>上传资料</button>
            </>
          )}
        </div>

        {/* page content */}
        <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
          {nav==='home'  && !subject && !grade && <PageHome goSubject={goSubject} goGrade={goGrade} onDemo={showDemoToast} />}
          {nav==='rank'  && !subject && !grade && <PageRank />}
          {nav==='fav'   && !subject && !grade && <PageFav  />}
          {subject && <PageSubject subject={subject} />}
          {grade   && <PageGrade stageKey={grade.stage} grade={grade.grade} />}
        </div>
      </div>

      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:T.ink, color:T.bg, padding:'10px 18px', borderRadius:8, fontSize:12.5, fontFamily:sans, letterSpacing:'-0.005em', boxShadow:'0 6px 20px rgba(0,0,0,0.18)', zIndex:120, animation:'sc-rise 220ms cubic-bezier(0.2,0.7,0.2,1) both' }}>{toast}</div>
      )}
    </div>
  );
}

window.DirB = DirB;
