/* StudyConnect · Prototype v2 — CeladonInk · 思源黑体 · Floral orb */

const { useState, useEffect, useRef } = React;

/* ── Floral images ── */
const IMG_CELADON  = 'uploads/92AC4D69-4202-431F-8D59-5B45A03C16D2.png'; // lightest celadon
const IMG_TEAL     = 'uploads/8CA2007E-B11A-44F5-B588-659B291570B4.png'; // teal-blue
const IMG_PINKTEAL = 'uploads/D491BBF0-4FF8-4A30-B8D1-2A339B9845BB.png'; // pink+teal

/* ══════════════════════════════════════════════════
   ORB CANVAS — rotating 3-D particle sphere
   ══════════════════════════════════════════════════ */
function OrbCanvas({ size = 160 }) {
  const ref    = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2, R = size * 0.38;
    const COLS = ['rgba(195,230,215,', 'rgba(218,242,230,', 'rgba(155,200,183,'];
    const pts = Array.from({ length: 88 }, () => ({
      phi: Math.acos(2 * Math.random() - 1),
      th0: Math.random() * Math.PI * 2,
      spd: 0.0028 + Math.random() * 0.004,
      sz:  0.85 + Math.random() * 1.9,
      col: COLS[Math.floor(Math.random() * 3)],
      br:  0.45 + Math.random() * 0.55,
    }));

    let t = 0;
    const tick = () => {
      ctx.clearRect(0, 0, size, size);

      /* center glow */
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, 'rgba(210,242,226,0.26)');
      g.addColorStop(1, 'rgba(170,218,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2); ctx.fill();

      /* project + sort + draw */
      pts.map(p => {
        const th = p.th0 + t * p.spd;
        const sp = Math.sin(p.phi);
        return { ...p,
          sx: cx + R * sp * Math.cos(th),
          sy: cy + R * sp * Math.sin(th) * 0.42 + R * Math.cos(p.phi) * 0.38,
          z:  R * Math.cos(p.phi),
        };
      }).sort((a, b) => a.z - b.z).forEach(p => {
        const df = (p.z + R) / (2 * R);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, p.sz * (0.5 + df * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = p.col + (p.br * (0.3 + df * 0.7)).toFixed(2) + ')';
        ctx.fill();
      });

      t++;
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, [size]);

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}

/* ── Floral badge (tiny circle) ── */
const FloralBadge = ({ size = 42, src = IMG_CELADON }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    overflow: 'hidden', flexShrink: 0,
    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
    border: '1.5px solid rgba(255,255,255,0.9)',
    background: '#D6E9E2',
  }}>
    <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
  </div>
);

/* ── Field ── */
const Field = ({ label, value, onChange, type='text', placeholder, hint, optional, autoFocus }) => {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label style={{ fontSize: 10.5, color: T.muted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500, display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
          {label}
          {optional && <span style={{ fontFamily: mono, fontSize: 9.5, color: T.muted2, textTransform: 'none' }}>选填</span>}
        </label>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', height: 44, padding: '0 14px',
        background: 'rgba(255,255,255,0.84)', backdropFilter: 'blur(8px)',
        border: `1px solid ${focus ? T.accent : T.line}`, borderRadius: 8, transition: 'border-color 130ms',
      }}>
        <input
          type={type} value={value} onChange={e => onChange(e.target.value)}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          placeholder={placeholder} autoFocus={autoFocus}
          style={{ flex: 1, height: '100%', padding: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontFamily: sans, color: T.ink }}
        />
      </div>
      {hint && <p style={{ fontSize: 11, color: T.muted2, margin: '6px 2px 0' }}>{hint}</p>}
    </div>
  );
};

/* ── ProtoBtn ── */
const ProtoBtn = ({ children, onClick, disabled, variant='primary', size='lg', style: ex={} }) => {
  const base = { fontFamily: sans, cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 140ms', letterSpacing: '-0.005em' };
  const SZ = { lg: { height: 44, padding: '0 22px', fontSize: 14, borderRadius: 9 }, md: { height: 36, padding: '0 16px', fontSize: 13, borderRadius: 8 } };
  const V = {
    primary: { background: T.ink, color: '#FAFBFA', opacity: disabled ? 0.35 : 1 },
    ghost:   { background: 'transparent', color: T.ink2 },
    outline: { background: 'rgba(255,255,255,0.82)', color: T.ink2, border: `1px solid ${T.line}`, backdropFilter: 'blur(8px)' },
  };
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...SZ[size], ...V[variant], ...ex }}>{children}</button>;
};

const Spinner = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: 'sc-spin 0.7s linear infinite' }}>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2"/>
    <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/* ══════════════════════════════════════════════════
   LOGIN — 3-phase floral animation
   Phase 1 'orb'  : animated particle sphere (2.4s auto-advance or tap)
   Phase 2 'bloom': iris-expand the floral image (1.1s)
   Phase 3 'form' : blurred floral bg + login form
   ══════════════════════════════════════════════════ */
function LoginScreen({ onLogin }) {
  const [phase, setPhase]   = useState('orb');
  const [phone, setPhone]   = useState('');
  const [pwd, setPwd]       = useState('');
  const [loading, setLoad]  = useState(false);
  const [hint, setHint]     = useState(null);

  useEffect(() => {
    if (phase === 'orb')   { const t = setTimeout(() => setPhase('bloom'), 2400); return () => clearTimeout(t); }
    if (phase === 'bloom') { const t = setTimeout(() => setPhase('form'),  1100); return () => clearTimeout(t); }
  }, [phase]);

  const toast = lbl => { setHint(`${lbl}：演示模式下不可用`); clearTimeout(window.__lt); window.__lt = setTimeout(() => setHint(null), 1800); };
  const submit = () => { if (!phone || !pwd) return; setLoad(true); setTimeout(() => onLogin({ phone, isNew: false }), 600); };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, position: 'relative', overflow: 'hidden', fontFamily: sans, color: T.ink }}>

      {/* ── Floral background layer — iris expand via clip-path ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: `url("${IMG_CELADON}")`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        filter: phase === 'form'
          ? 'blur(26px) saturate(0.6) brightness(1.08)'
          : 'blur(0px) saturate(1)',
        opacity: phase === 'orb' ? 0 : phase === 'form' ? 0.48 : 0.88,
        clipPath: phase === 'orb'
          ? 'circle(0px at 50% 42%)'
          : 'circle(160vmax at 50% 42%)',
        transition: phase === 'bloom'
          ? 'clip-path 1.1s cubic-bezier(0.22,0.61,0.36,1), opacity 0.5s ease'
          : 'filter 0.9s ease, opacity 0.9s ease',
        willChange: 'clip-path, filter, opacity',
      }} />

      {/* ── Frosted overlay (form phase only) ── */}
      {phase === 'form' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1,
          background: 'rgba(246,249,247,0.54)',
          animation: 'sc-fadein 0.7s ease both',
        }} />
      )}

      {/* ── PHASE 1: ORB ── */}
      {phase === 'orb' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Orb */}
          <div
            onClick={() => setPhase('bloom')}
            style={{
              width: 152, height: 152, borderRadius: '50%',
              overflow: 'hidden', position: 'relative', cursor: 'pointer',
              background: 'radial-gradient(circle at 42% 38%, #CCE8DC, #9ABFB0 45%, #68998A)',
              boxShadow: '0 0 50px rgba(105,180,155,0.26), 0 0 100px rgba(85,162,138,0.13)',
              animation: 'sc-breathe 3.2s ease-in-out infinite',
            }}
          >
            {/* Floral image inside orb */}
            <img
              src={IMG_CELADON}
              style={{ position: 'absolute', inset: '-8px', width: 'calc(100% + 16px)', height: 'calc(100% + 16px)', objectFit: 'cover', filter: 'saturate(0.65) brightness(1.18)', opacity: 0.6 }}
              alt=""
            />
            {/* Particle overlay */}
            <OrbCanvas size={152} />
            {/* Inner highlight */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 48% 44%, rgba(225,248,238,0.28), transparent 65%)', borderRadius: '50%' }} />
          </div>

          {/* Label */}
          <div style={{ marginTop: 26, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: T.ink, letterSpacing: '-0.01em', fontFamily: sans }}>StudyConnect</div>
            <div style={{ marginTop: 8, fontSize: 11.5, color: T.muted2, fontFamily: mono, letterSpacing: '0.1em', animation: 'sc-pulse 2.4s ease-in-out infinite' }}>轻触开始</div>
          </div>
        </div>
      )}

      {/* ── PHASE 3: FORM ── */}
      {phase === 'form' && (
        <div style={{
          position: 'relative', zIndex: 10,
          minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '60px 24px 32px',
          animation: 'sc-fade 450ms ease 140ms both',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 36 }}>
            <DandelionMark size={50} bg={T.ink} color="#FAFBFA" />
            <span style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '0.06em', color: T.muted, textTransform: 'uppercase', fontFamily: mono }}>StudyConnect</span>
          </div>

          {/* Card */}
          <div style={{
            width: '100%', maxWidth: 360,
            background: 'rgba(252,254,253,0.88)', backdropFilter: 'blur(18px)',
            borderRadius: 16, padding: '30px 26px',
            border: '1px solid rgba(210,228,220,0.9)',
            boxShadow: '0 2px 28px rgba(0,0,0,0.055)',
          }}>
            <h1 style={{ fontFamily: serif, fontSize: 27, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 26px', textAlign: 'center', color: T.ink }}>
              欢迎回来
            </h1>
            <Field label="手机号" value={phone} onChange={setPhone} placeholder="138 0000 0000" autoFocus />
            <Field label="密码" value={pwd} onChange={setPwd} type="password" placeholder="6 位以上字符" hint="演示模式 · 任意输入即可登录" />
            <div style={{ marginTop: 8 }}>
              <ProtoBtn onClick={submit} disabled={loading || !phone || !pwd} style={{ width: '100%' }}>
                {loading ? <><Spinner /> 登录中…</> : '继续'}
              </ProtoBtn>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 2px 0', fontSize: 12, color: T.muted }}>
              <a onClick={() => onLogin({ phone: phone || ' ', isNew: true })} style={{ cursor: 'pointer' }}>新建账号</a>
              <a onClick={() => toast('忘记密码')} style={{ cursor: 'pointer' }}>忘记密码</a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 13px', color: T.muted2, fontSize: 11 }}>
              <div style={{ flex: 1, height: 1, background: T.line2 }} /><span>或</span><div style={{ flex: 1, height: 1, background: T.line2 }} />
            </div>
            <ProtoBtn variant="outline" style={{ width: '100%' }} onClick={() => toast('微信登录')}>
              <span style={{ width: 18, height: 18, borderRadius: 4, background: '#07C160', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                  <path d="M9.3 3.2C4.7 3.2 1 6.4 1 10.4c0 2.2 1.2 4.2 3.1 5.6l-.8 2.4 2.9-1.5c1 .3 2 .5 3.1.5l.7-.02c-.2-.6-.3-1.3-.3-2 0-3.7 3.6-6.7 8.1-6.7l.7.03c-.6-3.2-3.9-5.6-7.9-5.6zM6.5 6.7c.6 0 1.1.5 1.1 1.1s-.5 1.1-1.1 1.1-1.1-.5-1.1-1.1.5-1.1 1.1-1.1zm5.6 0c.6 0 1.1.5 1.1 1.1s-.5 1.1-1.1 1.1-1.1-.5-1.1-1.1.5-1.1 1.1-1.1z"/>
                  <path d="M23 14.7c0-3.3-3.2-6-7-6s-7 2.7-7 6 3.2 6 7 6c.8 0 1.6-.1 2.4-.3l2.2 1.2-.6-2c1.8-1.1 3-2.9 3-4.9zm-9.3-1.4c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9zm4.7 0c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9z"/>
                </svg>
              </span>
              微信登录
            </ProtoBtn>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 'auto', paddingTop: 40, display: 'flex', gap: 16, fontSize: 11, color: T.muted2 }}>
            <a onClick={() => toast('使用条款')} style={{ cursor: 'pointer' }}>使用条款</a>
            <span>·</span>
            <a onClick={() => toast('隐私政策')} style={{ cursor: 'pointer' }}>隐私政策</a>
            <span>·</span>
            <span style={{ fontFamily: mono }}>SC · 2026</span>
          </div>
        </div>
      )}

      {hint && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: T.ink, color: '#FAFBFA', padding: '9px 16px', borderRadius: 8, fontSize: 12.5, boxShadow: '0 6px 18px rgba(0,0,0,0.15)', animation: 'sc-rise 220ms cubic-bezier(0.2,0.7,0.2,1) both', whiteSpace: 'nowrap', zIndex: 100 }}>{hint}</div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   ONBOARDING
   ══════════════════════════════════════════════════ */
const STAGES = [
  { key: '高中',          grades: ['高一','高二','高三'] },
  { key: '初中',          grades: ['初一','初二','初三'] },
  { key: '初中（五四制）', grades: ['六年级','七年级','八年级','九年级'] },
];
const SUBJECTS = ['语文','数学','英语','物理','化学','生物','历史','地理','政治'];

function Onboarding({ onDone, isNew }) {
  const steps = isNew ? ['account','identity','info'] : ['identity','info'];
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ role: null, name: '', password: '', confirm: '', school: '', city: '', stages: [], grades: [], subjects: [], goal: null });
  const set = patch => setData(d => ({ ...d, ...patch }));
  const total = steps.length;

  const accountValid  = data.name.trim().length > 0 && data.password.length >= 6 && data.password === data.confirm;
  const identityValid = !!data.role;
  const infoValid     = data.role === 'teacher'
    ? data.subjects.length > 0 && (data.stages.length + data.grades.length > 0)
    : data.grades.length === 1 && data.subjects.length > 0;
  const validMap = { account: accountValid, identity: identityValid, info: infoValid };
  const valid    = steps.map(k => validMap[k]);
  const current  = steps[step];

  const next = () => { if (!valid[step]) return; if (step === total - 1) onDone(data); else setStep(step + 1); };
  const back = () => step > 0 && setStep(step - 1);

  useEffect(() => {
    const h = e => { if (e.key === 'Enter' && valid[step]) next(); if (e.key === 'Escape' && step > 0) back(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <div style={{ minHeight: '100vh', position: 'relative', fontFamily: sans, background: T.bg, color: T.ink, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ position: 'absolute', top: 26, left: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
        <DandelionMark size={28} bg={T.ink} color="#FAFBFA" />
        <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.025em' }}>StudyConnect</span>
      </div>
      <div style={{ position: 'absolute', top: 26, right: 32, display: 'flex', alignItems: 'center', gap: 14 }}>
        <StepDots total={total} current={step} />
        <span style={{ fontFamily: mono, fontSize: 12, color: T.muted }}>
          {String(step+1).padStart(2,'0')} <span style={{ color: T.muted2 }}>/ {String(total).padStart(2,'0')}</span>
        </span>
      </div>

      {/* Content */}
      <div className="sc-onb-pad" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '90px 24px 40px' }}>
        <div style={{ width: '100%', maxWidth: current === 'info' ? 680 : 440, animation: 'sc-fade 280ms ease' }} key={`${step}-${data.role}`}>
          {current === 'account'  && <StepAccount  data={data} set={set} />}
          {current === 'identity' && <StepIdentity data={data} set={set} />}
          {current === 'info' && data.role === 'teacher' && <Step1Teacher data={data} set={set} />}
          {current === 'info' && data.role === 'student' && <Step1Student data={data} set={set} />}
          {current === 'info' && !data.role && <div style={{ color: T.muted, fontSize: 13 }}>请先返回选择身份。</div>}
        </div>
      </div>

      {/* Footer */}
      <div className="sc-onb-footer" style={{ borderTop: `1px solid ${T.line2}`, padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <ProtoBtn variant="ghost" size="md" onClick={back} style={{ visibility: step === 0 ? 'hidden' : 'visible' }}>
          <span style={{ fontFamily: mono }}>←</span> 上一步
        </ProtoBtn>
        <div className="sc-onb-kbd" style={{ fontSize: 11, color: T.muted2, fontFamily: mono, display: 'flex', gap: 14 }}>
          <span><kbd style={kbdSt}>Enter</kbd> 继续</span>
          {step > 0 && <span><kbd style={kbdSt}>Esc</kbd> 返回</span>}
        </div>
        <ProtoBtn size="md" onClick={next} disabled={!valid[step]}>
          {step === total - 1 ? '进入 StudyConnect' : '下一步'} <span style={{ fontFamily: mono }}>→</span>
        </ProtoBtn>
      </div>
    </div>
  );
}

const kbdSt = { fontFamily: mono, fontSize: 10, color: T.muted, padding: '1px 5px', border: `1px solid ${T.line}`, borderRadius: 3, marginRight: 4 };

const StepDots = ({ total, current }) => (
  <div style={{ display: 'flex', gap: 5 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{ width: i === current ? 22 : 6, height: 6, borderRadius: 3, background: i <= current ? T.ink : T.line, transition: 'width 220ms ease, background 220ms' }} />
    ))}
  </div>
);

/* ── Eyebrow / Hero / Sub / SubLabel ── */
const Eyebrow = ({ step, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontFamily: mono, fontSize: 11, color: T.muted2, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
    <span style={{ color: T.muted }}>0{step}</span>
    <span style={{ width: 14, height: 1, background: T.line, display: 'inline-block' }} />
    <span>{label}</span>
  </div>
);
const Hero    = ({ children }) => <h1 className="sc-hero" style={{ fontFamily: serif, fontSize: 36, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.12, margin: 0, color: T.ink }}>{children}</h1>;
const Sub     = ({ children }) => <p style={{ fontSize: 14, color: T.muted, margin: '10px 0 28px', lineHeight: 1.5, fontFamily: sans }}>{children}</p>;
const SubLabel= ({ children }) => <div style={{ fontSize: 10.5, color: T.muted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500, marginBottom: 10, fontFamily: sans }}>{children}</div>;

/* ── StepAccount ── */
const StepAccount = ({ data, set }) => {
  const pwHint = data.password.length > 0 && data.password.length < 6 ? '密码至少 6 位'
    : (data.confirm.length > 0 && data.password !== data.confirm ? '两次密码不一致' : null);
  return (
    <div>
      <Eyebrow step={1} label="账号" />
      <Hero>创建账号</Hero>
      <Sub>设置昵称和登录密码 · 之后可在「个人设置」修改</Sub>
      <Field label="昵称"    value={data.name}     onChange={v => set({ name: v })}     autoFocus />
      <Field label="密码"    value={data.password} onChange={v => set({ password: v })} type="password" hint="6 位以上字符" />
      <Field label="确认密码" value={data.confirm}  onChange={v => set({ confirm: v })}  type="password" hint={pwHint} />
    </div>
  );
};

/* ── StepIdentity — with FloralBadge ── */
const StepIdentity = ({ data, set }) => (
  <div>
    {/* Floral badge — the orb shrunken to a small point */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 20 }}>
      <FloralBadge size={44} />
      <Eyebrow step={2} label="身份" />
    </div>
    <Hero>你是？</Hero>
    <Sub>我们会按身份定制首页和推荐内容</Sub>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <RoleCard chosen={data.role==='teacher'} onClick={() => set({ role:'teacher' })} icon={<TeacherGlyph />} title="教师" desc="组卷 · 上传讲义 · 学情分析" />
      <RoleCard chosen={data.role==='student'} onClick={() => set({ role:'student' })} icon={<StudentGlyph />} title="学生" desc="练习 · 错题本 · 个性化推荐" />
    </div>
  </div>
);

const RoleCard = ({ chosen, onClick, icon, title, desc }) => (
  <button onClick={onClick} style={{
    padding: '20px 18px', textAlign: 'left',
    background: chosen ? T.ink : T.bg, color: chosen ? '#FAFBFA' : T.ink,
    border: `1px solid ${chosen ? T.ink : T.line}`, borderRadius: 10,
    cursor: 'pointer', fontFamily: sans, display: 'flex', flexDirection: 'column', gap: 10,
    transition: 'all 160ms', transform: chosen ? 'translateY(-1px)' : 'none',
  }}>
    <div style={{ width: 34, height: 34, borderRadius: 8, background: chosen ? 'rgba(255,255,255,0.12)' : T.fill, border: `1px solid ${chosen ? 'rgba(255,255,255,0.2)' : T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em' }}>{title}</div>
      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 3 }}>{desc}</div>
    </div>
  </button>
);
const TeacherGlyph = () => <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5L10 3l7.5 3.5L10 10z"/><path d="M5.5 8v4c0 1.5 2 2.5 4.5 2.5s4.5-1 4.5-2.5V8"/><path d="M17.5 6.5v4.5"/></svg>;
const StudentGlyph = () => <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 4h9a1 1 0 0 1 1 1v10.5L10 13l-4.5 2.5V5a1 1 0 0 1 1-1z"/></svg>;

/* ── Step1Teacher ── */
const Step1Teacher = ({ data, set }) => {
  const toggleStage   = k => set({ stages:   data.stages.includes(k)   ? data.stages.filter(x=>x!==k)   : [...data.stages,k]   });
  const toggleGrade   = g => set({ grades:   data.grades.includes(g)   ? data.grades.filter(x=>x!==g)   : [...data.grades,g]   });
  const toggleSubject = k => set({ subjects: data.subjects.includes(k) ? data.subjects.filter(x=>x!==k) : [...data.subjects,k] });
  return (
    <div>
      <Eyebrow step={2} label="完善资料" />
      <Hero>教学信息</Hero>
      <Sub>选择你所教的学段、年级与学科 · 后续可随时调整</Sub>
      <div className="sc-form-grid" style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:14 }}>
        <Field label="学校名称" optional value={data.school} onChange={v=>set({school:v})} placeholder="如：北京市第十一中学" />
        <Field label="所在城市" optional value={data.city}   onChange={v=>set({city:v})}   placeholder="北京" />
      </div>
      <SubLabel>学段 · 年级</SubLabel>
      <p style={{ fontSize:11.5, color:T.muted2, margin:'-4px 0 12px' }}>点击「学段」选择整个学段，或直接点击具体「年级」。</p>
      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:22 }}>
        {STAGES.map(s => {
          const on = data.stages.includes(s.key);
          return (
            <div key={s.key} style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', padding:'10px 12px', border:`1px solid ${T.line}`, borderRadius:9, background:T.bg }}>
              <button onClick={()=>toggleStage(s.key)} style={{ padding:'6px 13px', borderRadius:6, fontSize:13, fontWeight:500, background:on?T.ink:T.fill, color:on?'#FAFBFA':T.ink, border:`1px solid ${on?T.ink:T.line}`, cursor:'pointer', fontFamily:sans, display:'inline-flex', alignItems:'center', gap:5 }}>
                {on && <span style={{ fontFamily:mono, fontSize:10 }}>✓</span>}{s.key}
              </button>
              <span style={{ width:1, height:18, background:T.line2 }} />
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {s.grades.map(g => { const gon = data.grades.includes(g); return (
                  <button key={g} onClick={()=>toggleGrade(g)} style={{ padding:'5px 11px', borderRadius:18, fontSize:12.5, background:gon?T.ink2:'transparent', color:gon?'#FAFBFA':T.muted, border:`1px solid ${gon?T.ink2:T.line}`, cursor:'pointer', fontFamily:sans, transition:'all 130ms' }}>{g}</button>
                ); })}
              </div>
            </div>
          );
        })}
      </div>
      <SubLabel>学科</SubLabel>
      <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:4 }}>
        {SUBJECTS.map(s => { const on = data.subjects.includes(s); return (
          <button key={s} onClick={()=>toggleSubject(s)} style={{ padding:'6px 13px', borderRadius:18, background:on?T.ink:'transparent', color:on?'#FAFBFA':T.ink2, border:`1px solid ${on?T.ink:T.line}`, fontSize:12.5, fontFamily:sans, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, transition:'all 130ms' }}>
            {on && <span style={{ fontFamily:mono, fontSize:10 }}>✓</span>}{s}
          </button>
        ); })}
      </div>
    </div>
  );
};

/* ── Step1Student ── */
const Step1Student = ({ data, set }) => {
  const toggleSubject = k => set({ subjects: data.subjects.includes(k) ? data.subjects.filter(x=>x!==k) : [...data.subjects,k] });
  const selectGrade   = (stage, g) => set({ grades:[g], stages:[stage] });
  const GOALS = [
    { key:'巩固基础', desc:'稳步消化课内重点' },
    { key:'同步提升', desc:'紧跟进度查漏补缺' },
    { key:'冲刺拔高', desc:'压轴题型重点突破' },
  ];
  return (
    <div>
      <Eyebrow step={2} label="完善资料" />
      <Hero>学习信息</Hero>
      <Sub>选择年级和想提升的学科，我们为你定制题目</Sub>
      <div className="sc-form-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <Field label="学校名称" optional value={data.school} onChange={v=>set({school:v})} placeholder="如：北京市第四中学" />
        <Field label="所在城市" optional value={data.city}   onChange={v=>set({city:v})}   placeholder="北京" />
      </div>
      <SubLabel>当前年级 · 单选</SubLabel>
      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:22 }}>
        {STAGES.map(s => (
          <div key={s.key} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', border:`1px solid ${T.line}`, borderRadius:9, background:T.bg }}>
            <span style={{ fontSize:12.5, fontWeight:500, color:T.ink2, minWidth:96 }}>{s.key}</span>
            <span style={{ width:1, height:18, background:T.line2 }} />
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {s.grades.map(g => { const on = data.grades[0]===g; return (
                <button key={g} onClick={()=>selectGrade(s.key,g)} style={{ padding:'6px 14px', borderRadius:18, fontSize:12.5, background:on?T.ink:'transparent', color:on?'#FAFBFA':T.muted, border:`1px solid ${on?T.ink:T.line}`, cursor:'pointer', fontFamily:sans, transition:'all 130ms', display:'inline-flex', alignItems:'center', gap:5 }}>
                  {on && <span style={{ fontFamily:mono, fontSize:10 }}>✓</span>}{g}
                </button>
              ); })}
            </div>
          </div>
        ))}
      </div>
      <SubLabel>想要提升的学科 · 可多选</SubLabel>
      <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:22 }}>
        {SUBJECTS.map(s => { const on = data.subjects.includes(s); return (
          <button key={s} onClick={()=>toggleSubject(s)} style={{ padding:'6px 13px', borderRadius:18, background:on?T.ink:'transparent', color:on?'#FAFBFA':T.ink2, border:`1px solid ${on?T.ink:T.line}`, fontSize:12.5, fontFamily:sans, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, transition:'all 130ms' }}>
            {on && <span style={{ fontFamily:mono, fontSize:10 }}>✓</span>}{s}
          </button>
        ); })}
      </div>
      <SubLabel>学习目标 · 选填</SubLabel>
      <div className="sc-goals-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {GOALS.map(g => { const on = data.goal===g.key; return (
          <button key={g.key} onClick={()=>set({ goal: on ? null : g.key })} style={{ padding:'12px 14px', textAlign:'left', background:on?T.ink:T.bg, color:on?'#FAFBFA':T.ink, border:`1px solid ${on?T.ink:T.line}`, borderRadius:9, cursor:'pointer', fontFamily:sans, transition:'all 160ms' }}>
            <div style={{ fontSize:13.5, fontWeight:500 }}>{g.key}</div>
            <div style={{ fontSize:11.5, opacity:0.6, marginTop:3 }}>{g.desc}</div>
          </button>
        ); })}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════
   APP STAGE
   ══════════════════════════════════════════════════ */
function AppStage({ user, onLogout }) {
  const [showToast, setShowToast] = useState(true);
  useEffect(() => { const t = setTimeout(() => setShowToast(false), 4200); return () => clearTimeout(t); }, []);
  const enriched = { ...user, viewedKinds: user.role==='teacher' ? ['习题','讲义','真题'] : ['习题','真题'] };
  return (
    <UserCtx.Provider value={enriched}>
      <div style={{ minHeight:'100vh', position:'relative' }}>
        <DirB />
        {showToast && (
          <div style={{ position:'fixed', bottom:22, left:'50%', transform:'translateX(-50%)', background:T.ink, color:'#FAFBFA', padding:'11px 18px 11px 14px', borderRadius:10, display:'flex', alignItems:'center', gap:12, fontFamily:sans, fontSize:13, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', animation:'sc-rise 320ms cubic-bezier(0.2,0.7,0.2,1) both', zIndex:100 }}>
            <span style={{ width:18, height:18, borderRadius:'50%', background:'#22C55E', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontFamily:mono, fontWeight:600 }}>✓</span>
            欢迎，{user.name || (user.role==='student' ? '同学' : '老师')}！已根据 {formatUserTitle(user)} 定制内容
            <button onClick={()=>setShowToast(false)} style={{ marginLeft:6, background:'transparent', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', padding:'0 4px', fontSize:14 }}>×</button>
          </div>
        )}
        <button onClick={onLogout} title="重新体验登录流程" style={{ position:'fixed', bottom:18, right:18, background:T.bg, color:T.muted, border:`1px solid ${T.line}`, padding:'6px 11px', borderRadius:20, fontSize:11, fontFamily:mono, cursor:'pointer', display:'flex', alignItems:'center', gap:6, boxShadow:'0 2px 8px rgba(0,0,0,0.04)', zIndex:50 }}>↻ 重新体验</button>
      </div>
    </UserCtx.Provider>
  );
}

/* ══════════════════════════════════════════════════
   ROOT
   ══════════════════════════════════════════════════ */
const EMPTY = { name:'', role:null, school:'', city:'', stages:[], grades:[], subjects:[], goal:null };

function Prototype() {
  const [stage, setStage] = useState('login');
  const [user, setUser]   = useState(EMPTY);
  const [isNew, setIsNew] = useState(true);
  return (
    <>
      <style>{`
        @keyframes sc-spin    { to { transform: rotate(360deg); } }
        @keyframes sc-rise    { from { opacity:0; transform:translate(-50%,12px); } to { opacity:1; transform:translate(-50%,0); } }
        @keyframes sc-fade    { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes sc-fadein  { from { opacity:0; } to { opacity:1; } }
        @keyframes sc-pulse   { 0%,100% { opacity:0.38; } 50% { opacity:0.9; } }
        @keyframes sc-breathe { 0%,100% { transform:scale(1); } 50% { transform:scale(1.045); } }
        body { margin:0; }
        html,body,#root { height:100%; }
        @media (max-width:720px) {
          .sc-form-grid  { grid-template-columns:1fr !important; }
          .sc-goals-grid { grid-template-columns:1fr !important; }
          .sc-onb-pad    { padding:70px 18px 30px !important; }
          .sc-onb-footer { padding:14px 18px !important; flex-wrap:wrap; gap:8px; }
          .sc-onb-footer .sc-onb-kbd { display:none !important; }
          .sc-hero       { font-size:28px !important; }
        }
      `}</style>

      {stage === 'login' && (
        <LoginScreen onLogin={info => {
          setUser(u => ({ ...u, phone: info.phone }));
          setIsNew(!!info.isNew);
          setStage('onboarding');
        }} />
      )}
      {stage === 'onboarding' && (
        <Onboarding isNew={isNew} onDone={data => { setUser(u => ({ ...u, ...data })); setStage('app'); }} />
      )}
      {stage === 'app' && (
        <AppStage user={user} onLogout={() => { setUser(EMPTY); setStage('login'); }} />
      )}
    </>
  );
}

window.Prototype = Prototype;
