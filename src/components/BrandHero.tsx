function PineTree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x={-4} y={30} width="8" height="14" rx="2" fill="#6b4a2b" />
      <path d="M 0 -34 L 20 6 L -20 6 Z" fill="#1f4d2e" />
      <path d="M 0 -18 L 24 18 L -24 18 Z" fill="#245b35" />
      <path d="M 0 -2 L 27 32 L -27 32 Z" fill="#2c6b40" />
    </g>
  );
}

function Bush({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="0" cy="0" r="16" fill="#2c6b40" />
      <circle cx="-13" cy="7" r="12" fill="#2c6b40" />
      <circle cx="14" cy="8" r="11" fill="#2c6b40" />
    </g>
  );
}

function Rock({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="8" rx="20" ry="9" fill="#a9b3ad" />
      <ellipse cx="16" cy="10" rx="11" ry="6" fill="#909c94" />
    </g>
  );
}

function Flower({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="#fbfdf6">
      <circle cx="0" cy="-5" r="3.2" />
      <circle cx="5" cy="0" r="3.2" />
      <circle cx="0" cy="5" r="3.2" />
      <circle cx="-5" cy="0" r="3.2" />
      <circle cx="0" cy="0" r="2.6" fill="#e8b94a" />
    </g>
  );
}

export default function BrandHero() {
  return (
    <svg viewBox="0 0 600 800" className="w-full h-full" preserveAspectRatio="xMidYMax slice" role="img" aria-hidden="true">
      <title>A winding trail leading up a twin-peaked mountain</title>
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eafaf0" />
          <stop offset="100%" stopColor="#dcf1e2" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="600" height="800" fill="url(#skyGrad)" />

      {/* clouds */}
      <g fill="#ffffff" opacity="0.75">
        <ellipse cx="110" cy="95" rx="55" ry="20" />
        <ellipse cx="155" cy="84" rx="38" ry="17" />
        <ellipse cx="480" cy="130" rx="46" ry="18" />
        <ellipse cx="518" cy="122" rx="30" ry="14" />
      </g>

      {/* faint back peaks */}
      <path d="M -20 420 L 60 300 L 150 420 Z" fill="#bfe0da" opacity="0.7" />
      <path d="M 460 400 L 545 270 L 630 400 Z" fill="#bfe0da" opacity="0.7" />

      {/* mid green foothill peak (right) */}
      <path d="M 340 460 L 470 260 L 610 460 Z" fill="#63b57f" />

      {/* main twin-peak mountain — solid flat fill, no gradient/snowcap */}
      <path
        d="M -10 560 L 130 330 L 195 400 L 300 190 L 410 400 L 470 340 L 600 560 Z"
        fill="#245b35"
      />

      {/* meadow foreground */}
      <path d="M -20 800 L -20 560 C 120 480, 260 500, 300 560 C 360 500, 480 480, 620 560 L 620 800 Z" fill="#63b57f" />

      {/* winding trail — solid ribbon, no dash, matching the reference exactly */}
      <path
        d="M 300 800 C 288 730, 350 705, 330 645 C 312 595, 250 585, 262 525 C 272 480, 340 465, 320 410 C 308 375, 275 360, 285 320"
        fill="none"
        stroke="#dfc98a"
        strokeWidth="30"
        strokeLinecap="round"
      />
      <path
        d="M 300 800 C 288 730, 350 705, 330 645 C 312 595, 250 585, 262 525 C 272 480, 340 465, 320 410 C 308 375, 275 360, 285 320"
        fill="none"
        stroke="#c2a866"
        strokeWidth="30"
        strokeLinecap="round"
        opacity="0.18"
        transform="translate(4,4)"
      />

      {/* pines along the tree line */}
      <PineTree x={95} y={640} scale={1.1} />
      <PineTree x={150} y={690} scale={0.9} />
      <PineTree x={70} y={720} scale={0.8} />
      <PineTree x={480} y={610} scale={1.05} />
      <PineTree x={535} y={660} scale={0.85} />
      <PineTree x={430} y={700} scale={0.75} />

      {/* bare decorative sapling */}
      <g stroke="#3a4a3f" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M 400 760 L 398 705" />
        <path d="M 398 720 L 385 705" />
        <path d="M 398 730 L 412 715" />
        <path d="M 398 712 L 388 698" />
      </g>

      {/* bushes + rocks */}
      <Bush x={180} y={745} scale={1.1} />
      <Bush x={440} y={760} scale={0.9} />
      <Rock x={70} y={770} scale={1.3} />
      <Rock x={555} y={740} scale={1} />

      {/* flowers */}
      <Flower x={220} y={765} />
      <Flower x={405} y={775} />
      <Flower x={165} y={655} />
      <Flower x={490} y={700} />
    </svg>
  );
}
