// Built-in exercise library and per-muscle weekly volume landmarks (sets/week),
// based on Renaissance Periodization's published training volume guides.

export const MUSCLES = [
  'chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders',
  'biceps', 'triceps', 'calves', 'abs', 'traps', 'forearms',
];

// { muscle: { mev, mrv } } — weekly set counts
export const VOLUME_LANDMARKS = {
  chest: { mev: 8, mrv: 22 },
  back: { mev: 10, mrv: 25 },
  quads: { mev: 8, mrv: 20 },
  hamstrings: { mev: 4, mrv: 16 },
  glutes: { mev: 4, mrv: 16 },
  shoulders: { mev: 8, mrv: 26 },
  biceps: { mev: 8, mrv: 20 },
  triceps: { mev: 6, mrv: 18 },
  calves: { mev: 8, mrv: 16 },
  abs: { mev: 6, mrv: 16 },
  traps: { mev: 4, mrv: 12 },
  forearms: { mev: 4, mrv: 12 },
};

let nextId = 1;
const ex = (muscle, name, repLo, repHi) => ({ id: nextId++, muscle, name, repRange: [repLo, repHi] });

export const EXERCISES = [
  // chest
  ex('chest', 'Barbell Bench Press', 5, 10),
  ex('chest', 'Incline Dumbbell Press', 8, 12),
  ex('chest', 'Machine Chest Press', 8, 12),
  ex('chest', 'Cable Fly', 10, 15),
  ex('chest', 'Weighted Dip', 6, 10),
  ex('chest', 'Push-Up', 10, 20),
  // back
  ex('back', 'Deadlift', 4, 8),
  ex('back', 'Barbell Row', 6, 10),
  ex('back', 'Pull-Up', 5, 10),
  ex('back', 'Lat Pulldown', 8, 12),
  ex('back', 'Seated Cable Row', 8, 12),
  ex('back', 'Single-Arm Dumbbell Row', 8, 12),
  // quads
  ex('quads', 'Back Squat', 5, 10),
  ex('quads', 'Front Squat', 5, 10),
  ex('quads', 'Leg Press', 8, 15),
  ex('quads', 'Hack Squat', 8, 12),
  ex('quads', 'Leg Extension', 10, 15),
  ex('quads', 'Walking Lunge', 8, 12),
  // hamstrings
  ex('hamstrings', 'Romanian Deadlift', 6, 10),
  ex('hamstrings', 'Lying Leg Curl', 8, 12),
  ex('hamstrings', 'Seated Leg Curl', 10, 15),
  ex('hamstrings', 'Good Morning', 8, 12),
  // glutes
  ex('glutes', 'Hip Thrust', 8, 12),
  ex('glutes', 'Bulgarian Split Squat', 8, 12),
  ex('glutes', 'Cable Kickback', 10, 15),
  ex('glutes', 'Sumo Deadlift', 5, 10),
  // shoulders
  ex('shoulders', 'Overhead Press', 5, 10),
  ex('shoulders', 'Dumbbell Shoulder Press', 8, 12),
  ex('shoulders', 'Dumbbell Lateral Raise', 10, 20),
  ex('shoulders', 'Cable Lateral Raise', 10, 15),
  ex('shoulders', 'Reverse Pec Deck', 10, 15),
  ex('shoulders', 'Face Pull', 12, 20),
  // biceps
  ex('biceps', 'Barbell Curl', 8, 12),
  ex('biceps', 'Dumbbell Curl', 8, 12),
  ex('biceps', 'Hammer Curl', 8, 12),
  ex('biceps', 'Incline Dumbbell Curl', 10, 15),
  ex('biceps', 'Cable Curl', 10, 15),
  // triceps
  ex('triceps', 'Close-Grip Bench Press', 6, 10),
  ex('triceps', 'Skull Crusher', 8, 12),
  ex('triceps', 'Cable Pushdown', 10, 15),
  ex('triceps', 'Overhead Cable Extension', 10, 15),
  // calves
  ex('calves', 'Standing Calf Raise', 8, 12),
  ex('calves', 'Seated Calf Raise', 10, 15),
  ex('calves', 'Leg Press Calf Raise', 10, 15),
  // abs
  ex('abs', 'Cable Crunch', 10, 15),
  ex('abs', 'Hanging Leg Raise', 8, 15),
  ex('abs', 'Ab Wheel Rollout', 8, 12),
  ex('abs', 'Weighted Plank', 1, 1),
  // traps
  ex('traps', 'Barbell Shrug', 10, 15),
  ex('traps', 'Dumbbell Shrug', 10, 15),
  // forearms
  ex('forearms', 'Wrist Curl', 12, 20),
  ex('forearms', 'Reverse Curl', 10, 15),
];

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id);
}
