// Exercise library and per-muscle weekly volume landmarks.
//
// Field notes (used by the progression engine — citations in engine.js):
// - type: 'compound' | 'isolation' — drives RIR targets, rep windows, load
//   increments, and rest-timer defaults.
// - region: 'upper' | 'lower' — drives load increment size.
// - lengthened: true — exercise loads the target muscle at long muscle lengths.
//   Long-length training out-grows short-length work (Maeo 2021 MSSE seated leg
//   curl; Maeo 2023 EJSS overhead extensions; Pedrosa 2022 EJSS curls; Kassiano
//   2023 JSCR calves), so these are ranked first within each muscle's list.
// - secondary: muscles that get meaningful indirect work; each indirect set
//   counts 0.5 toward that muscle's weekly volume (fractional-set convention
//   from Baz-Valle 2019/2022 set-counting framework).

export const MUSCLES = [
  'chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders',
  'biceps', 'triceps', 'calves', 'abs', 'traps', 'forearms',
];

// Weekly hard-set landmarks per muscle. Direction is evidence-backed, exact
// values are convention inside the evidence band:
// - startVolume ~8-12: gains are clear by 10+ sets/week (Schoenfeld 2017,
//   J Sports Sci dose-response meta) and most of the benefit is captured by the
//   low teens (Pelland 2025, Sports Med meta-regression: ~0.24%/set with
//   diminishing returns; Baz-Valle 2022, J Hum Kinet: 12-20 sets optimal).
// - maxVolume caps sit below the ~30 sets/week point where marginal benefit
//   approaches zero (Pelland 2025), and lower for small muscles that collect
//   heavy indirect work.
// The engine only raises volume when performance improves (Enes 2024, MSSE:
// unearned set inflation gave no extra growth in trained lifters).
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
// Sports; Lopez 2021, MSSE network meta). Windows are 4 reps wide so one load
// jump lands back inside the window (double progression — Plotkin 2022, PeerJ).
let nextId = 1;
function ex(muscle, name, opts) {
  const { equipment, type, region, reps, lengthened = false, secondary = [] } = opts;
  return { id: nextId++, muscle, name, equipment, type, region, repRange: reps, lengthened, secondary };
}
const C = 'compound', I = 'isolation', U = 'upper', L = 'lower';

export const EXERCISES = [
  // ----- chest -----
  ex('chest', 'Barbell Bench Press', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['triceps', 'shoulders'] }),
  ex('chest', 'Incline Barbell Press', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['triceps', 'shoulders'] }),
  ex('chest', 'Dumbbell Bench Press', { equipment: 'dumbbell', type: C, region: U, reps: [8, 12], lengthened: true, secondary: ['triceps', 'shoulders'] }),
  ex('chest', 'Incline Dumbbell Press', { equipment: 'dumbbell', type: C, region: U, reps: [8, 12], lengthened: true, secondary: ['triceps', 'shoulders'] }),
  ex('chest', 'Machine Chest Press', { equipment: 'machine', type: C, region: U, reps: [8, 12], secondary: ['triceps', 'shoulders'] }),
  ex('chest', 'Weighted Dip', { equipment: 'bodyweight', type: C, region: U, reps: [6, 10], lengthened: true, secondary: ['triceps'] }),
  ex('chest', 'Pec Deck', { equipment: 'machine', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('chest', 'Cable Fly (Mid)', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('chest', 'Cable Fly (Low-to-High)', { equipment: 'cable', type: I, region: U, reps: [12, 16] }),
  ex('chest', 'Deficit Push-Up', { equipment: 'bodyweight', type: C, region: U, reps: [10, 14], lengthened: true, secondary: ['triceps', 'shoulders'] }),
  // ----- back -----
  ex('back', 'Deadlift', { equipment: 'barbell', type: C, region: L, reps: [4, 8], secondary: ['glutes', 'hamstrings', 'traps'] }),
  ex('back', 'Barbell Row', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['biceps', 'forearms'] }),
  ex('back', 'Pendlay Row', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['biceps'] }),
  ex('back', 'Pull-Up', { equipment: 'bodyweight', type: C, region: U, reps: [6, 10], lengthened: true, secondary: ['biceps', 'forearms'] }),
  ex('back', 'Chin-Up', { equipment: 'bodyweight', type: C, region: U, reps: [6, 10], lengthened: true, secondary: ['biceps'] }),
  ex('back', 'Lat Pulldown', { equipment: 'cable', type: C, region: U, reps: [8, 12], lengthened: true, secondary: ['biceps'] }),
  ex('back', 'Neutral-Grip Pulldown', { equipment: 'cable', type: C, region: U, reps: [8, 12], lengthened: true, secondary: ['biceps'] }),
  ex('back', 'Seated Cable Row', { equipment: 'cable', type: C, region: U, reps: [8, 12], secondary: ['biceps'] }),
  ex('back', 'Chest-Supported Row', { equipment: 'machine', type: C, region: U, reps: [8, 12], secondary: ['biceps'] }),
  ex('back', 'Single-Arm Dumbbell Row', { equipment: 'dumbbell', type: C, region: U, reps: [8, 12], secondary: ['biceps'] }),
  ex('back', 'Straight-Arm Pulldown', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  // ----- quads -----
  ex('quads', 'Back Squat', { equipment: 'barbell', type: C, region: L, reps: [6, 10], lengthened: true, secondary: ['glutes'] }),
  ex('quads', 'Front Squat', { equipment: 'barbell', type: C, region: L, reps: [6, 10], lengthened: true, secondary: ['glutes', 'abs'] }),
  ex('quads', 'Leg Press', { equipment: 'machine', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes'] }),
  ex('quads', 'Hack Squat', { equipment: 'machine', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes'] }),
  ex('quads', 'Smith Machine Squat', { equipment: 'smith', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes'] }),
  ex('quads', 'Bulgarian Split Squat', { equipment: 'dumbbell', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes'] }),
  ex('quads', 'Leg Extension', { equipment: 'machine', type: I, region: L, reps: [12, 16] }),
  ex('quads', 'Walking Lunge', { equipment: 'dumbbell', type: C, region: L, reps: [8, 12], secondary: ['glutes'] }),
  // ----- hamstrings -----
  ex('hamstrings', 'Seated Leg Curl', { equipment: 'machine', type: I, region: L, reps: [12, 16], lengthened: true }),
  ex('hamstrings', 'Romanian Deadlift', { equipment: 'barbell', type: C, region: L, reps: [6, 10], lengthened: true, secondary: ['glutes', 'back'] }),
  ex('hamstrings', 'Stiff-Leg Deadlift', { equipment: 'barbell', type: C, region: L, reps: [6, 10], lengthened: true, secondary: ['glutes', 'back'] }),
  ex('hamstrings', 'Dumbbell Romanian Deadlift', { equipment: 'dumbbell', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes'] }),
  ex('hamstrings', 'Lying Leg Curl', { equipment: 'machine', type: I, region: L, reps: [10, 14] }),
  ex('hamstrings', 'Nordic Curl', { equipment: 'bodyweight', type: I, region: L, reps: [5, 9] }),
  ex('hamstrings', 'Good Morning', { equipment: 'barbell', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['glutes', 'back'] }),
  // ----- glutes -----
  ex('glutes', 'Barbell Hip Thrust', { equipment: 'barbell', type: C, region: L, reps: [8, 12], secondary: ['hamstrings'] }),
  ex('glutes', 'Machine Hip Thrust', { equipment: 'machine', type: C, region: L, reps: [8, 12], secondary: ['hamstrings'] }),
  ex('glutes', 'Sumo Deadlift', { equipment: 'barbell', type: C, region: L, reps: [5, 9], secondary: ['hamstrings', 'back', 'quads'] }),
  ex('glutes', 'Deep Smith Squat (Glute Bias)', { equipment: 'smith', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['quads'] }),
  ex('glutes', 'Reverse Lunge', { equipment: 'dumbbell', type: C, region: L, reps: [8, 12], lengthened: true, secondary: ['quads'] }),
  ex('glutes', 'Cable Kickback', { equipment: 'cable', type: I, region: L, reps: [12, 16] }),
  ex('glutes', 'Abduction Machine', { equipment: 'machine', type: I, region: L, reps: [12, 16] }),
  // ----- shoulders -----
  ex('shoulders', 'Overhead Press', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['triceps'] }),
  ex('shoulders', 'Dumbbell Shoulder Press', { equipment: 'dumbbell', type: C, region: U, reps: [8, 12], secondary: ['triceps'] }),
  ex('shoulders', 'Machine Shoulder Press', { equipment: 'machine', type: C, region: U, reps: [8, 12], secondary: ['triceps'] }),
  ex('shoulders', 'Dumbbell Lateral Raise', { equipment: 'dumbbell', type: I, region: U, reps: [12, 16] }),
  ex('shoulders', 'Cable Lateral Raise', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('shoulders', 'Machine Lateral Raise', { equipment: 'machine', type: I, region: U, reps: [12, 16] }),
  ex('shoulders', 'Reverse Pec Deck', { equipment: 'machine', type: I, region: U, reps: [12, 16] }),
  ex('shoulders', 'Cable Rear-Delt Fly', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('shoulders', 'Face Pull', { equipment: 'cable', type: I, region: U, reps: [12, 16], secondary: ['traps'] }),
  // ----- biceps -----
  ex('biceps', 'Incline Dumbbell Curl', { equipment: 'dumbbell', type: I, region: U, reps: [10, 14], lengthened: true }),
  ex('biceps', 'Bayesian Cable Curl', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('biceps', 'Barbell Curl', { equipment: 'barbell', type: I, region: U, reps: [8, 12] }),
  ex('biceps', 'EZ-Bar Curl', { equipment: 'barbell', type: I, region: U, reps: [8, 12] }),
  ex('biceps', 'Dumbbell Curl', { equipment: 'dumbbell', type: I, region: U, reps: [10, 14] }),
  ex('biceps', 'Hammer Curl', { equipment: 'dumbbell', type: I, region: U, reps: [10, 14], secondary: ['forearms'] }),
  ex('biceps', 'Preacher Curl', { equipment: 'machine', type: I, region: U, reps: [10, 14], lengthened: true }),
  // ----- triceps -----
  ex('triceps', 'Overhead Cable Extension', { equipment: 'cable', type: I, region: U, reps: [12, 16], lengthened: true }),
  ex('triceps', 'Skull Crusher', { equipment: 'barbell', type: I, region: U, reps: [10, 14], lengthened: true }),
  ex('triceps', 'Close-Grip Bench Press', { equipment: 'barbell', type: C, region: U, reps: [6, 10], secondary: ['chest', 'shoulders'] }),
  ex('triceps', 'Cable Pushdown (Bar)', { equipment: 'cable', type: I, region: U, reps: [10, 14] }),
  ex('triceps', 'Cable Pushdown (Rope)', { equipment: 'cable', type: I, region: U, reps: [12, 16] }),
  ex('triceps', 'Dip Machine', { equipment: 'machine', type: C, region: U, reps: [8, 12], secondary: ['chest'] }),
  // ----- calves -----
  ex('calves', 'Standing Calf Raise', { equipment: 'machine', type: I, region: L, reps: [10, 14], lengthened: true }),
  ex('calves', 'Seated Calf Raise', { equipment: 'machine', type: I, region: L, reps: [12, 16] }),
  ex('calves', 'Leg Press Calf Raise', { equipment: 'machine', type: I, region: L, reps: [12, 16], lengthened: true }),
  ex('calves', 'Single-Leg Calf Raise', { equipment: 'bodyweight', type: I, region: L, reps: [12, 16], lengthened: true }),
  // ----- abs -----
  ex('abs', 'Cable Crunch', { equipment: 'cable', type: I, region: U, reps: [10, 14] }),
  ex('abs', 'Hanging Leg Raise', { equipment: 'bodyweight', type: I, region: U, reps: [8, 14] }),
  ex('abs', 'Ab Wheel Rollout', { equipment: 'bodyweight', type: I, region: U, reps: [8, 12], lengthened: true }),
  ex('abs', 'Machine Crunch', { equipment: 'machine', type: I, region: U, reps: [10, 14] }),
  ex('abs', 'Decline Sit-Up', { equipment: 'bodyweight', type: I, region: U, reps: [10, 16] }),
  // ----- traps -----
  ex('traps', 'Barbell Shrug', { equipment: 'barbell', type: I, region: U, reps: [10, 14] }),
  ex('traps', 'Dumbbell Shrug', { equipment: 'dumbbell', type: I, region: U, reps: [12, 16] }),
  ex('traps', 'Trap-Bar Shrug', { equipment: 'barbell', type: I, region: U, reps: [10, 14] }),
  // ----- forearms -----
  ex('forearms', 'Wrist Curl', { equipment: 'dumbbell', type: I, region: U, reps: [12, 16] }),
  ex('forearms', 'Reverse Curl', { equipment: 'barbell', type: I, region: U, reps: [10, 14] }),
  ex('forearms', 'Farmer Carry (steps)', { equipment: 'dumbbell', type: I, region: U, reps: [20, 40] }),
];

// Within each muscle, surface lengthened-biased variants first (Maeo 2021/2023,
// Pedrosa 2022, Kassiano 2023 — long-muscle-length training grows more).
export function exercisesForMuscle(muscle) {
  return EXERCISES.filter((e) => e.muscle === muscle)
    .sort((a, b) => Number(b.lengthened) - Number(a.lengthened));
}

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id);
}
