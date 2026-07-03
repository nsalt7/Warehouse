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
