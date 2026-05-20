/* ════════════════════════════════════════════════════
   Floral / motion-blur backgrounds — pure SVG
   Inspired by OpenAI's news cards.

   Usage:
     <FloralBg colors={['#163E2F','#D4C5B0','#F1ECE2']} seed={3} />

   Renders an SVG of layered blurred ellipses ("petals") tinted from
   the palette, positioned along a curve to give organic motion.
   ════════════════════════════════════════════════════ */

/* ── Deterministic PRNG (Mulberry32) so seeds re-render same look ── */
function rng(seed) {
  let t = seed + 0x6D2B79F5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FloralBg = ({
  colors = ['#163E2F','#D4C5B0','#F1ECE2','#A8C2A0'],
  seed = 1,
  petals = 8,
  blur = 26,         // gaussian std-deviation
  className,
  style,
  // composition: 'bouquet' clusters near center; 'drift' spreads with motion
  composition = 'bouquet',
}) => {
  const r = rng(seed * 9973 + 1);
  const W = 400, H = 400;
  const cx = W * (0.4 + r() * 0.2);
  const cy = H * (0.4 + r() * 0.2);

  const items = Array.from({ length: petals }).map((_, i) => {
    const t = i / Math.max(1, petals - 1);
    const angle = (r() * Math.PI * 2);
    const dist  = composition === 'drift'
      ? (60 + t * 200 + r() * 60)
      : (40 + r() * 140);
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;
    const rx = 60 + r() * 110;
    const ry = 40 + r() * 70;
    const rot = composition === 'drift' ? (angle * 180 / Math.PI + 90) : (r() * 360);
    const fill = colors[i % colors.length];
    const opacity = 0.55 + r() * 0.4;
    return { px, py, rx, ry, rot, fill, opacity, idx: i };
  });

  const fid = `flb-${seed}-${petals}-${blur}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ display:'block', width:'100%', height:'100%', ...style }}
      aria-hidden="true"
    >
      <defs>
        <filter id={fid} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
      </defs>
      {/* base color = darkest color in palette, dimmed */}
      <rect width={W} height={H} fill={colors[colors.length - 1] || '#F1ECE2'} opacity="1" />
      <g filter={`url(#${fid})`}>
        {items.map(p => (
          <ellipse
            key={p.idx}
            cx={p.px} cy={p.py}
            rx={p.rx} ry={p.ry}
            fill={p.fill}
            opacity={p.opacity}
            transform={`rotate(${p.rot} ${p.px} ${p.py})`}
          />
        ))}
      </g>
    </svg>
  );
};

/* ── Predefined colorways ── */
const FLORAL_PALETTES = {
  forest:    ['#1A4D3A','#5E8C6E','#D4C5B0','#F1ECE2'],          // 墨绿森林
  celadon:   ['#A8C2A0','#D8E0D4','#F4EFE5','#6B8675'],          // 青瓷
  twilight:  ['#7C6090','#B89AC8','#E8A6B0','#5E8C6E','#F1ECE2'],// 暮色 (OpenAI 同款丁香+绿)
  rose:      ['#D89AA4','#E8C8B8','#A8C2A0','#F1ECE2'],          // 春樱
  inkDrift:  ['#0F362A','#2A5C49','#5E8C6E','#D4C5B0'],          // 墨绿单色
  porcelain: ['#C8D4CC','#E8DCC8','#F5F1EA','#A8B5B0'],          // 白瓷
  warmGreen: ['#5E8C6E','#C5B89A','#E8D9C8','#F4EFE5'],          // 暖绿陶土
  midnight:  ['#1A2D3A','#4A6075','#A8B8C8','#D4DCE3'],          // 夜空 (备选)
};

window.FloralBg = FloralBg;
window.FLORAL_PALETTES = FLORAL_PALETTES;
window.rng = rng;
