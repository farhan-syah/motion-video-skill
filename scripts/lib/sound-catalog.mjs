import { MATERIAL_ARCHETYPES, panGains, shapeFor, sweptNoise, travel } from './sound-synth.mjs';

// Sum of struck partials: [hz, amp, decay/s] triples starting at `at` seconds. attack: onset rate 1/s (2000 = 0.5 ms).
const partials = (list, at = 0, attack = 2000) => {
  const t = at ? `(t-${at})` : 't';
  const body = list.map(([hz, amp, decay]) => `sin(2*PI*${hz}*${t})*${amp}*exp(-${decay}*${t})`).join('+');
  return at ? `gte(t,${at})*(${body})*(1-exp(-${attack}*${t}))` : `(${body})*(1-exp(-${attack}*t))`;
};
// A soft bell note: fundamental plus two partials, with a 2 ms attack so a bright note never clicks in.
// ratio may be a token (R3) the renderer fills from the key.
const bell = (hz, ratio, at, amp, decay = 3.2) => partials([[`${hz}*${ratio}`, amp, decay], [`${hz}*${ratio}*2`, amp * 0.3, decay * 1.6], [`${hz}*${ratio}*3.01`, amp * 0.12, decay * 2.4]], at, 500);

// Motion sound effects, synthesized by ffmpeg. No third-party samples are used.
// A sound is a recipe plus parameters measured from the motion that makes it:
//   dur    - length of a sound that spans a move (swoosh, whoosh, riser, reverse)
//   pitch  - from the element's size: small things sound higher, big things lower
//   bright - from speed: a fast move sounds brighter
//   hits   - landing times of each child when a container is cued: one sound with one accent per landing
// Every sound keeps energy between 150 Hz and 5 kHz, so it reads on laptop and phone speakers, not only headphones.
//   dir    - horizontal travel of a spanning sound: 1 left to right, -1 right to left, 0 centered
//   crest  - where a slide is fastest, as a fraction of its length; the swell crests there
// Two-channel recipes ("left|right") pan with the motion.

// Static recipe fields: d (seconds), expr (aevalsrc), filter, anchor/peak/release when not 'start'.
// Dynamic recipes also carry make(params) returning those fields for a measured duration and brightness.
export const SOUNDS = {
  // UI bubble: a quick rising pop with a brief lip transient.
  pop: { tune: 'scale', base: 700, d: 0.12, expr: '(sin(2*PI*(700*t-350/90*(1-exp(-90*t))))*0.8+(random(0)-0.5)*exp(-400*t)*0.6)*exp(-45*t)*(1-exp(-1500*t))', filter: 'highpass=f=200,lowpass=f=4000' },
  // Paper edge and brief sheet rustle: irregular bands of noise, without a pitched body.
  // A cued container (a stack) becomes one shuffle: a soft rustle bed plus one flick per landing sheet.
  paper: {
    d: 0.22,
    expr: '(random(0)-0.5)*(0.65*exp(-pow((t-0.018)/0.012,2))+0.95*exp(-pow((t-0.068)/0.022,2))+0.55*exp(-pow((t-0.135)/0.027,2)))|(random(1)-0.5)*(0.55*exp(-pow((t-0.025)/0.017,2))+0.85*exp(-pow((t-0.082)/0.025,2))+0.5*exp(-pow((t-0.15)/0.025,2)))',
    filter: 'highpass=f=450,lowpass=f=5500',
    bed: 0.22,
  },
  // Dry mouse switch: two brief contacts with a small plastic body near 2.6 kHz, and no hiss above 6 kHz.
  click: { d: 0.085, expr: '(random(0)-0.5)*(exp(-850*t)+0.36*gte(t,0.043)*exp(-1100*(t-0.043)))', filter: 'highpass=f=700,equalizer=f=2600:t=q:w=1.2:g=5,lowpass=f=5500,lowpass=f=5500', fixedPitch: true },
  // Soft touch on glass: a rounded, low-key alternative to click.
  tap: { tune: 'scale', base: 680, d: 0.09, expr: '(sin(2*PI*680*t)*0.55+sin(2*PI*1360*t)*0.15+(random(0)-0.5)*0.35)*exp(-65*t)', filter: 'highpass=f=200,lowpass=f=3500' },
  // Mechanical key (Cherry MX Brown), fitted to 97 recorded keystrokes of the MIT-licensed Mechvibes pack.
  // Five layers of one mono noise source, each with the measured spectrum of its part of the keystroke:
  //   contact  - the finger reaching the keycap, 16 ms before the bottom-out, -23 dB
  //   snap     - the bright click at the instant of the bottom-out, 2-16 kHz, gone within 1.5 ms
  //   bottom   - the body of the bottom-out, arriving 0.8 ms after the snap, mostly 0.6-4.8 kHz
  //   tail     - the case ring after it: darker and low-heavy, fading out within about 100 ms
  //   release  - the key springing back, 130 ms after the bottom-out, -11 dB
  // Mono on purpose: a key is a point, and separate noise per channel smears the click into a wash.
  // The bottom-out lands on the cue. Gains and EQ come from a spectrum and envelope fit, not from ear.
  type: {
    d: 0.3,
    anchor: 'peak',
    peak: 0.016,
    fixedPitch: true,
    // Each variant is a different key on the plate: its own low-mid and mid color, as recorded keys differ by 5-8 dB there.
    variantEq: [
      '',
      'equalizer=f=650:t=q:w=0.8:g=6,equalizer=f=1500:t=q:w=0.8:g=-5',
      'equalizer=f=450:t=q:w=0.8:g=-6,equalizer=f=1100:t=q:w=0.8:g=5,equalizer=f=9000:t=q:w=0.8:g=-5',
      'equalizer=f=850:t=q:w=0.8:g=-5,equalizer=f=1800:t=q:w=0.8:g=5,equalizer=f=4500:t=q:w=0.8:g=-3',
    ],
    layers: [
      { expr: "(random(0)-0.5)*0.2033*exp(-500*t)", filter: "firequalizer=min_phase=on:delay=0.005:accuracy=60:gain_entry='entry(0,-6.1);entry(100,-6.1);entry(126,8);entry(159,8);entry(200,-11.72);entry(252,-30);entry(317,-8.92);entry(400,2.7);entry(504,-24.76);entry(635,-4.08);entry(800,-14.66);entry(1008,-8.86);entry(1270,8);entry(1600,-17.42);entry(2016,-2.3);entry(2540,-5.42);entry(3200,-5.96);entry(4032,-13.24);entry(5080,-15.08);entry(6400,-18.26);entry(8063,-16.88);entry(10159,-15.26);entry(12800,-19.22);entry(20000,-29.22)'" },
      { expr: "(random(0)-0.5)*1.3811*gte(t,0.016)*exp(-1012.5*(t-0.016))", filter: "firequalizer=min_phase=on:delay=0.005:accuracy=60:gain_entry='entry(0,-40);entry(100,-40);entry(126,-40);entry(159,-40);entry(200,-40);entry(252,-40);entry(317,-40);entry(400,-40);entry(504,-21.38);entry(635,-21.38);entry(800,-21.38);entry(1008,-4.95);entry(1270,-4.95);entry(1600,-4.95);entry(2016,4.71);entry(2540,4.71);entry(3200,4.71);entry(4032,-13.82);entry(5080,-13.82);entry(6400,-13.82);entry(8063,-13.39);entry(10159,-13.39);entry(12800,-26.39);entry(20000,-30.39)'" },
      { expr: "(random(0)-0.5)*1.2913*gte(t,0.016)*(0.85*exp(-437.58*(t-0.016))+0.15*exp(-130*(t-0.016)))*(1-exp(-1200*(t-0.016)))", filter: "firequalizer=min_phase=on:delay=0.005:accuracy=60:gain_entry='entry(0,-30);entry(100,-33);entry(126,-33);entry(159,-33);entry(200,-19.48);entry(252,-0.88);entry(317,5);entry(400,-30.58);entry(504,-10.48);entry(635,-12.24);entry(800,-2.18);entry(1008,8);entry(1270,4.98);entry(1600,0.48);entry(2016,-5.6);entry(2540,-2.26);entry(3200,-11.56);entry(4032,-7.38);entry(5080,-17.12);entry(6400,-19.98);entry(8063,-27.46);entry(10159,-22.86);entry(12800,-36);entry(20000,-40)'" },
      { expr: "(random(0)-0.5)*1.5815*gte(t,0.016)*(0.25*exp(-60*(t-0.016))+0.008*exp(-25*(t-0.016))*(1-0.95*gte(t,0.156)*min(1,(t-0.156)/0.04)))*(1-exp(-80*(t-0.016)))", filter: "firequalizer=min_phase=on:delay=0.005:accuracy=60:gain_entry='entry(0,8);entry(100,8);entry(126,-48);entry(159,-48);entry(200,-48);entry(252,-34.74);entry(317,6.04);entry(400,-48);entry(504,-7.54);entry(635,-21.56);entry(800,-13.38);entry(1008,-13.76);entry(1270,-11.52);entry(1600,-11.42);entry(2016,-13.22);entry(2540,-9.52);entry(3200,-12.44);entry(4032,-26.58);entry(5080,-30.18);entry(6400,-30.66);entry(8063,-27.06);entry(10159,-26.82);entry(12800,-39.96);entry(20000,-49.96)'" },
      { expr: "(random(0)-0.5)*0.2543*gte(t,0.146)*(exp(-595.1088*(t-0.146))+0.25*exp(-100*(t-0.146)))", filter: "firequalizer=min_phase=on:delay=0.005:accuracy=60:gain_entry='entry(0,-30);entry(100,-30);entry(126,-18.94);entry(159,-30);entry(200,-30);entry(252,-0.22);entry(317,-4.84);entry(400,-30);entry(504,-3.64);entry(635,-18.84);entry(800,-10.96);entry(1008,-9.86);entry(1270,8);entry(1600,2.02);entry(2016,-9.04);entry(2540,-1.4);entry(3200,-5.32);entry(4032,-22.72);entry(5080,-15.6);entry(6400,-20.62);entry(8063,-14.76);entry(10159,-15.56);entry(12800,-26.36);entry(20000,-36.36)'" },
    ],
  },
  tick: { d: 0.04, expr: '(sin(2*PI*3400*t)*0.55+sin(2*PI*1700*t)*0.25)*exp(-240*t)', filter: 'anull' },
  // Step marker or small notification: a quick upward chirp.
  blip: { tune: 'scale', base: 650, d: 0.14, expr: 'sin(2*PI*(650*t+900*t*t))*exp(-28*t)*0.55', filter: 'lowpass=f=4500' },
  // Sharp connection: pieces clicking together.
  snap: { d: 0.08, expr: '(random(0)-0.5)*exp(-95*t)*1.1+sin(2*PI*1700*t)*exp(-130*t)*0.3', filter: 'highpass=f=700,lowpass=f=5500,lowpass=f=7000' },
  // Slide. It spans the move, pans with its travel, and crests where the motion is fastest.
  // The band sweeps 500 Hz up to 1.8 kHz at the crest and back, scaled by speed.
  swoosh: {
    d: 0.32,
    anchor: 'peak',
    peak: 0.1,
    make: ({ dur = 0.32, bright = 1, dir = 1, crest = 0.315 }) => ({
      d: dur,
      peak: dur * crest,
      expr: travel(`pow(sin(PI*pow(t/${dur},${shapeFor(crest)})),2)`, Math.round(500 * bright), Math.round(1300 * bright), 0.7, 0.7, dur, dir),
      filter: 'highpass=f=150,lowpass=f=5000,lowpass=f=8000',
    }),
  },
  // Camera move or transition. It spans the move, pans with its travel, and crests where the motion is fastest.
  // The band sweeps 220 Hz up to about 1 kHz at the crest and back, scaled by speed.
  whoosh: {
    d: 0.7,
    anchor: 'peak',
    peak: 0.22,
    make: ({ dur = 0.7, bright = 1, dir = 1, crest = 0.315 }) => ({
      d: dur,
      peak: dur * crest,
      expr: travel(`pow(sin(PI*pow(t/${dur},${shapeFor(crest)})),3)`, Math.round(220 * bright), Math.round(800 * bright), 1.0, 0.8, dur, dir),
      filter: 'highpass=f=120,lowpass=f=4500,lowpass=f=7000',
    }),
  },
  // Anticipation before a cut: a reversed swell that ends on the cue.
  reverse: {
    d: 0.5,
    anchor: 'peak',
    peak: 0.47,
    release: 0.03,
    make: ({ dur = 0.5 }) => ({ d: dur, peak: dur - 0.03, release: 0.03, expr: `(sin(2*PI*880*t)*0.3+(random(0)-0.5)*0.65)*(t/${dur})^3`, filter: 'highpass=f=300,lowpass=f=6500' }),
  },
  // Object lands softly: a short dull body with a small pitch drop and a muffled contact. No ringing partials.
  // The 340 Hz partial keeps it on small speakers when a big element pitches it down to x0.8.
  thud: { d: 0.3, expr: 'sin(2*PI*(170*t+60/30*(1-exp(-30*t))))*exp(-28*t)*0.55+sin(2*PI*340*t)*exp(-36*t)*0.45+(random(0)-0.5)*exp(-60*t)*0.6', filter: 'highpass=f=80,lowpass=f=1500' },
  // Heavy landing: a falling thump, a short mid body, and a crack. Upper partials die fast, so it hits instead of
  // ringing like a gong. Small speakers keep about 70% of its energy.
  slam: { d: 0.45, expr: 'sin(2*PI*(75*t+150/22*(1-exp(-22*t))))*exp(-12*t)*0.22+sin(2*PI*(165*t+60/25*(1-exp(-25*t))))*exp(-18*t)*0.45+sin(2*PI*330*t)*exp(-28*t)*0.2+(random(0)-0.5)*(exp(-45*t)*1.3+exp(-12*t)*0.18)', filter: 'highpass=f=55,equalizer=f=900:t=q:w=1:g=4,lowpass=f=3500,lowpass=f=6000' },
  // Elastic settle: a boing. Pitch wobbles at 24 Hz and settles onto 320 Hz.
  spring: { tune: 'scale', base: 320, d: 0.55, expr: '(sin(2*PI*(320*t-0.7427*exp(-5*t)*cos(2*PI*24*t)))*0.7+sin(2*PI*2*(320*t-0.7427*exp(-5*t)*cos(2*PI*24*t)))*0.3+sin(2*PI*3*(320*t-0.7427*exp(-5*t)*cos(2*PI*24*t)))*0.1)*exp(-6*t)', filter: 'lowpass=f=3000' },
  // Highlight or polished reveal: a bell cluster on the tonic triad (major or minor third from the key), each partial
  // paired with a copy detuned 2-8 Hz, so it glimmers. The top partial fades first. Size never changes its pitch.
  shimmer: { tune: 'tonic', base: 1046.5, d: 1.1, expr: '((sin(2*PI*1046.5*t)+sin(2*PI*1048.5*t))*1.0*exp(-4.0*t)+(sin(2*PI*1046.5*R3*t)+sin(2*PI*(1046.5*R3+4)*t))*0.7*exp(-4.5*t)+(sin(2*PI*1568*t)+sin(2*PI*1574*t))*0.55*exp(-5.5*t)+(sin(2*PI*2093*t)+sin(2*PI*2101*t))*0.3*exp(-8.0*t))*(1-exp(-120*t))*0.25', filter: 'lowpass=f=7000', fixedPitch: true },
  ding: { tune: 'tonic', base: 1318.5, d: 1.4, expr: '(sin(2*PI*1318.5*t)*0.5+sin(2*PI*1975.5*t)*0.25+sin(2*PI*2637*t)*0.12)*exp(-3.2*t)*(1-exp(-400*t))', filter: 'anull', fixedPitch: true },
  // Positive result: a rising two-note chime.
  // The second note fades in over about 2 ms: a note that starts on a step clicks.
  success: { tune: 'tonic', base: 659.25, d: 0.65, expr: 'sin(2*PI*659.25*t)*exp(-12*t)*0.4+if(gte(t,0.11),sin(2*PI*987.77*(t-0.11))*exp(-9*(t-0.11))*(1-exp(-600*(t-0.11)))*0.45,0)', filter: 'lowpass=f=5000', fixedPitch: true },
  // Failure state: a short dissonant buzz.
  error: {
    tune: 'tonic',
    base: 220,
    d: 0.34,
    // Two short buzzes: odd harmonics for the buzz, a partner a semitone up for the rough beat that reads as wrong.
    expr: [0, 0.16].map((at) => `between(t,${at},${at + 0.13})*sin(PI*(t-${at})/0.13)*(sin(2*PI*220*t)+sin(2*PI*233.08*t)*0.5+sin(2*PI*660*t)*0.3+sin(2*PI*1100*t)*0.15)`).join('+'),
    filter: 'lowpass=f=2500',
    fixedPitch: true,
  },
  // Exit or collapse: a falling tone.
  downer: { tune: 'scale', base: 220, d: 0.7, expr: 'sin(2*PI*(110*t+12*(1-exp(-8*t))))*exp(-6*t)*0.14+sin(2*PI*(220*t+24*(1-exp(-8*t))))*exp(-7*t)*0.42+sin(2*PI*(330*t+36*(1-exp(-8*t))))*exp(-8*t)*0.22+(random(0)-0.5)*exp(-10*t)*0.3', filter: 'lowpass=f=2800' },
  // Build before a reveal. Its crest lands on the cue. data-sfx-dur sets how long it builds.
  riser: {
    d: 1.6,
    anchor: 'peak',
    peak: 1.52,
    release: 0.08,
    make: ({ dur = 1.6 }) => ({
      d: dur,
      peak: dur - 0.08,
      release: 0.08,
      // Noise through a lowpass that opens from 600 Hz toward 5 kHz as it builds, plus a soft rising tone. No hiss on top.
      expr: `(${sweptNoise(`(600+4500*pow(t/${dur},2))`, 1.4, 'low')})*pow(t/${dur},2.2)+sin(2*PI*(200*t+300*t*t/${dur}))*0.15*pow(t/${dur},2)`,
      filter: 'highpass=f=250,lowpass=f=7000,lowpass=f=9000',
    }),
  },
  // The one biggest reveal: a falling sub and low thump, harmonics that small speakers can play and that decay faster
  // the higher they sit, and a noise crack with a faint tail. Tuned to feel large at any size.
  boom: { d: 1.4, expr: 'sin(2*PI*(45*t+70/6*(1-exp(-6*t))))*exp(-3.5*t)*0.25+sin(2*PI*(90*t+140/8*(1-exp(-8*t))))*exp(-6*t)*0.25+sin(2*PI*180*t)*exp(-7*t)*0.5+sin(2*PI*270*t)*exp(-9*t)*0.35+sin(2*PI*360*t)*exp(-12*t)*0.2+sin(2*PI*540*t)*exp(-16*t)*0.08+(random(0)-0.5)*(exp(-14*t)*1.1+exp(-3*t)*0.07)', filter: 'lowpass=f=2800,lowpass=f=4500', fixedPitch: true },

  // --- Expanded catalog. Tonal recipes are written in C: `tune` moves them onto the video's key. ---
  // A plucked string: eight harmonics, the higher ones dying first, over a short pick noise.
  pluck: {
    tune: 'scale',
    base: 330,
    d: 0.7,
    expr: `${partials([1, 2, 3, 4, 5, 6, 7, 8].map((k) => [330 * k, (1 / k).toFixed(3), (4 + 2.5 * k).toFixed(1)]))}+(${sweptNoise(2500, 1.2)})*0.3*exp(-700*t)`,
    filter: 'highpass=f=120,lowpass=f=5000',
  },
  // Pen or marker on paper. It spans the stroke: a band of friction noise pulsing at an uneven hand rhythm.
  draw: {
    d: 0.6,
    make: ({ dur = 0.6 }) => {
      const stroke = '(0.55+0.45*sin(2*PI*(6.5*t+0.9*sin(2*PI*1.7*t))))';
      return { d: dur, expr: `(${sweptNoise(`(1800+600*${stroke})`, 1.1)})*pow(sin(PI*t/${dur}),0.6)*${stroke}`, filter: 'highpass=f=600,lowpass=f=5000,lowpass=f=7000' };
    },
  },
  // Zipper: teeth pass faster and faster across the move.
  zip: {
    d: 0.5,
    make: ({ dur = 0.5 }) => ({ d: dur, expr: `(${sweptNoise(2300, 0.9)})*(0.25+exp(-7*mod(40*t+50*t*t/${dur},1)))*(1-exp(-40*t))`, filter: 'highpass=f=800,lowpass=f=5000,lowpass=f=7000' }),
  },
  // Switch on: a contact, then a rising fourth that lands on the tonic.
  'toggle-on': { tune: 'tonic', base: 1046.5, d: 0.16, fixedPitch: true, expr: `(random(0)-0.5)*exp(-1500*t)*0.5+${partials([[697.66, 0.45, 45]])}+${partials([[1046.5, 0.55, 30]], 0.035)}`, filter: 'highpass=f=200,lowpass=f=6000' },
  // Switch off: a contact, then the tonic falling a fourth.
  'toggle-off': { tune: 'tonic', base: 1046.5, d: 0.16, fixedPitch: true, expr: `(random(0)-0.5)*exp(-1500*t)*0.5+${partials([[1046.5, 0.45, 45]])}+${partials([[697.66, 0.5, 30]], 0.035)}`, filter: 'highpass=f=200,lowpass=f=6000' },
  // A list flicked or scrolled: a brief swish, then six detents ticking past and slowing.
  flick: {
    d: 0.24,
    expr: `(${sweptNoise('(1200+1400*sin(PI*min(1,t/0.1)))', 0.9)})*pow(sin(PI*min(1,t/0.1)),2)*0.5+${[0.03, 0.055, 0.082, 0.112, 0.146, 0.185].map((at, i) => `gte(t,${at})*exp(-700*(t-${at}))*(sin(2*PI*1900*(t-${at}))+sin(2*PI*3100*(t-${at}))*0.4)*${(0.9 - 0.12 * i).toFixed(2)}`).join('+')}`,
    filter: 'highpass=f=400,lowpass=f=6000',
    fixedPitch: true,
  },
  // Dragging something across a surface: friction that follows the move and pans with it. A grain held for 3 ms at a
  // time roughens it into a scrape, which is what separates a drag from air moving.
  drag: {
    d: 0.6,
    make: ({ dur = 0.6, dir = 1 }) => {
      const [l, r] = panGains(0.5, dur, dir);
      const m = `if(eq(mod(n,144),0),st(5,random(0)),0);(${sweptNoise('(300+250*sin(PI*t/' + dur + '))', 1.4)})*pow(sin(PI*t/${dur}),1.2)*(0.35+0.65*ld(5))`;
      return { d: dur, expr: `${m}*${l}|${m}*${r}`, filter: 'highpass=f=150,lowpass=f=3500,lowpass=f=6000' };
    },
  },
  // Camera shutter: two mechanical contacts 75 ms apart over a small body.
  shutter: { d: 0.2, fixedPitch: true, expr: `(${sweptNoise(2400, 1.6)})*(exp(-700*t)*0.9+gte(t,0.075)*exp(-500*(t-0.075))*1.1)+sin(2*PI*420*t)*exp(-60*t)*0.2`, filter: 'highpass=f=300,lowpass=f=7000' },
  // Digital glitch: three stuttering bursts of held random pitch and coarse noise.
  glitch: {
    d: 0.28,
    expr: 'if(eq(mod(n,240),0),st(5,random(0)),0);(sgn(sin(2*PI*(300+900*ld(5))*t))*0.3+floor((random(0)-0.5)*6)/6*0.45)*(between(t,0,0.07)+between(t,0.1,0.14)+between(t,0.18,0.26))',
    filter: 'highpass=f=200,lowpass=f=4500,lowpass=f=6000',
    fixedPitch: true,
  },
  // A number rolling up: ticks start fast and slow down as the count settles.
  ticker: {
    d: 1,
    make: ({ dur = 1 }) => ({ d: dur, expr: `(sin(2*PI*2000*t)*0.6+(random(0)-0.5)*0.5)*exp(-14*mod(30*t-12*t*t/${dur},1))*(1-exp(-400*t))`, filter: 'highpass=f=600,lowpass=f=6000' }),
  },
  // A coin landing: bright inharmonic ring, then a small bounce.
  coin: {
    d: 0.7,
    expr: (() => {
      const modes = [[1, 1], [1.47, 0.7], [2.09, 0.6], [2.56, 0.4], [3.14, 0.3]].map(([r, a], k) => [(1500 * r).toFixed(1), a, (6 * (1 + 0.4 * k)).toFixed(1)]);
      return `${partials(modes)}*0.5+${partials(modes, 0.11)}*0.18+(${sweptNoise(4000, 1)})*0.25*exp(-1500*t)`;
    })(),
    filter: 'highpass=f=300,lowpass=f=7000',
    fixedPitch: true,
  },
  // A water drop: a fast rising bloop.
  drop: { tune: 'scale', base: 900, d: 0.22, expr: 'sin(2*PI*(900*t+810*(t-(1-exp(-40*t))/40)))*exp(-28*t)*(1-exp(-2500*t))*0.8', filter: 'highpass=f=250,lowpass=f=5000' },
  // Sub drop: a falling low tone. Its harmonics carry the fall on small speakers, which cannot play the fundamental.
  subdrop: {
    d: 1.3,
    expr: `(${[[1, 0.3], [2, 0.45], [3, 0.5], [4, 0.45], [5, 0.35], [6, 0.25]].map(([k, a]) => `sin(2*PI*${k}*(38*t+24*(1-exp(-3*t))))*${a}`).join('+')})*exp(-2.2*t)*(1-exp(-150*t))*0.5`,
    filter: 'lowpass=f=2000',
    fixedPitch: true,
  },
  // Cinematic hit ("braam"): a brassy chord of root, fifth and octave over a small sub an octave down.
  // Upper harmonics fade first.
  hit: {
    tune: 'tonic',
    base: 130.81,
    d: 1.6,
    fixedPitch: true,
    expr: `(${[[0.5, 0.35], [1, 1], [1.5, 0.8], [2, 0.7]].flatMap(([n, w]) => [1, 2, 3, 4, 5, 6, 7, 8].map((k) => `sin(2*PI*${(130.81 * n * k).toFixed(2)}*t)*${((0.9 * w) / k).toFixed(3)}*exp(-${(0.4 * k).toFixed(1)}*t)`)).join('+')})*(1-exp(-60*t))*exp(-2.2*t)*0.22+(${sweptNoise(900, 1.2)})*0.6*exp(-25*t)`,
    filter: 'highpass=f=45,lowpass=f=2500',
  },
  // Logo sting: a four-note bell arpeggio up the tonic triad to the octave.
  sting: { tune: 'tonic', base: 523.25, d: 1.5, fixedPitch: true, expr: [bell(523.25, 1, 0, 0.8), bell(523.25, 'R3', 0.09, 0.7), bell(523.25, 1.5, 0.18, 0.7), bell(523.25, 2, 0.3, 0.9)].join('+'), filter: 'lowpass=f=6000' },
  // Warning: a soft two-tone alert, a minor third down, played twice.
  warning: {
    tune: 'tonic',
    base: 880,
    d: 0.62,
    fixedPitch: true,
    expr: [[0, 880], [0.13, 740], [0.3, 880], [0.43, 740]].map(([at, hz]) => `between(t,${at},${at + 0.11})*sin(PI*(t-${at})/0.11)*(sin(2*PI*${hz}*t)+sin(2*PI*${hz * 2}*t)*0.2)*0.5`).join('+'),
    filter: 'lowpass=f=3500',
  },
  // Rubber stamp: a pressed body, a wooden knock and the paper cracking, then the stamp lifting off with a small
  // sticky contact 180 ms later.
  stamp: { d: 0.4, expr: `sin(2*PI*(175*t+50/25*(1-exp(-25*t))))*exp(-22*t)*0.6+sin(2*PI*420*t)*exp(-45*t)*0.3+(${sweptNoise(2600, 1.0)})*(exp(-120*t)*0.7+gte(t,0.18)*exp(-160*(t-0.18))*0.35)+gte(t,0.18)*sin(2*PI*900*(t-0.18))*exp(-90*(t-0.18))*0.12`, filter: 'highpass=f=80,lowpass=f=6000' },
  // Jelly or squishy wobble: slower and wider than spring, with a wet squelch.
  jelly: { tune: 'scale', base: 240, d: 0.6, expr: `(sin(2*PI*(240*t-1.061*exp(-4*t)*cos(2*PI*9*t)))+sin(2*PI*2*(240*t-1.061*exp(-4*t)*cos(2*PI*9*t)))*0.35)*exp(-5*t)*(1-exp(-400*t))*0.7+(${sweptNoise(700, 1.5)})*exp(-30*t)*0.25`, filter: 'lowpass=f=3000' },
  // Spin: air around a rotating object, pulsing and circling between the ears at 7 turns a second.
  spin: {
    d: 0.8,
    make: ({ dur = 0.8 }) => {
      const m = `(${sweptNoise(`(900+500*pow(sin(PI*t/${dur}),2))`, 0.9)})*pow(sin(PI*t/${dur}),1.5)*(0.55+0.45*sin(2*PI*7*t))`;
      return { d: dur, expr: `${m}*(0.65+0.3*sin(2*PI*7*t))|${m}*(0.65-0.3*sin(2*PI*7*t))`, filter: 'highpass=f=200,lowpass=f=5000,lowpass=f=8000' };
    },
  },
  // Tension drone: root, fifth and octave, each a beating pair, swelling and brightening into the cue.
  drone: {
    tune: 'tonic',
    base: 130.81,
    fixedPitch: true,
    d: 2,
    anchor: 'peak',
    peak: 1.85,
    release: 0.15,
    make: ({ dur = 2 }) => ({
      d: dur,
      peak: dur - 0.15,
      release: 0.15,
      expr: `(${[1, 1.5, 2].flatMap((n) => [1, 2, 3, 4].map((k) => `(sin(2*PI*${(130.81 * n * k).toFixed(2)}*t)+sin(2*PI*${(130.81 * n * k + 0.6).toFixed(2)}*t))*${(0.5 / k).toFixed(3)}*pow(t/${dur},${(0.4 * k).toFixed(1)})`)).join('+')})*pow(t/${dur},1.3)*0.25`,
      filter: 'highpass=f=60,lowpass=f=3000',
    }),
  },
};

// Intent tags describe the visible event. The policy reads this table for every effect.
//   says    - what a listener names the sound. The developer review (scripts/dev/sound-review.py) checks that an
//             audio-text model hears it as that.
//   space   - share sent to the room (0 = bone dry). Mechanical UI stays dry; physical and cinematic sounds breathe.
//   feather - onset fade in ms. Noisy textures ease in instead of starting on a hard edge; clicks keep their snap.
//   level   - natural loudness in dB against the boom (0). A tick is small and a slam is big; a keyboard sits under
//             UI hits, as it does in a room. The spread stays within 12 dB: wider, and the quiet scenes of a video
//             drop out of hearing while the payoff holds the whole mix down.
export const SOUND_META = {
  pop: { says: 'a short soft pop bubble sound', intents: ['appearance', 'bubble', 'badge', 'avatar'], texture: 'tone', transient: true, space: 0.22, feather: 2, level: -6 },
  paper: { says: 'paper sheets rustling', intents: ['paper', 'sheet', 'page'], texture: 'noise', transient: true, space: 0.3, feather: 8, level: -7 },
  click: { says: 'a computer mouse click', intents: ['mouse-click', 'button-press'], texture: 'noise', transient: true, space: 0.06, feather: 0.5, level: -8 },
  tap: { says: 'a soft finger tap on glass', intents: ['touch'], texture: 'tone', transient: true, space: 0.08, feather: 1, level: -9 },
  type: { says: 'a mechanical keyboard keystroke', intents: ['typing'], texture: 'mixed', transient: false, space: 0.05, feather: 0.5, level: -12 },
  tick: { says: 'a short clock tick', intents: ['counter', 'checkmark', 'toggle'], texture: 'tone', transient: true, space: 0.06, feather: 0.5, level: -10 },
  blip: { says: 'a short rising notification blip', intents: ['notification', 'step'], texture: 'tone', transient: true, space: 0.2, feather: 2, level: -8 },
  snap: { says: 'a sharp plastic snap click', intents: ['connection', 'dock'], texture: 'noise', transient: true, space: 0.1, feather: 0.5, level: -6 },
  swoosh: { says: 'a fast swoosh of something sliding past', intents: ['slide'], texture: 'noise', transient: false, space: 0.35, feather: 10, level: -5 },
  whoosh: { says: 'a whoosh of air passing by', intents: ['camera', 'transition'], texture: 'noise', transient: false, space: 0.45, feather: 15, level: -3 },
  reverse: { says: 'a reversed cymbal swell', intents: ['anticipation'], texture: 'mixed', transient: false, space: 0.4, feather: 20, level: -4 },
  thud: { says: 'a soft thud of an object landing', intents: ['soft-impact'], texture: 'mixed', transient: true, space: 0.25, feather: 3, level: -4 },
  slam: { says: 'a heavy door slam impact', intents: ['stamp', 'heavy-impact'], texture: 'mixed', transient: true, space: 0.3, feather: 1, level: -1 },
  spring: { says: 'a springy boing sound', intents: ['elastic'], texture: 'tone', transient: true, space: 0.2, feather: 2, level: -6 },
  shimmer: { says: 'a bright magical sparkle chime', intents: ['highlight'], texture: 'tone', transient: true, space: 0.5, feather: 6, level: -6 },
  ding: { says: 'a bell ding', intents: ['confirmation'], texture: 'tone', transient: true, space: 0.35, feather: 1, level: -7 },
  success: { says: 'a positive success chime', intents: ['success'], texture: 'tone', transient: true, space: 0.35, feather: 2, level: -6 },
  error: { says: 'an error buzzer', intents: ['error'], texture: 'tone', transient: true, space: 0.15, feather: 2, level: -6 },
  downer: { says: 'a falling descending tone', intents: ['exit', 'collapse'], texture: 'tone', transient: true, space: 0.35, feather: 6, level: -5 },
  riser: { says: 'a rising tension build-up riser', intents: ['build', 'reveal'], texture: 'noise', transient: false, space: 0.45, feather: 40, level: -3 },
  boom: { says: 'a deep cinematic boom', intents: ['deep-impact', 'rumble'], texture: 'mixed', transient: true, space: 0.55, feather: 2, level: 0 },
  pluck: { says: 'a plucked guitar string', intents: ['pluck', 'string'], texture: 'tone', transient: true, space: 0.25, feather: 1, level: -7 },
  draw: { says: 'a pen scribbling on paper', intents: ['draw', 'write', 'scribble', 'underline', 'sign'], texture: 'noise', transient: false, space: 0.1, feather: 20, level: -10 },
  zip: { says: 'a zipper being zipped', intents: ['zip'], texture: 'noise', transient: false, space: 0.1, feather: 5, level: -8 },
  'toggle-on': { says: 'a switch turning on', intents: ['toggle-on', 'switch-on', 'enable'], texture: 'tone', transient: true, space: 0.08, feather: 0.5, level: -9 },
  'toggle-off': { says: 'a switch turning off', intents: ['toggle-off', 'switch-off', 'disable'], texture: 'tone', transient: true, space: 0.08, feather: 0.5, level: -9 },
  flick: { says: 'a quick flick scroll swipe', intents: ['scroll', 'flick', 'swipe'], texture: 'mixed', transient: true, space: 0.15, feather: 3, level: -8 },
  drag: { says: 'something dragged across a table', intents: ['drag', 'push'], texture: 'noise', transient: false, space: 0.2, feather: 20, level: -8 },
  shutter: { says: 'a camera shutter click', intents: ['shutter', 'screenshot', 'capture'], texture: 'noise', transient: true, space: 0.12, feather: 0.5, level: -7 },
  glitch: { says: 'a digital glitch stutter', intents: ['glitch', 'corrupt', 'digital-error'], texture: 'mixed', transient: true, space: 0.15, feather: 0.5, level: -6 },
  ticker: { says: 'a fast ticking counter', intents: ['count-up', 'number-roll'], texture: 'mixed', transient: false, space: 0.06, feather: 0.5, level: -11 },
  coin: { says: 'a coin dropping on a table', intents: ['coin', 'money', 'payment'], texture: 'tone', transient: true, space: 0.35, feather: 1, level: -7 },
  drop: { says: 'a water droplet', intents: ['droplet', 'water', 'liquid'], texture: 'tone', transient: true, space: 0.3, feather: 1, level: -8 },
  subdrop: { says: 'a deep bass drop', intents: ['sub-drop', 'bass-drop'], texture: 'mixed', transient: true, space: 0.4, feather: 10, level: -2 },
  hit: { says: 'a cinematic brass braam hit', intents: ['cinematic-hit', 'title-hit', 'braam'], texture: 'mixed', transient: true, space: 0.5, feather: 3, level: -1 },
  sting: { says: 'a short four-note chime sting', intents: ['sting', 'chime'], texture: 'tone', transient: true, space: 0.45, feather: 1, level: -4 },
  warning: { says: 'a warning alert tone', intents: ['warning', 'caution', 'alert'], texture: 'tone', transient: true, space: 0.2, feather: 2, level: -7 },
  stamp: { says: 'a rubber stamp pressed on paper', intents: ['stamp', 'approve', 'seal'], texture: 'mixed', transient: true, space: 0.25, feather: 1, level: -2 },
  jelly: { says: 'a squishy jelly wobble', intents: ['jelly', 'wobble', 'squish'], texture: 'tone', transient: true, space: 0.2, feather: 2, level: -6 },
  spin: { says: 'something spinning through the air', intents: ['spin', 'rotate', 'twirl'], texture: 'noise', transient: false, space: 0.35, feather: 20, level: -6 },
  drone: { says: 'a tense suspense drone', intents: ['tension', 'drone', 'suspense'], texture: 'mixed', transient: false, space: 0.5, feather: 60, level: -5 },
};

// Sounds whose length follows the move. The rest are fixed-length hits whose pitch follows size.
// span: shortest and longest length in seconds. pans: follows the element sideways. crest: peaks on the fastest frame.
// withMove: starts when the move starts (a stroke, a zip, a count). Risers, reverses and drones build into the cue.
export const SPAN = {
  swoosh: { span: [0.18, 1.4], pans: true, crest: true },
  whoosh: { span: [0.18, 1.4], pans: true, crest: true },
  reverse: { span: [0.18, 1.4] },
  riser: { span: [0.18, 4] },
  drone: { span: [0.5, 6] },
  draw: { span: [0.2, 4], withMove: true },
  zip: { span: [0.2, 1.5], withMove: true },
  drag: { span: [0.2, 2], pans: true, withMove: true },
  ticker: { span: [0.3, 4], withMove: true },
  spin: { span: [0.2, 2], withMove: true },
};
export const SPANNING = new Set(Object.keys(SPAN));

// The contacts a material recolors (see MATERIALS in sound-synth.mjs).
export const MATERIAL_AWARE = new Set(Object.keys(MATERIAL_ARCHETYPES));

// The pitch range that element size, or data-sfx-pitch, can move a sound across. `sounds` checks both ends.
export const PITCH_RANGE = [0.8, 1.25];
