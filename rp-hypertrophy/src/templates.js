// Pre-built mesocycle templates, in the spirit of RP's template gallery.
// Each resolves exercise names against the built-in library at load time.

import { EXERCISES } from './exercises.js';

const idOf = (name) => {
  const ex = EXERCISES.find((e) => e.name === name);
  if (!ex) throw new Error(`Template references unknown exercise: ${name}`);
  return ex.id;
};

const day = (name, ...exerciseNames) => ({ name, slots: exerciseNames.map((n) => ({ exerciseId: idOf(n) })) });

export const TEMPLATES = [
  {
    id: 'full-body-3x',
    name: 'Full Body 3x/week',
    description: 'Three full-body days. Great first mesocycle — every muscle 2-3x per week at moderate volume.',
    weeksTotal: 5,
    days: [
      day('Full Body A', 'Back Squat', 'Barbell Bench Press', 'Barbell Row', 'Dumbbell Lateral Raise', 'Cable Crunch'),
      day('Full Body B', 'Romanian Deadlift', 'Overhead Press', 'Lat Pulldown', 'Barbell Curl', 'Standing Calf Raise'),
      day('Full Body C', 'Leg Press', 'Incline Dumbbell Press', 'Seated Cable Row', 'Cable Pushdown', 'Hanging Leg Raise'),
    ],
  },
  {
    id: 'upper-lower-4x',
    name: 'Upper / Lower 4x/week',
    description: 'Classic upper/lower split. Balanced volume with each muscle trained twice a week.',
    weeksTotal: 5,
    days: [
      day('Upper 1', 'Barbell Bench Press', 'Barbell Row', 'Overhead Press', 'Barbell Curl', 'Cable Pushdown'),
      day('Lower 1', 'Back Squat', 'Romanian Deadlift', 'Leg Extension', 'Standing Calf Raise', 'Cable Crunch'),
      day('Upper 2', 'Incline Dumbbell Press', 'Lat Pulldown', 'Dumbbell Lateral Raise', 'Hammer Curl', 'Skull Crusher'),
      day('Lower 2', 'Leg Press', 'Lying Leg Curl', 'Hip Thrust', 'Seated Calf Raise', 'Hanging Leg Raise'),
    ],
  },
  {
    id: 'ppl-6x',
    name: 'Push / Pull / Legs 6x/week',
    description: 'High-frequency PPL for experienced lifters chasing maximum volume.',
    weeksTotal: 6,
    days: [
      day('Push 1', 'Barbell Bench Press', 'Overhead Press', 'Cable Fly', 'Cable Pushdown'),
      day('Pull 1', 'Barbell Row', 'Lat Pulldown', 'Face Pull', 'Barbell Curl'),
      day('Legs 1', 'Back Squat', 'Romanian Deadlift', 'Leg Extension', 'Standing Calf Raise'),
      day('Push 2', 'Incline Dumbbell Press', 'Dumbbell Shoulder Press', 'Dumbbell Lateral Raise', 'Overhead Cable Extension'),
      day('Pull 2', 'Pull-Up', 'Seated Cable Row', 'Reverse Pec Deck', 'Incline Dumbbell Curl'),
      day('Legs 2', 'Leg Press', 'Lying Leg Curl', 'Hip Thrust', 'Seated Calf Raise'),
    ],
  },
  {
    id: 'glute-emphasis-4x',
    name: 'Glute Emphasis 4x/week',
    description: 'Lower-body-biased split with extra glute and hamstring volume.',
    weeksTotal: 5,
    days: [
      day('Lower (Glute) 1', 'Hip Thrust', 'Bulgarian Split Squat', 'Cable Kickback', 'Standing Calf Raise'),
      day('Upper 1', 'Barbell Bench Press', 'Barbell Row', 'Dumbbell Lateral Raise', 'Cable Pushdown'),
      day('Lower (Glute) 2', 'Sumo Deadlift', 'Leg Press', 'Lying Leg Curl', 'Cable Crunch'),
      day('Upper 2', 'Lat Pulldown', 'Dumbbell Shoulder Press', 'Barbell Curl', 'Face Pull'),
    ],
  },
];
