/* ════════════════════════════════════════════════════
   StudyConnect — Brand System Explorer
   Sections:  色彩 ·  花卉视觉  ·  应用场景
   ════════════════════════════════════════════════════ */

const sans  = '"Inter Tight","Noto Sans SC",-apple-system,"PingFang SC",sans-serif';
const serif = '"Instrument Serif","Noto Serif SC",Georgia,serif';
const mono  = '"JetBrains Mono",ui-monospace,Menlo,monospace';

/* ─── Dandelion mark (re-used) ─── */
const Dandelion = ({ size = 28, bg = '#163E2F', color = '#F4EFE5' }) => {
  const seeds = 14, cx = 16, cy = 16, inner = 4.5, outer = 12, tip = 13.5;
  return (
    <div style={{ width:size, height:size, borderRadius: Math.round(size*0.28), background:bg, color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
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

/* ════════════════════════════════════════════════════
   1 · COLOR PALETTES
   3 candidates — same DNA (墨绿+浅灰+陶瓷), different ratios.
   ════════════════════════════════════════════════════ */
const PALETTES = [
  {
    id: 'forest',
    name: 'Forest Ink',
    cn: '墨绿主导',
    note: '深森林绿为骨，陶瓷暖白做底。最沉稳、最像「书房」。',
    tokens: {
      ink:     '#14392B', // 墨绿
      ink2:    '#2A4A3D',
      muted:   '#6B7A72',
      muted2:  '#8E9C92',
      accent:  '#C8D5C7', // 青瓷点缀
      surface: '#F4EFE5', // 陶瓷暖白
      page:    '#FAF8F2', // 浅灰背景
      line:    '#E0DAC8',
      line2:   '#EBE6D8',
    },
  },
  {
    id: 'tea',
    name: 'Tea & Porcelain',
    cn: '陶瓷主导',
    note: '陶瓷面积最大，墨绿做点缀。最柔、最像「茶席」。',
    tokens: {
      ink:     '#1F3D33',
      ink2:    '#3A554A',
      muted:   '#7A8278',
      muted2:  '#9CA59B',
      accent:  '#D4C5B0', // 暖陶
      surface: '#F5F0E6',
      page:    '#FBF7EE',
      line:    '#E3DDD0',
      line2:   '#EEE9DC',
    },
  },
  {
    id: 'celadon',
    name: 'Celadon Ink',
    cn: '青瓷调和',
    note: '深绿 + 青瓷面 + 米白底，互补关系最强、最现代。',
    tokens: {
      ink:     '#0F362A',
      ink2:    '#2D4F40',
      muted:   '#6B7B72',
      muted2:  '#94A199',
      accent:  '#B9CFB3', // 青瓷
      surface: '#F1ECE2',
      page:    '#FAFAF5',
      line:    '#E5DFD2',
      line2:   '#EFE9DC',
    },
  },
];

/* ─── Palette card ─── */
const PaletteCard = ({ p }) => {
  const t = p.tokens;
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background: t.page, fontFamily: sans }}>
      {/* Header */}
      <div style={{ padding:'24px 28px 18px', borderBottom:`1px solid ${t.line2}`, background: t.surface }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
          <span style={{ fontFamily:mono, fontSize:11, color:t.muted, letterSpacing:'0.08em' }}>0{PALETTES.indexOf(p)+1}</span>
          <span style={{ height:1, width:18, background:t.line }} />
          <span style={{ fontFamily:mono, fontSize:11, color:t.muted2, letterSpacing:'0.12em', textTransform:'uppercase' }}>{p.cn}</span>
        </div>
        <h3 style={{ margin:0, fontFamily:serif, fontStyle:'italic', fontWeight:500, fontSize:36, letterSpacing:'-0.025em', color:t.ink, lineHeight:1, whiteSpace:'nowrap' }}>{p.name}</h3>
        <p style={{ fontSize:12.5, color:t.muted, margin:'10px 0 0', lineHeight:1.55, maxWidth:520 }}>{p.note}</p>
      </div>

      {/* Swatches */}
      <div style={{ padding:'22px 28px 6px', background: t.page }}>
        <div style={{ fontSize:10, fontFamily:mono, color:t.muted2, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12 }}>Tokens</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[
            ['ink','Ink · 墨绿', t.ink],
            ['accent','Accent · 点缀', t.accent],
            ['surface','Surface · 陶瓷', t.surface],
            ['ink2','Ink · 次级', t.ink2],
            ['muted','Muted', t.muted],
            ['line','Line', t.line],
          ].map(([k,label,hex]) => (
            <div key={k} style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ height:54, borderRadius:8, background:hex, border:`1px solid ${t.line}` }} />
              <div style={{ fontSize:11.5, color:t.ink, fontWeight:500 }}>{label}</div>
              <div style={{ fontFamily:mono, fontSize:10.5, color:t.muted2, letterSpacing:'0.02em' }}>{hex.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Applied UI sample */}
      <div style={{ flex:1, padding:'22px 28px 28px', minHeight:0, background: t.page }}>
        <div style={{ fontSize:10, fontFamily:mono, color:t.muted2, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12 }}>Sample</div>

        {/* greeting card */}
        <div style={{ padding:'20px 22px', background:t.surface, border:`1px solid ${t.line}`, borderRadius:12, marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:14 }}>
            <Dandelion size={30} bg={t.ink} color={t.surface} />
            <span style={{ fontSize:13.5, fontWeight:600, color:t.ink, letterSpacing:'-0.015em' }}>StudyConnect</span>
            <span style={{ flex:1 }} />
            <span style={{ fontSize:10.5, fontFamily:mono, color:t.muted, padding:'2px 8px', border:`1px solid ${t.line}`, borderRadius:20 }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:t.accent, display:'inline-block', marginRight:5, transform:'translateY(-1px)' }} />
              数学 · 高三
            </span>
          </div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:600, color:t.ink, letterSpacing:'-0.025em' }}>下午好，林老师</h2>
          <p style={{ margin:'8px 0 16px', fontSize:12.5, color:t.muted }}>已收藏 <span style={{ fontFamily:mono, color:t.ink, fontWeight:500 }}>7</span> 份资料 · 数学今日上新 <span style={{ fontFamily:mono, color:t.ink, fontWeight:500 }}>4</span> 份</p>
          <div style={{ display:'flex', gap:8 }}>
            <button style={{ height:32, padding:'0 14px', background:t.ink, color:t.surface, border:'none', borderRadius:7, fontFamily:sans, fontSize:12.5, fontWeight:500, letterSpacing:'-0.005em', cursor:'pointer' }}>上传资料</button>
            <button style={{ height:32, padding:'0 14px', background:'transparent', color:t.ink2, border:`1px solid ${t.line}`, borderRadius:7, fontFamily:sans, fontSize:12.5, cursor:'pointer' }}>新建组卷</button>
          </div>
        </div>

        {/* file row */}
        <div style={{ background:t.surface, border:`1px solid ${t.line}`, borderRadius:10, padding:'4px 14px' }}>
          {[
            ['2024 高考数学全国卷 II 完整解析','真题','★ 4.8'],
            ['高二英语完形填空专项 200 题','习题','★ 4.9'],
            ['初三物理 · 力学综合复习讲义','讲义','★ 4.6'],
          ].map(([title, kind, score], i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom: i<2 ? `1px solid ${t.line2}` : 'none' }}>
              <span style={{ width:18, fontFamily:mono, fontSize:11, color:t.muted2, textAlign:'right' }}>{String(i+1).padStart(2,'0')}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12.5, fontWeight:500, color:t.ink, letterSpacing:'-0.012em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{title}</div>
                <div style={{ fontSize:10.5, color:t.muted, marginTop:2 }}>
                  <span style={{ padding:'1px 6px', borderRadius:3, background:t.accent, color:t.ink2, fontWeight:500 }}>{kind}</span>
                </div>
              </div>
              <span style={{ fontFamily:mono, fontSize:11, color:t.ink2 }}>{score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════
   2 · FLORAL TILES
   ════════════════════════════════════════════════════ */
const FLORALS = [
  { id:'forest',    name:'Forest Bouquet',  cn:'墨绿丛',  seed:3,  petals:9, blur:32, palette: FLORAL_PALETTES.forest },
  { id:'celadon',   name:'Celadon Mist',    cn:'青瓷雾',  seed:5,  petals:8, blur:36, palette: FLORAL_PALETTES.celadon },
  { id:'twilight',  name:'Twilight Tulip',  cn:'暮色郁金香', seed:7,  petals:10, blur:30, palette: FLORAL_PALETTES.twilight },
  { id:'rose',      name:'Spring Rose',     cn:'春樱',    seed:11, petals:9, blur:30, palette: FLORAL_PALETTES.rose },
  { id:'inkDrift',  name:'Ink Drift',       cn:'墨流',    seed:13, petals:10, blur:34, palette: FLORAL_PALETTES.inkDrift, composition:'drift' },
  { id:'porcelain', name:'Porcelain Glaze', cn:'白瓷釉',  seed:17, petals:9, blur:36, palette: FLORAL_PALETTES.porcelain },
];

const FloralTile = ({ f }) => (
  <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'#fff', position:'relative' }}>
    <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
      <FloralBg colors={f.palette} seed={f.seed} petals={f.petals} blur={f.blur} composition={f.composition || 'bouquet'} />
    </div>
    <div style={{ padding:'14px 18px 16px', background:'#fff', borderTop:'1px solid #EFEBE0' }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:4 }}>
        <span style={{ fontFamily:mono, fontSize:10, color:'#9C9A8C', letterSpacing:'0.1em', textTransform:'uppercase' }}>{f.id}</span>
        <h4 style={{ margin:0, fontFamily:sans, fontSize:14, fontWeight:600, color:'#14392B', letterSpacing:'-0.015em' }}>{f.name}</h4>
        <span style={{ fontSize:11.5, color:'#6B7A72' }}>· {f.cn}</span>
      </div>
      <div style={{ display:'flex', gap:5, marginTop:8 }}>
        {f.palette.map(c => (
          <span key={c} title={c} style={{ width:18, height:18, borderRadius:4, background:c, border:'1px solid rgba(0,0,0,0.06)' }} />
        ))}
      </div>
    </div>
  </div>
);

/* ════════════════════════════════════════════════════
   3 · APPLIED IN CONTEXT
   ════════════════════════════════════════════════════ */

/* 3a · Login with floral background */
const LoginWithFloral = ({ floral, palette }) => (
  <div style={{ height:'100%', position:'relative', background: palette.surface, overflow:'hidden' }}>
    <div style={{ position:'absolute', inset:0, opacity:0.85 }}>
      <FloralBg colors={floral.palette} seed={floral.seed} petals={floral.petals} blur={floral.blur} />
    </div>
    {/* paper overlay */}
    <div style={{ position:'absolute', inset:0, background:`linear-gradient(180deg, ${palette.surface}AA 0%, ${palette.surface}99 50%, ${palette.surface}EE 100%)` }} />
    {/* content */}
    <div style={{ position:'relative', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 32px', fontFamily:sans }}>
      <Dandelion size={56} bg={palette.ink} color={palette.surface} />
      <span style={{ marginTop:12, fontSize:11, fontWeight:500, color:palette.muted, letterSpacing:'0.18em', textTransform:'uppercase' }}>StudyConnect</span>
      <h1 style={{ margin:'32px 0 8px', fontFamily:serif, fontStyle:'italic', fontWeight:500, fontSize:38, color:palette.ink, letterSpacing:'-0.025em', textAlign:'center' }}>欢迎回来</h1>
      <p style={{ margin:0, fontSize:13, color:palette.muted, textAlign:'center', maxWidth:280, lineHeight:1.6 }}>蒲公英 · 为每一个学子和老师，让好的资料随风落到对的人手里</p>

      <div style={{ width:'100%', maxWidth:300, marginTop:32, display:'flex', flexDirection:'column', gap:10 }}>
        <input placeholder="手机号" style={{ height:42, padding:'0 14px', background:palette.surface, border:`1px solid ${palette.line}`, borderRadius:9, fontSize:13, fontFamily:sans, outline:'none' }} />
        <input placeholder="密码" type="password" style={{ height:42, padding:'0 14px', background:palette.surface, border:`1px solid ${palette.line}`, borderRadius:9, fontSize:13, fontFamily:sans, outline:'none' }} />
        <button style={{ height:42, background:palette.ink, color:palette.surface, border:'none', borderRadius:9, fontSize:13, fontFamily:sans, fontWeight:500, cursor:'pointer', marginTop:6 }}>继续 →</button>
      </div>
    </div>
  </div>
);

/* 3b · Subject hero — 语文 with floral */
const SubjectHero = ({ palette }) => (
  <div style={{ height:'100%', fontFamily:sans, background:palette.page, display:'flex', flexDirection:'column' }}>
    {/* hero with floral bg */}
    <div style={{ position:'relative', height:240, overflow:'hidden' }}>
      <FloralBg colors={['#A8836B','#D4B89A','#E8DCC8','#7A6F5F','#F1ECE2']} seed={23} petals={9} blur={32} />
      <div style={{ position:'absolute', inset:0, background:`linear-gradient(180deg, transparent 50%, ${palette.surface}DD 100%)` }} />
      <div style={{ position:'absolute', bottom:18, left:24, right:24, color:palette.ink }}>
        <span style={{ fontSize:10.5, fontFamily:mono, letterSpacing:'0.12em', textTransform:'uppercase', opacity:0.65 }}>Chinese · 语文</span>
        <h1 style={{ margin:'4px 0 0', fontFamily:serif, fontStyle:'italic', fontWeight:500, fontSize:46, letterSpacing:'-0.03em', lineHeight:1 }}>语文</h1>
      </div>
    </div>
    {/* list */}
    <div style={{ flex:1, padding:'18px 24px', background:palette.surface }}>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:14 }}>
        <h3 style={{ margin:0, fontSize:13, fontWeight:600, color:palette.ink, letterSpacing:'-0.015em' }}>312 份资料</h3>
        <span style={{ fontSize:11, color:palette.muted, fontFamily:mono }}>5 类 · 12 老师</span>
      </div>
      {[
        ['高三语文 · 现代文阅读得分策略','讲义','4.6'],
        ['初二语文 · 文言文阅读专项训练','习题','4.7'],
        ['高考语文 · 古诗鉴赏真题汇编','真题','4.8'],
      ].map(([title,kind,score],i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:11, padding:'11px 0', borderBottom: i<2 ? `1px solid ${palette.line2}` : 'none' }}>
          <div style={{ width:30, height:30, borderRadius:7, background:'#E8DDD3', color:'#7A6F5F', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="4.6" r="0.85" fill="currentColor" stroke="none"/><path d="M5 8.5h14"/><path d="M11 9.5l-4.5 11"/><path d="M13 9.5l4.5 11"/></svg>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12.5, fontWeight:500, color:palette.ink, letterSpacing:'-0.012em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{title}</div>
            <div style={{ fontSize:10.5, color:palette.muted, marginTop:3 }}>
              <span style={{ padding:'1px 6px', borderRadius:3, background:palette.accent, color:palette.ink2, fontWeight:500 }}>{kind}</span>
            </div>
          </div>
          <span style={{ fontFamily:mono, fontSize:11, color:palette.ink2 }}>★ {score}</span>
        </div>
      ))}
    </div>
  </div>
);

/* 3c · Empty state */
const EmptyState = ({ palette }) => (
  <div style={{ height:'100%', fontFamily:sans, background:palette.page, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 28px', textAlign:'center' }}>
    <div style={{ width:200, height:200, borderRadius:'50%', overflow:'hidden', marginBottom:28, position:'relative' }}>
      <FloralBg colors={FLORAL_PALETTES.celadon} seed={29} petals={8} blur={28} />
    </div>
    <h2 style={{ margin:0, fontFamily:serif, fontStyle:'italic', fontWeight:500, fontSize:30, color:palette.ink, letterSpacing:'-0.025em' }}>还没有收藏</h2>
    <p style={{ margin:'10px 0 22px', fontSize:13, color:palette.muted, maxWidth:280, lineHeight:1.6 }}>
      浏览资料时点击 <span style={{ display:'inline-flex', verticalAlign:'middle', margin:'0 2px' }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2l1.8 3.8L14 6.4l-3 3 .8 4.2L8 11.7 4.2 13.6 5 9.4l-3-3 4.2-.6z"/></svg>
      </span> 即可加入收藏，方便随时查看
    </p>
    <button style={{ height:36, padding:'0 18px', background:palette.ink, color:palette.surface, border:'none', borderRadius:8, fontFamily:sans, fontSize:13, fontWeight:500, cursor:'pointer' }}>去浏览资料</button>
  </div>
);

/* 3d · Onboarding welcome */
const OnboardingWelcome = ({ palette }) => (
  <div style={{ height:'100%', fontFamily:sans, background:palette.page, position:'relative', overflow:'hidden' }}>
    <div style={{ position:'absolute', top:-40, right:-40, width:300, height:300, borderRadius:'50%', overflow:'hidden', opacity:0.85 }}>
      <FloralBg colors={FLORAL_PALETTES.twilight} seed={37} petals={9} blur={30} />
    </div>
    <div style={{ position:'absolute', bottom:-60, left:-60, width:260, height:260, borderRadius:'50%', overflow:'hidden', opacity:0.55 }}>
      <FloralBg colors={FLORAL_PALETTES.forest} seed={43} petals={8} blur={32} />
    </div>
    <div style={{ position:'relative', height:'100%', display:'flex', flexDirection:'column', justifyContent:'center', padding:'40px 36px' }}>
      <div style={{ fontFamily:mono, fontSize:11, color:palette.muted2, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:18 }}>01 · 欢迎</div>
      <h1 style={{ margin:0, fontFamily:serif, fontStyle:'italic', fontWeight:500, fontSize:54, color:palette.ink, letterSpacing:'-0.035em', lineHeight:1, maxWidth:300 }}>
        让好资料<br />落到对的人
      </h1>
      <p style={{ margin:'20px 0 32px', fontSize:13.5, color:palette.muted, lineHeight:1.7, maxWidth:300 }}>
        蒲公英为老师和学生连接最适合的讲义、习题和真题 —— 像风把种子带到合适的土壤
      </p>
      <div style={{ display:'flex', gap:10 }}>
        <button style={{ height:42, padding:'0 22px', background:palette.ink, color:palette.surface, border:'none', borderRadius:9, fontFamily:sans, fontSize:13, fontWeight:500, cursor:'pointer' }}>开始 →</button>
        <button style={{ height:42, padding:'0 18px', background:'transparent', color:palette.ink2, border:'none', fontFamily:sans, fontSize:13, cursor:'pointer' }}>登录已有账号</button>
      </div>
    </div>
  </div>
);

/* ─── App ─── */
function BrandSystemApp() {
  const forestPalette = PALETTES[0].tokens;
  const teaPalette    = PALETTES[1].tokens;
  const celadonPalette= PALETTES[2].tokens;

  return (
    <DesignCanvas title="StudyConnect · Brand System" subtitle="色彩 · 花卉视觉 · 应用">
      <DCSection id="palette" title="1 · 色彩方案 · 墨绿 + 浅灰 + 陶瓷">
        {PALETTES.map(p => (
          <DCArtboard key={p.id} id={`pal-${p.id}`} label={p.name} width={620} height={820}>
            <PaletteCard p={p} />
          </DCArtboard>
        ))}
      </DCSection>

      <DCSection id="floral" title="2 · 花卉视觉语言 · 动态模糊色云">
        {FLORALS.map(f => (
          <DCArtboard key={f.id} id={`flo-${f.id}`} label={`${f.name} · ${f.cn}`} width={360} height={480}>
            <FloralTile f={f} />
          </DCArtboard>
        ))}
      </DCSection>

      <DCSection id="apply" title="3 · 应用场景">
        <DCArtboard id="apply-login"   label="登录页 · 暮色"        width={420} height={700}>
          <LoginWithFloral floral={FLORALS[2]} palette={forestPalette} />
        </DCArtboard>
        <DCArtboard id="apply-subject" label="学科 Hero · 语文"   width={420} height={700}>
          <SubjectHero palette={forestPalette} />
        </DCArtboard>
        <DCArtboard id="apply-empty"   label="空状态 · 我的收藏"    width={420} height={700}>
          <EmptyState palette={forestPalette} />
        </DCArtboard>
        <DCArtboard id="apply-welcome" label="入场页 · 欢迎"        width={420} height={700}>
          <OnboardingWelcome palette={forestPalette} />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

window.BrandSystemApp = BrandSystemApp;
