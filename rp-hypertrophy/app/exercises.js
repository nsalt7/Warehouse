// Exercise library and per-muscle weekly volume landmarks.
//
// Field notes (used by the progression engine — full citations in engine.js):
// - type: 'compound' | 'isolation' — drives RIR targets, load increments, rest.
// - region: 'upper' | 'lower' — drives load increment size.
// - envs: which training environments can run it — 'gym', 'calisthenics'
//   (outdoor bar park: pull-up bar, dip bars, benches), 'home' (floor, a wall,
//   a sturdy chair/table; no purchased equipment). Bodyweight training grows
//   muscle like barbell training when effort is matched: progressive push-up
//   variants matched bench press for strength/size (Kotarsky 2018, JSCR;
//   Kikuchi & Nakazato 2017, J Exerc Sci Fit) and effort-matched push-ups gave
//   equivalent strength gains (Calatayud 2015, JSCR).
// - next: the harder variation in a calisthenics progression chain. When a
//   bodyweight movement tops its rep window on all sets, the engine advances
//   to `next` instead of adding plates (load and rep progression are
//   interchangeable at matched effort — Plotkin 2022, PeerJ; loads down to
//   ~30% 1RM grow muscle when near failure — Schoenfeld 2021, Sports).
// - lengthened: loads the target muscle at long lengths — ranked first
//   (Maeo 2021 MSSE; Maeo 2023 EJSS; Pedrosa 2022 EJSS; Kassiano 2023 JSCR).
// - secondary: muscles getting meaningful indirect work; counts 0.5 set each
//   (fractional-set convention — Baz-Valle 2019/2022).
// - stress: joint/structure demands used to flag or swap movements for users
//   who told onboarding they need to train around something. Descriptive
//   programming metadata, not medical advice.

export const MUSCLES = [
  'chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders',
  'biceps', 'triceps', 'calves', 'abs', 'traps', 'forearms',
];

export const ENVIRONMENTS = [
  { id: 'gym', label: 'Gym', blurb: 'Barbells, dumbbells, machines, cables.' },
  { id: 'calisthenics', label: 'Calisthenics', blurb: 'Bar park: pull-up bar, dip bars, your bodyweight.' },
  { id: 'home', label: 'Home', blurb: 'No equipment — floor, wall, and a sturdy chair.' },
];

// Conditions offered at onboarding, mapped to the stress tags they exclude.
export const CONDITIONS = [
  { id: 'spine', label: 'Lower-back issues', excludes: 'spine' },
  { id: 'knee', label: 'Knee issues', excludes: 'knee' },
  { id: 'shoulder', label: 'Shoulder issues', excludes: 'shoulder' },
  { id: 'elbow', label: 'Elbow or wrist issues', excludes: 'elbow' },
];

// Weekly hard-set landmarks per muscle. Direction is evidence-backed, exact
// values are convention inside the evidence band:
// - startVolume ~8-12: gains are clear by 10+ sets/week (Schoenfeld 2017,
//   J Sports Sci dose-response meta) and most benefit is captured by the low
//   teens (Pelland 2025, Sports Med meta-regression; Baz-Valle 2022, J Hum
//   Kinet: 12-20 sets optimal).
// - maxVolume caps sit well below the ~30 sets/week point where the marginal
//   benefit approaches zero (Pelland 2025), lower for small muscles that
//   collect heavy indirect work.
export const VOLUME_LANDMARKS = {
  chest: { startVolume: 10, maxVolume: 22 },
  back: { startVolume: 12, maxVolume: 25 },
  quads: { startVolume: 10, maxVolume: 22 },
  hamstrings: { startVolume: 6, maxVolume: 16 },
  glutes: { startVolume: 6, maxVolume: 18 },
  shoulders: { startVolume: 10, maxVolume: 22 },
  biceps: { startVolume: 8, maxVolume: 20 },
  triceps: { startVolume: 8, maxVolume: 18 },
  calves: { startVolume: 8, maxVolume: 16 },
  abs: { startVolume: 6, maxVolume: 16 },
  traps: { startVolume: 4, maxVolume: 12 },
  forearms: { startVolume: 4, maxVolume: 12 },
};

// Rep windows are practicality, not magic zones: hypertrophy is similar from
// ~30-85%+ 1RM (≈5-30 reps) when sets end near failure (Schoenfeld 2021,
// Sports; Lopez 2021, MSSE). Windows are 4 reps wide for loaded lifts so one
// jump lands back inside the window (Plotkin 2022); bodyweight windows are
// wider because reps are the only dial between variations.
let nextId = 1;
function ex(muscle, name, opts) {
  const {
    equipment, type, region, reps, lengthened = false, secondary = [],
    envs = ['gym'], stress = [], next = null,
  } = opts;
  return { id: nextId++, muscle, name, equipment, type, region, repRange: reps, lengthened, secondary, envs, stress, next };
}
const C = 'compound', I = 'isolation', U = 'upper', L = 'lower';
const GYM = ['gym'], CAL = ['calisthenics'], ALL = ['gym', 'calisthenics', 'home'];
const GC = ['gym', 'calisthenics'], CH = ['calisthenics', 'home'];

export const EXERCISES = [
  // ----- chest -----
  ex('chest', 'Barbell Bench Press', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['triceps', 'shoulders'], stress: ['shoulder'] }),
  ex('chest', 'Incline Barbell Press', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['triceps', 'shoulders'], stress: ['shoulder'] }),
  ex('chest', 'Dumbbell Bench Press', { equipment: 'dumbbell', type: C, region: U, reps: [8, 12], lengthened: true, secondary: ['triceps', 'shoulders'] }),
  ex('chest', 'Incline Dumbbell Press', { equipment: 'dumbbell', type: C, region: U, reps: [8, 12], lengthened: true, secondary: ['triceps', 'shoulders'] }),
  ex('chest', 'Machine Chest Press', { equipment: 'machine', type: C, region: U, reps: [8, 12], secondary: ['triceps', 'shoulders'] }),
  ex('chest', 'Weighted Dip', { equipment: 'bodyweight', type: C, region: U, reps: [6, 10], lengthened: true, secondary: ['triceps'], envs: GC, stress: ['shoulder'] }),
  ex('chest', 'Pec Deck', { equipment: 'machine', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('chest', 'Cable Fly (Mid)', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('chest', 'Cable Fly (Low-to-High)', { equipment: 'cable', type: I, region: U, reps: [12, 16] }),
  ex('chest', 'Incline Push-Up', { equipment: 'bodyweight', type: C, region: U, reps: [10, 18], secondary: ['triceps', 'shoulders'], envs: ALL, next: 'Push-Up' }),
  ex('chest', 'Push-Up', { equipment: 'bodyweight', type: C, region: U, reps: [8, 15], secondary: ['triceps', 'shoulders'], envs: ALL, next: 'Deficit Push-Up' }),
  ex('chest', 'Deficit Push-Up', { equipment: 'bodyweight', type: C, region: U, reps: [8, 15], lengthened: true, secondary: ['triceps', 'shoulders'], envs: ALL, next: 'Archer Push-Up' }),
  ex('chest', 'Archer Push-Up', { equipment: 'bodyweight', type: C, region: U, reps: [6, 12], lengthened: true, secondary: ['triceps', 'shoulders'], envs: ALL }),
  ex('chest', 'Bar Dip', { equipment: 'bodyweight', type: C, region: U, reps: [6, 12], lengthened: true, secondary: ['triceps'], envs: CAL, stress: ['shoulder'] }),
  // ----- back -----
  ex('back', 'Deadlift', { equipment: 'barbell', type: C, region: L, reps: [4, 8], secondary: ['glutes', 'hamstrings', 'traps'], stress: ['spine'] }),
  ex('back', 'Barbell Row', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['biceps', 'forearms'], stress: ['spine'] }),
  ex('back', 'Pendlay Row', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['biceps'], stress: ['spine'] }),
  ex('back', 'Pull-Up', { equipment: 'bodyweight', type: C, region: U, reps: [5, 10], lengthened: true, secondary: ['biceps', 'forearms'], envs: GC, next: 'Archer Pull-Up' }),
  ex('back', 'Chin-Up', { equipment: 'bodyweight', type: C, region: U, reps: [5, 10], lengthened: true, secondary: ['biceps'], envs: GC }),
  ex('back', 'Archer Pull-Up', { equipment: 'bodyweight', type: C, region: U, reps: [4, 8], lengthened: true, secondary: ['biceps', 'forearms'], envs: CAL }),
  ex('back', 'Lat Pulldown', { equipment: 'cable', type: C, region: U, reps: [8, 12], lengthened: true, secondary: ['biceps'] }),
  ex('back', 'Neutral-Grip Pulldown', { equipment: 'cable', type: C, region: U, reps: [8, 12], lengthened: true, secondary: ['biceps'] }),
  ex('back', 'Seated Cable Row', { equipment: 'cable', type: C, region: U, reps: [8, 12], secondary: ['biceps'] }),
  ex('back', 'Chest-Supported Row', { equipment: 'machine', type: C, region: U, reps: [8, 12], secondary: ['biceps'] }),
  ex('back', 'Single-Arm Dumbbell Row', { equipment: 'dumbbell', type: C, region: U, reps: [8, 12], secondary: ['biceps'] }),
  ex('back', 'Straight-Arm Pulldown', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('back', 'Inverted Row', { equipment: 'bodyweight', type: C, region: U, reps: [8, 15], secondary: ['biceps'], envs: CH, next: 'Feet-Elevated Inverted Row' }),
  ex('back', 'Feet-Elevated Inverted Row', { equipment: 'bodyweight', type: C, region: U, reps: [6, 12], secondary: ['biceps'], envs: CH }),
  ex('back', 'Towel Doorframe Row', { equipment: 'bodyweight', type: C, region: U, reps: [10, 18], secondary: ['biceps', 'forearms'], envs: ['home'] }),
  // ----- quads -----
  ex('quads', 'Back Squat', { equipment: 'barbell', type: C, region: L, reps: [6, 10], lengthened: true, secondary: ['glutes'], stress: ['spine', 'knee'] }),
  ex('quads', 'Front Squat', { equipment: 'barbell', type: C, region: L, reps: [6, 10], lengthened: true, secondary: ['glutes', 'abs'], stress: ['knee'] }),
  ex('quads', 'Leg Press', { equipment: 'machine', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes'] }),
  ex('quads', 'Hack Squat', { equipment: 'machine', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes'], stress: ['knee'] }),
  ex('quads', 'Smith Machine Squat', { equipment: 'smith', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes'], stress: ['knee'] }),
  ex('quads', 'Bulgarian Split Squat', { equipment: 'dumbbell', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes'], stress: ['knee'] }),
  ex('quads', 'Leg Extension', { equipment: 'machine', type: I, region: L, reps: [12, 16], stress: ['knee'] }),
  ex('quads', 'Walking Lunge', { equipment: 'dumbbell', type: C, region: L, reps: [8, 12], secondary: ['glutes'], stress: ['knee'] }),
  ex('quads', 'Bodyweight Squat', { equipment: 'bodyweight', type: C, region: L, reps: [15, 25], secondary: ['glutes'], envs: ALL, next: 'Split Squat (Bodyweight)' }),
  ex('quads', 'Split Squat (Bodyweight)', { equipment: 'bodyweight', type: C, region: L, reps: [10, 18], lengthened: true, secondary: ['glutes'], envs: ALL, next: 'Pistol Squat (Assisted)', stress: ['knee'] }),
  ex('quads', 'Pistol Squat (Assisted)', { equipment: 'bodyweight', type: C, region: L, reps: [6, 12], lengthened: true, secondary: ['glutes'], envs: ALL, next: 'Pistol Squat', stress: ['knee'] }),
  ex('quads', 'Pistol Squat', { equipment: 'bodyweight', type: C, region: L, reps: [4, 10], lengthened: true, secondary: ['glutes'], envs: ALL, stress: ['knee'] }),
  ex('quads', 'Step-Up (High Box)', { equipment: 'bodyweight', type: C, region: L, reps: [10, 16], secondary: ['glutes'], envs: CH }),
  // ----- hamstrings -----
  ex('hamstrings', 'Seated Leg Curl', { equipment: 'machine', type: I, region: L, reps: [12, 16], lengthened: true }),
  ex('hamstrings', 'Romanian Deadlift', { equipment: 'barbell', type: C, region: L, reps: [6, 10], lengthened: true, secondary: ['glutes', 'back'], stress: ['spine'] }),
  ex('hamstrings', 'Stiff-Leg Deadlift', { equipment: 'barbell', type: C, region: L, reps: [6, 10], lengthened: true, secondary: ['glutes', 'back'], stress: ['spine'] }),
  ex('hamstrings', 'Dumbbell Romanian Deadlift', { equipment: 'dumbbell', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes'], stress: ['spine'] }),
  ex('hamstrings', 'Lying Leg Curl', { equipment: 'machine', type: I, region: L, reps: [10, 14] }),
  ex('hamstrings', 'Good Morning', { equipment: 'barbell', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes', 'back'], stress: ['spine'] }),
  ex('hamstrings', 'Sliding Leg Curl', { equipment: 'bodyweight', type: I, region: L, reps: [8, 15], secondary: ['glutes'], envs: CH, next: 'Nordic Curl' }),
  ex('hamstrings', 'Nordic Curl', { equipment: 'bodyweight', type: I, region: L, reps: [4, 9], lengthened: true, envs: CH }),
  ex('hamstrings', 'Single-Leg Hip Hinge', { equipment: 'bodyweight', type: C, region: L, reps: [10, 16], lengthened: true, secondary: ['glutes'], envs: CH }),
  // ----- glutes -----
  ex('glutes', 'Barbell Hip Thrust', { equipment: 'barbell', type: C, region: L, reps: [8, 12], secondary: ['hamstrings'] }),
  ex('glutes', 'Machine Hip Thrust', { equipment: 'machine', type: C, region: L, reps: [8, 12], secondary: ['hamstrings'] }),
  ex('glutes', 'Sumo Deadlift', { equipment: 'barbell', type: C, region: L, reps: [5, 9], secondary: ['hamstrings', 'back', 'quads'], stress: ['spine'] }),
  ex('glutes', 'Deep Smith Squat (Glute Bias)', { equipment: 'smith', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['quads'], stress: ['knee'] }),
  ex('glutes', 'Reverse Lunge', { equipment: 'dumbbell', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['quads'] }),
  ex('glutes', 'Cable Kickback', { equipment: 'cable', type: I, region: L, reps: [12, 16] }),
  ex('glutes', 'Abduction Machine', { equipment: 'machine', type: I, region: L, reps: [12, 16] }),
  ex('glutes', 'Glute Bridge', { equipment: 'bodyweight', type: I, region: L, reps: [12, 20], secondary: ['hamstrings'], envs: ALL, next: 'Single-Leg Glute Bridge' }),
  ex('glutes', 'Single-Leg Glute Bridge', { equipment: 'bodyweight', type: I, region: L, reps: [8, 15], secondary: ['hamstrings'], envs: ALL }),
  ex('glutes', 'Bulgarian Split Squat (Bodyweight)', { equipment: 'bodyweight', type: C, region: L, reps: [10, 18], lengthened: true, secondary: ['quads'], envs: CH, stress: ['knee'] }),
  // ----- shoulders -----
  ex('shoulders', 'Overhead Press', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['triceps'], stress: ['shoulder'] }),
  ex('shoulders', 'Dumbbell Shoulder Press', { equipment: 'dumbbell', type: C, region: U, reps: [8, 12], secondary: ['triceps'], stress: ['shoulder'] }),
  ex('shoulders', 'Machine Shoulder Press', { equipment: 'machine', type: C, region: U, reps: [8, 12], secondary: ['triceps'], stress: ['shoulder'] }),
  ex('shoulders', 'Dumbbell Lateral Raise', { equipment: 'dumbbell', type: I, region: U, reps: [12, 16] }),
  ex('shoulders', 'Cable Lateral Raise', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('shoulders', 'Machine Lateral Raise', { equipment: 'machine', type: I, region: U, reps: [12, 16] }),
  ex('shoulders', 'Reverse Pec Deck', { equipment: 'machine', type: I, region: U, reps: [12, 16] }),
  ex('shoulders', 'Cable Rear-Delt Fly', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('shoulders', 'Face Pull', { equipment: 'cable', type: I, region: U, reps: [12, 16], secondary: ['traps'] }),
  ex('shoulders', 'Pike Push-Up', { equipment: 'bodyweight', type: C, region: U, reps: [6, 12], secondary: ['triceps'], envs: ALL, next: 'Elevated Pike Push-Up', stress: ['shoulder'] }),
  ex('shoulders', 'Elevated Pike Push-Up', { equipment: 'bodyweight', type: C, region: U, reps: [5, 10], secondary: ['triceps'], envs: ALL, next: 'Wall Handstand Push-Up', stress: ['shoulder'] }),
  ex('shoulders', 'Wall Handstand Push-Up', { equipment: 'bodyweight', type: C, region: U, reps: [3, 8], secondary: ['triceps'], envs: CH, stress: ['shoulder'] }),
  ex('shoulders', 'Prone Y-Raise', { equipment: 'bodyweight', type: I, region: U, reps: [12, 20], secondary: ['traps'], envs: CH }),
  // ----- biceps -----
  ex('biceps', 'Incline Dumbbell Curl', { equipment: 'dumbbell', type: I, region: U, reps: [10, 14], lengthened: true }),
  ex('biceps', 'Bayesian Cable Curl', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('biceps', 'Barbell Curl', { equipment: 'barbell', type: I, region: U, reps: [8, 12], stress: ['elbow'] }),
  ex('biceps', 'EZ-Bar Curl', { equipment: 'barbell', type: I, region: U, reps: [8, 12] }),
  ex('biceps', 'Dumbbell Curl', { equipment: 'dumbbell', type: I, region: U, reps: [10, 14] }),
  ex('biceps', 'Hammer Curl', { equipment: 'dumbbell', type: I, region: U, reps: [10, 14], secondary: ['forearms'] }),
  ex('biceps', 'Preacher Curl', { equipment: 'machine', type: I, region: U, reps: [10, 14], lengthened: true }),
  ex('biceps', 'Low-Bar Bodyweight Curl', { equipment: 'bodyweight', type: I, region: U, reps: [8, 15], envs: CAL }),
  // ----- triceps -----
  ex('triceps', 'Overhead Cable Extension', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('triceps', 'Skull Crusher', { equipment: 'barbell', type: I, region: U, reps: [10, 14], lengthened: true, stress: ['elbow'] }),
  ex('triceps', 'Close-Grip Bench Press', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['chest', 'shoulders'] }),
  ex('triceps', 'Cable Pushdown (Bar)', { equipment: 'cable', type: I, region: U, reps: [10, 14] }),
  ex('triceps', 'Cable Pushdown (Rope)', { equipment: 'cable', type: I, region: U, reps: [12, 16] }),
  ex('triceps', 'Dip Machine', { equipment: 'machine', type: C, region: U, reps: [8, 12], secondary: ['chest'], stress: ['shoulder'] }),
  ex('triceps', 'Diamond Push-Up', { equipment: 'bodyweight', type: C, region: U, reps: [8, 15], secondary: ['chest', 'shoulders'], envs: ALL }),
  ex('triceps', 'Bodyweight Skull Crusher', { equipment: 'bodyweight', type: I, region: U, reps: [8, 14], lengthened: true, envs: CH, stress: ['elbow'] }),
  ex('triceps', 'Bench Dip', { equipment: 'bodyweight', type: C, region: U, reps: [10, 18], secondary: ['chest'], envs: CH, stress: ['shoulder'] }),
  // ----- calves -----
  ex('calves', 'Standing Calf Raise', { equipment: 'machine', type: I, region: L, reps: [10, 14], lengthened: true }),
  ex('calves', 'Seated Calf Raise', { equipment: 'machine', type: I, region: L, reps: [12, 16] }),
  ex('calves', 'Leg Press Calf Raise', { equipment: 'machine', type: I, region: L, reps: [12, 16], lengthened: true }),
  ex('calves', 'Single-Leg Calf Raise (Step)', { equipment: 'bodyweight', type: I, region: L, reps: [12, 20], lengthened: true, envs: ALL }),
  // ----- abs -----
  ex('abs', 'Cable Crunch', { equipment: 'cable', type: I, region: U, reps: [10, 14] }),
  ex('abs', 'Hanging Leg Raise', { equipment: 'bodyweight', type: I, region: U, reps: [8, 14], envs: GC }),
  ex('abs', 'Ab Wheel Rollout', { equipment: 'bodyweight', type: I, region: U, reps: [8, 12], lengthened: true }),
  ex('abs', 'Machine Crunch', { equipment: 'machine', type: I, region: U, reps: [10, 14] }),
  ex('abs', 'V-Up', { equipment: 'bodyweight', type: I, region: U, reps: [10, 20], envs: ALL }),
  ex('abs', 'Reverse Crunch', { equipment: 'bodyweight', type: I, region: U, reps: [10, 18], envs: ALL }),
  // ----- traps -----
  ex('traps', 'Barbell Shrug', { equipment: 'barbell', type: I, region: U, reps: [10, 14] }),
  ex('traps', 'Dumbbell Shrug', { equipment: 'dumbbell', type: I, region: U, reps: [12, 16] }),
  ex('traps', 'Trap-Bar Shrug', { equipment: 'barbell', type: I, region: U, reps: [10, 14] }),
  // ----- forearms -----
  ex('forearms', 'Wrist Curl', { equipment: 'dumbbell', type: I, region: U, reps: [12, 16] }),
  ex('forearms', 'Reverse Curl', { equipment: 'barbell', type: I, region: U, reps: [10, 14], stress: ['elbow'] }),
  ex('forearms', 'Dead Hang (seconds)', { equipment: 'bodyweight', type: I, region: U, reps: [20, 45], envs: GC }),
];

// One coaching cue per movement — the single thing most likely to fix the set
// in front of you. Written to favor control and the stretched position (the
// lengthened-training evidence above), not maximal load.
const CUES = {
  'Barbell Bench Press': 'Shoulder blades pinned back and down; touch low chest, drive without bouncing.',
  'Incline Barbell Press': 'Bar to upper chest, elbows ~45°; keep the ribcage proud, no butt lift.',
  'Dumbbell Bench Press': 'Let the bells sink for a deep stretch at the bottom before you press.',
  'Incline Dumbbell Press': 'Deep stretch at the bottom, press up and slightly in — don’t clang the bells.',
  'Machine Chest Press': 'Set the seat so handles meet mid-chest; squeeze for a beat at lockout.',
  'Weighted Dip': 'Lean forward, elbows track back, sink until the chest stretch — no shrugging.',
  'Pec Deck': 'Elbows slightly bent and fixed; open wide into the stretch, pause, squeeze.',
  'Cable Fly (Mid)': 'Step forward, arms long; hug a barrel and resist the way back out.',
  'Cable Fly (Low-to-High)': 'Sweep up and in toward the collarbones; finish with a hard squeeze.',
  'Incline Push-Up': 'Body one straight line; chest to the edge, full lockout every rep.',
  'Push-Up': 'Hands under shoulders, body rigid; chest brushes the floor before you press.',
  'Deficit Push-Up': 'Hands on blocks or books — sink below hand level for the extra stretch.',
  'Archer Push-Up': 'Shift your weight over one arm; the straight arm only guides.',
  'Bar Dip': 'Slight forward lean, sink to a full chest stretch, drive to straight arms.',
  'Deadlift': 'Brace hard, bar against shins, push the floor away; hips and chest rise together.',
  'Barbell Row': 'Hinge to ~45°, pull to the lower ribs, let the bar drift with control.',
  'Pendlay Row': 'Reset every rep from the floor; explode to the sternum, torso parallel.',
  'Pull-Up': 'Start from a dead hang — that stretch is the point. Chin over, no kipping.',
  'Chin-Up': 'Full hang at the bottom; drive elbows down and back, chest to the bar.',
  'Archer Pull-Up': 'Pull toward one hand, opposite arm long; alternate sides each rep.',
  'Lat Pulldown': 'Long spine, slight lean back; pull elbows to your sides, full stretch up top.',
  'Neutral-Grip Pulldown': 'Elbows tight to the ribs; let the lats lengthen fully between reps.',
  'Seated Cable Row': 'Chest tall; pull to the navel, then let the shoulders reach forward.',
  'Chest-Supported Row': 'Chest glued to the pad — if it lifts, the weight is doing the rowing.',
  'Single-Arm Dumbbell Row': 'Let the bell hang long and stretch the lat before each pull.',
  'Straight-Arm Pulldown': 'Arms nearly straight; sweep the bar to the thighs, stretch tall at the top.',
  'Inverted Row': 'Body plank-rigid; pull chest to the bar or table edge, pause a beat.',
  'Feet-Elevated Inverted Row': 'Feet up makes it honest — keep hips level as you pull.',
  'Towel Doorframe Row': 'Sit back, arms fully long, then row your chest to the frame.',
  'Back Squat': 'Sit down between your legs, hit full depth, drive the whole foot.',
  'Front Squat': 'Elbows high, torso tall; the rack position keeps you honest — stay upright.',
  'Leg Press': 'Deep as your hips allow without the tailbone curling; never lock out hard.',
  'Hack Squat': 'Heels lower than you think; ride the stretch at the bottom, no bouncing.',
  'Smith Machine Squat': 'Feet slightly forward; sink deep — the rails balance so you can chase depth.',
  'Bulgarian Split Squat': 'Long stance, drop the back knee straight down, front heel heavy.',
  'Leg Extension': 'Sit back into the pad, toes up; pause hard at the top, lower slow.',
  'Walking Lunge': 'Long steps, torso tall; push off the front heel, knees track the toes.',
  'Bodyweight Squat': 'Slow threes down, full depth, stand all the way up — make easy reps count.',
  'Split Squat (Bodyweight)': 'Back knee kisses the floor; all the work stays on the front leg.',
  'Pistol Squat (Assisted)': 'Hold a post or strap lightly — assist balance, not effort.',
  'Pistol Squat': 'Reach arms forward as a counterweight; control the descent, no plopping.',
  'Step-Up (High Box)': 'Knee-height box; press through the top heel, don’t push off the floor leg.',
  'Seated Leg Curl': 'Lean forward slightly to lengthen the hamstrings — that’s where they grow.',
  'Romanian Deadlift': 'Push the hips back until the hamstrings scream, bar close, flat back.',
  'Stiff-Leg Deadlift': 'Softer knees than a deadlift, deeper stretch; stop before the back rounds.',
  'Dumbbell Romanian Deadlift': 'Bells trace the thighs; hips travel back, not down.',
  'Lying Leg Curl': 'Hips pressed into the bench; curl to the glutes, lower on a three-count.',
  'Nordic Curl': 'Fight the descent with everything — push back up with hands as needed.',
  'Good Morning': 'Bar low on traps, hips back until hamstrings load; stand by squeezing glutes.',
  'Sliding Leg Curl': 'Bridge the hips high, slide the heels out long, drag them back.',
  'Single-Leg Hip Hinge': 'Reach the free leg back like a doorstop; square hips, long spine.',
  'Barbell Hip Thrust': 'Chin tucked, ribs down; full lockout with a one-second glute squeeze.',
  'Machine Hip Thrust': 'Drive through the heels; finish flat as a table, no lower-back arch.',
  'Sumo Deadlift': 'Knees out over the toes, chest tall; wedge in before you pull.',
  'Deep Smith Squat (Glute Bias)': 'Feet forward, sink deep and sit back into the heels.',
  'Reverse Lunge': 'Step back long; the front leg does the work coming up.',
  'Cable Kickback': 'Hinge slightly; sweep the leg back with a straightish knee, squeeze, resist return.',
  'Abduction Machine': 'Lean forward for upper glute; pause at full spread each rep.',
  'Glute Bridge': 'Heels close, drive through them; a one-second squeeze at the top.',
  'Single-Leg Glute Bridge': 'Hips dead level — if one side drops, slow down.',
  'Bulgarian Split Squat (Bodyweight)': 'Drop straight down, front shin near vertical, feel the glute stretch.',
  'Overhead Press': 'Squeeze glutes, ribs down; press slightly back so the bar finishes over mid-foot.',
  'Dumbbell Shoulder Press': 'Start at the collarbones, press to elbows straight — no half lockouts.',
  'Machine Shoulder Press': 'Set the seat so handles start at ear height; drive without shrugging.',
  'Dumbbell Lateral Raise': 'Lead with the elbows, pour the pinkies slightly up, control the drop.',
  'Cable Lateral Raise': 'Cable behind the body gives tension at the bottom — use that stretch.',
  'Machine Lateral Raise': 'Push with the elbows, not the hands; pause a beat at shoulder height.',
  'Reverse Pec Deck': 'Arms long, sweep back; stop the rep before the traps take over.',
  'Cable Rear-Delt Fly': 'Cross the cables, pull wide and back; keep the shrug out of it.',
  'Face Pull': 'Rope to the bridge of the nose, elbows high, thumbs point behind you.',
  'Pike Push-Up': 'Hips high, head travels to the floor between the hands, press back up.',
  'Elevated Pike Push-Up': 'Feet on a chair, hips stacked over shoulders — a vertical press in disguise.',
  'Wall Handstand Push-Up': 'Belly to the wall, slight lean; lower to a controlled head touch.',
  'Prone Y-Raise': 'Thumbs up, lift into a Y; small range, zero momentum.',
  'Incline Dumbbell Curl': 'Let the arms hang behind you — the stretch on the long head is the point.',
  'Bayesian Cable Curl': 'Face away, arm dragged behind by the cable; curl from a full stretch.',
  'Barbell Curl': 'Elbows pinned to your sides; if you swing, it’s too heavy.',
  'EZ-Bar Curl': 'Wrists neutral on the angles; squeeze at the top, three seconds down.',
  'Dumbbell Curl': 'Supinate as you curl; full straight-arm stretch between reps.',
  'Hammer Curl': 'Neutral grip, drive the thumbs to the shoulders; slow eccentrics.',
  'Preacher Curl': 'The pad kills cheating — take the bottom stretch seriously, don’t bounce it.',
  'Low-Bar Bodyweight Curl': 'Body straight, wrists locked; curl your face to the bar.',
  'Overhead Cable Extension': 'Elbows by the ears; let the cable pull deep behind the head, then extend.',
  'Skull Crusher': 'Lower behind the head, not to the forehead — bigger stretch, safer elbows.',
  'Close-Grip Bench Press': 'Hands shoulder-width, elbows tucked; touch low and press tall.',
  'Cable Pushdown (Bar)': 'Elbows locked at the sides; straighten fully, control the way up.',
  'Cable Pushdown (Rope)': 'Split the rope at the bottom, knuckles turn out; pin those elbows.',
  'Dip Machine': 'Chest up, press to full lockout; keep shoulders away from the ears.',
  'Diamond Push-Up': 'Hands form a triangle under the chest; elbows brush the ribs.',
  'Bodyweight Skull Crusher': 'Bar or table edge; lower the head under the bar, extend back out.',
  'Bench Dip': 'Hips close to the bench, shoulders down; shallow if the front of the shoulder complains.',
  'Standing Calf Raise': 'Deep heel drop, two-second pause in the stretch, full rise to the big toe.',
  'Seated Calf Raise': 'The pause at the bottom is the rep — no bouncing out of the stretch.',
  'Leg Press Calf Raise': 'Big range: heels drop fully, press through the ball of the foot.',
  'Single-Leg Calf Raise (Step)': 'On a step, full drop and a pause; hold something for balance only.',
  'Cable Crunch': 'Kneel, hips still; crunch the ribs to the pelvis, not the elbows to the floor.',
  'Hanging Leg Raise': 'Tilt the pelvis first, then raise the legs; no swinging between reps.',
  'Ab Wheel Rollout': 'Ribs down, tuck the pelvis; roll only as far as the back stays flat.',
  'Machine Crunch': 'Exhale hard as you crunch; let the abs stretch fully on the return.',
  'V-Up': 'Reach hands to feet, fold at the ribs; control the lowering, heels hover.',
  'Reverse Crunch': 'Knees to chest by curling the pelvis up — lower slow, no leg swing.',
  'Barbell Shrug': 'Straight up, hold one second at the top; no rolling.',
  'Dumbbell Shrug': 'Let the bells stretch the traps at the bottom; shrug to your ears, pause.',
  'Trap-Bar Shrug': 'Neutral grip lets you load heavy — still pause every top.',
  'Wrist Curl': 'Forearms on thighs, knuckles roll all the way down, curl to full flex.',
  'Reverse Curl': 'Palms down, wrists straight; slow lowering builds the forearm.',
  'Dead Hang (seconds)': 'Full grip, shoulders active-ish; log seconds in the reps field.',
  'Farmer Carry (steps)': 'Heavy bells, tall posture; log steps in the reps field.',
};

for (const e of EXERCISES) e.cue = CUES[e.name] ?? null;

// Sanity: progression chains must resolve.
for (const e of EXERCISES) {
  if (e.next && !EXERCISES.some((x) => x.name === e.next)) {
    throw new Error(`Broken progression chain: ${e.name} → ${e.next}`);
  }
}

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id);
}

export function getExerciseByName(name) {
  return EXERCISES.find((e) => e.name === name);
}

// Exercises usable for a muscle in a given environment, stretch-biased first
// (Maeo 2021/2023, Pedrosa 2022, Kassiano 2023).
export function exercisesForMuscle(muscle, environment = 'gym') {
  return EXERCISES.filter((e) => e.muscle === muscle && e.envs.includes(environment))
    .sort((a, b) => Number(b.lengthened) - Number(a.lengthened));
}

// Does this exercise conflict with the user's flagged conditions?
export function conflictsWith(exercise, conditions = []) {
  return (exercise.stress || []).filter((s) => conditions.includes(s));
}

// Best substitute for a conflicting exercise: same muscle, same environment,
// none of the flagged stresses; prefer same movement type, then stretch bias.
export function alternativeFor(exercise, conditions, environment) {
  const candidates = EXERCISES.filter((e) =>
    e.muscle === exercise.muscle &&
    e.id !== exercise.id &&
    e.envs.includes(environment) &&
    conflictsWith(e, conditions).length === 0);
  candidates.sort((a, b) =>
    (Number(b.type === exercise.type) - Number(a.type === exercise.type)) ||
    (Number(b.lengthened) - Number(a.lengthened)));
  return candidates[0] || null;
}
