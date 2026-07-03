// Built-in mesocycle templates.
//
// Programming principles baked into these (see engine.js for full citations):
// - Each muscle is trained ~2x/week where practical: with volume equated,
//   frequency ≥2/week trends slightly better than 1x (Schoenfeld, Grgic &
//   Krieger 2019, J Sports Sci) and it keeps per-session volume manageable.
// - Compounds early in the session, isolation later; heavier rep ranges before
//   metabolite work (pragmatic sequencing convention).
// - Every specialization template funds its extra volume by cutting volume
//   elsewhere — recoverable volume is finite (Bell et al. 2023 deload review;
//   general overreaching literature).

import { EXERCISES } from './exercises.js';

const idOf = (name) => {
  const found = EXERCISES.find((e) => e.name === name);
  if (!found) throw new Error(`Template references unknown exercise: ${name}`);
  return found.id;
};

const day = (name, ...exerciseNames) => ({ name, slots: exerciseNames.map((n) => ({ exerciseId: idOf(n) })) });

export const TEMPLATES = [
  {
    id: 'beginner-full-body-2x',
    name: 'First Mesocycle — Full Body 2x',
    level: 'Beginner',
    description: 'Two short full-body days built around the six fundamental movement patterns. Low starting volume so your first meso teaches you the feedback loop without wrecking you.',
    environment: 'gym',
    weeksTotal: 5,
    days: [
      day('Full Body A', 'Back Squat', 'Barbell Bench Press', 'Seated Cable Row', 'Dumbbell Lateral Raise', 'Cable Crunch'),
      day('Full Body B', 'Romanian Deadlift', 'Overhead Press', 'Lat Pulldown', 'Dumbbell Curl', 'Standing Calf Raise'),
    ],
  },
  {
    id: 'full-body-3x',
    name: 'Full Body 3x',
    level: 'Beginner–Intermediate',
    description: 'Three full-body days, every big muscle 2–3x per week. The highest-bang-for-hour layout there is; ideal if you can train Mon/Wed/Fri.',
    environment: 'gym',
    weeksTotal: 5,
    days: [
      day('Full Body A', 'Back Squat', 'Barbell Bench Press', 'Barbell Row', 'Dumbbell Lateral Raise', 'Cable Crunch'),
      day('Full Body B', 'Romanian Deadlift', 'Overhead Press', 'Lat Pulldown', 'EZ-Bar Curl', 'Standing Calf Raise'),
      day('Full Body C', 'Leg Press', 'Incline Dumbbell Press', 'Seated Cable Row', 'Cable Pushdown (Rope)', 'Hanging Leg Raise'),
    ],
  },
  {
    id: 'upper-lower-4x',
    name: 'Upper / Lower 4x',
    level: 'Intermediate',
    description: 'The workhorse split. Every muscle twice a week, sessions about an hour, easy to schedule around life. If in doubt, run this.',
    environment: 'gym',
    weeksTotal: 5,
    days: [
      day('Upper 1', 'Barbell Bench Press', 'Barbell Row', 'Overhead Press', 'EZ-Bar Curl', 'Cable Pushdown (Bar)'),
      day('Lower 1', 'Back Squat', 'Romanian Deadlift', 'Leg Extension', 'Standing Calf Raise', 'Cable Crunch'),
      day('Upper 2', 'Incline Dumbbell Press', 'Lat Pulldown', 'Cable Lateral Raise', 'Hammer Curl', 'Skull Crusher'),
      day('Lower 2', 'Leg Press', 'Lying Leg Curl', 'Barbell Hip Thrust', 'Seated Calf Raise', 'Hanging Leg Raise'),
    ],
  },
  {
    id: 'ppl-3x',
    name: 'Push / Pull / Legs 3x',
    level: 'Intermediate',
    description: 'Classic PPL for a three-day week. Each muscle gets one focused, higher-volume session — great when your schedule caps you at three gym trips.',
    environment: 'gym',
    weeksTotal: 5,
    days: [
      day('Push', 'Barbell Bench Press', 'Overhead Press', 'Cable Fly (Mid)', 'Dumbbell Lateral Raise', 'Cable Pushdown (Rope)'),
      day('Pull', 'Barbell Row', 'Lat Pulldown', 'Seated Cable Row', 'Face Pull', 'EZ-Bar Curl'),
      day('Legs', 'Back Squat', 'Romanian Deadlift', 'Leg Press', 'Lying Leg Curl', 'Standing Calf Raise'),
    ],
  },
  {
    id: 'ul-plus-full-5x',
    name: 'Upper / Lower + Full 5x',
    level: 'Intermediate–Advanced',
    description: 'Upper/Lower twice through plus a Friday full-body top-up. The extra day is where the engine parks added sets as your volume climbs mid-meso.',
    environment: 'gym',
    weeksTotal: 5,
    days: [
      day('Upper 1', 'Barbell Bench Press', 'Barbell Row', 'Dumbbell Lateral Raise', 'EZ-Bar Curl'),
      day('Lower 1', 'Back Squat', 'Lying Leg Curl', 'Standing Calf Raise', 'Cable Crunch'),
      day('Upper 2', 'Overhead Press', 'Lat Pulldown', 'Cable Fly (Mid)', 'Skull Crusher'),
      day('Lower 2', 'Leg Press', 'Romanian Deadlift', 'Barbell Hip Thrust', 'Seated Calf Raise'),
      day('Full Body', 'Hack Squat', 'Incline Dumbbell Press', 'Chest-Supported Row', 'Cable Lateral Raise', 'Hammer Curl'),
    ],
  },
  {
    id: 'ppl-6x',
    name: 'Push / Pull / Legs 6x',
    level: 'Advanced',
    description: 'High-frequency PPL: every muscle twice a week with room to push volume high. Only take this on if you can genuinely train six days and sleep like it matters.',
    environment: 'gym',
    weeksTotal: 6,
    days: [
      day('Push 1', 'Barbell Bench Press', 'Overhead Press', 'Cable Fly (Mid)', 'Cable Pushdown (Bar)'),
      day('Pull 1', 'Barbell Row', 'Lat Pulldown', 'Face Pull', 'EZ-Bar Curl'),
      day('Legs 1', 'Back Squat', 'Romanian Deadlift', 'Leg Extension', 'Standing Calf Raise'),
      day('Push 2', 'Incline Dumbbell Press', 'Machine Shoulder Press', 'Pec Deck', 'Overhead Cable Extension'),
      day('Pull 2', 'Pull-Up', 'Chest-Supported Row', 'Reverse Pec Deck', 'Incline Dumbbell Curl'),
      day('Legs 2', 'Leg Press', 'Seated Leg Curl', 'Barbell Hip Thrust', 'Seated Calf Raise'),
    ],
  },
  {
    id: 'arm-specialization-4x',
    priorities: { quads: 'maintain', hamstrings: 'maintain', calves: 'maintain' },
    name: 'Arm Specialization 4x',
    level: 'Advanced',
    description: 'Biceps and triceps 3x/week at high volume while legs and torso tick over at maintenance. Run for one meso, then return to balanced training.',
    environment: 'gym',
    weeksTotal: 5,
    days: [
      day('Arms + Chest', 'Barbell Bench Press', 'EZ-Bar Curl', 'Cable Pushdown (Bar)', 'Incline Dumbbell Curl', 'Overhead Cable Extension'),
      day('Legs (maintenance)', 'Back Squat', 'Lying Leg Curl', 'Standing Calf Raise'),
      day('Arms + Back', 'Chin-Up', 'Preacher Curl', 'Skull Crusher', 'Hammer Curl', 'Cable Pushdown (Rope)'),
      day('Arms + Shoulders', 'Dumbbell Shoulder Press', 'Bayesian Cable Curl', 'Dip Machine', 'Dumbbell Lateral Raise', 'Face Pull'),
    ],
  },
  {
    id: 'chest-back-specialization-4x',
    priorities: { quads: 'maintain', hamstrings: 'maintain', calves: 'maintain' },
    name: 'Chest & Back Specialization 4x',
    level: 'Advanced',
    description: 'Torso-focused meso: chest and back trained hard twice each with supersets in spirit, arms and legs at maintenance. For when the mirror says "more torso".',
    environment: 'gym',
    weeksTotal: 5,
    days: [
      day('Chest + Back 1', 'Barbell Bench Press', 'Barbell Row', 'Incline Dumbbell Press', 'Lat Pulldown'),
      day('Legs (maintenance)', 'Leg Press', 'Seated Leg Curl', 'Standing Calf Raise'),
      day('Chest + Back 2', 'Weighted Dip', 'Pull-Up', 'Cable Fly (Low-to-High)', 'Chest-Supported Row', 'Straight-Arm Pulldown'),
      day('Shoulders + Arms', 'Dumbbell Shoulder Press', 'Cable Lateral Raise', 'EZ-Bar Curl', 'Cable Pushdown (Rope)'),
    ],
  },
  {
    id: 'glute-emphasis-4x',
    priorities: { chest: 'maintain', back: 'maintain', shoulders: 'maintain', biceps: 'maintain', triceps: 'maintain' },
    name: 'Glute & Hamstring Emphasis 4x',
    level: 'Intermediate',
    description: 'Lower-body-biased split with glutes and hamstrings leading every lower day and upper body held at a productive minimum.',
    environment: 'gym',
    weeksTotal: 5,
    days: [
      day('Glutes + Hams 1', 'Barbell Hip Thrust', 'Bulgarian Split Squat', 'Seated Leg Curl', 'Abduction Machine'),
      day('Upper 1', 'Barbell Bench Press', 'Barbell Row', 'Dumbbell Lateral Raise', 'Cable Pushdown (Bar)'),
      day('Glutes + Hams 2', 'Sumo Deadlift', 'Deep Smith Squat (Glute Bias)', 'Cable Kickback', 'Standing Calf Raise'),
      day('Upper 2', 'Lat Pulldown', 'Dumbbell Shoulder Press', 'EZ-Bar Curl', 'Face Pull'),
    ],
  },
  {
    id: 'minimalist-2x',
    name: 'Minimalist 2x — Busy Season',
    level: 'All levels',
    description: 'Two ~45-minute sessions that keep everything growing (or at worst, keep everything you have). For deadline weeks, new parents, and travel-heavy months.',
    environment: 'gym',
    weeksTotal: 4,
    days: [
      day('Session A', 'Hack Squat', 'Dumbbell Bench Press', 'Lat Pulldown', 'Seated Leg Curl'),
      day('Session B', 'Leg Press', 'Overhead Press', 'Chest-Supported Row', 'Dumbbell Lateral Raise'),
    ],
  },
  {
    id: 'powerbuilding-4x',
    name: 'Powerbuilding 4x',
    level: 'Intermediate–Advanced',
    description: 'Strength and size in one block: a heavy compound opens every session, hypertrophy work fills in behind it. For lifters who still care about the number on the bar.',
    environment: 'gym',
    weeksTotal: 5,
    days: [
      day('Squat + Lower', 'Back Squat', 'Romanian Deadlift', 'Leg Extension', 'Standing Calf Raise'),
      day('Bench + Upper', 'Barbell Bench Press', 'Chest-Supported Row', 'Dumbbell Lateral Raise', 'Cable Pushdown (Bar)'),
      day('Deadlift + Lower', 'Deadlift', 'Leg Press', 'Seated Leg Curl', 'Cable Crunch'),
      day('Press + Upper', 'Overhead Press', 'Wide-Grip Lat Pulldown', 'Incline Dumbbell Press', 'EZ-Bar Curl'),
    ],
  },
  {
    id: 'time-crunch-3x',
    name: 'Time-Crunch 3x — 40 minutes',
    level: 'All levels',
    description: 'Four movements a session, rest kept honest by the timer, everything trained twice a week. The plan for the month your calendar wins.',
    environment: 'gym',
    weeksTotal: 4,
    days: [
      day('A', 'Hack Squat', 'Dumbbell Bench Press', 'Neutral-Grip Pulldown', 'Seated Leg Curl'),
      day('B', 'Leg Press', 'Machine Shoulder Press', 'Chest-Supported Row', 'Cable Crunch'),
      day('C', 'Dumbbell Romanian Deadlift', 'Machine Chest Press', 'Seated Cable Row', 'Standing Calf Raise'),
    ],
  },
  // ----- calisthenics (bar park) -----
  {
    id: 'bar-park-full-body-3x',
    name: 'Bar Park Full Body 3x',
    level: 'Beginner–Intermediate',
    description: 'Three sessions at the bars: pull, push, squat every visit. When you top a rep range, the engine advances you to the harder variation instead of adding plates.',
    environment: 'calisthenics',
    weeksTotal: 5,
    days: [
      day('Bars A', 'Pull-Up', 'Push-Up', 'Split Squat (Bodyweight)', 'Glute Bridge', 'V-Up'),
      day('Bars B', 'Bar Dip', 'Inverted Row', 'Bodyweight Squat', 'Sliding Leg Curl', 'Hanging Leg Raise'),
      day('Bars C', 'Chin-Up', 'Deficit Push-Up', 'Single-Leg Hip Hinge', 'Single-Leg Calf Raise (Step)', 'Low-Bar Bodyweight Curl'),
    ],
  },
  {
    id: 'street-upper-lower-4x',
    name: 'Street Upper / Lower 4x',
    level: 'Intermediate',
    description: 'The classic split, no plates required. Weighted-vest ready: log added weight on any set and the engine switches that movement to load progression.',
    environment: 'calisthenics',
    weeksTotal: 5,
    days: [
      day('Upper 1', 'Pull-Up', 'Bar Dip', 'Inverted Row', 'Pike Push-Up'),
      day('Lower 1', 'Split Squat (Bodyweight)', 'Sliding Leg Curl', 'Glute Bridge', 'Single-Leg Calf Raise (Step)'),
      day('Upper 2', 'Chin-Up', 'Deficit Push-Up', 'Feet-Elevated Inverted Row', 'Low-Bar Bodyweight Curl', 'Hanging Leg Raise'),
      day('Lower 2', 'Pistol Squat (Assisted)', 'Nordic Curl', 'Single-Leg Glute Bridge', 'Single-Leg Hip Hinge'),
    ],
  },
  // ----- home (no equipment) -----
  {
    id: 'home-full-body-3x',
    name: 'No-Equipment Full Body 3x',
    level: 'Beginner–Intermediate',
    description: 'Floor, wall, a doorframe, and a sturdy chair. Every muscle covered three times a week; progression runs through harder variations and rep climbs.',
    environment: 'home',
    weeksTotal: 5,
    days: [
      day('Home A', 'Bodyweight Squat', 'Push-Up', 'Towel Doorframe Row', 'Glute Bridge', 'Reverse Crunch'),
      day('Home B', 'Split Squat (Bodyweight)', 'Pike Push-Up', 'Inverted Row', 'Sliding Leg Curl', 'V-Up'),
      day('Home C', 'Step-Up (High Box)', 'Deficit Push-Up', 'Towel Doorframe Row', 'Single-Leg Hip Hinge', 'Single-Leg Calf Raise (Step)'),
    ],
  },
  {
    id: 'home-upper-lower-4x',
    name: 'Living-Room Upper / Lower 4x',
    level: 'Intermediate',
    description: 'A four-day split that fits between the couch and the wall. Push variations carry chest and shoulders; hinges and bridges keep the posterior chain honest.',
    environment: 'home',
    weeksTotal: 5,
    days: [
      day('Upper 1', 'Push-Up', 'Towel Doorframe Row', 'Pike Push-Up', 'Diamond Push-Up'),
      day('Lower 1', 'Split Squat (Bodyweight)', 'Sliding Leg Curl', 'Glute Bridge', 'Single-Leg Calf Raise (Step)'),
      day('Upper 2', 'Deficit Push-Up', 'Inverted Row', 'Prone Y-Raise', 'Bench Dip'),
      day('Lower 2', 'Step-Up (High Box)', 'Single-Leg Hip Hinge', 'Single-Leg Glute Bridge', 'Reverse Crunch'),
    ],
  },
];
