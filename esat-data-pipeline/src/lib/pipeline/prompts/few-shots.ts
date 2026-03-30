const FEW_SHOTS = [
  {
    question:
      "A car accelerates uniformly from rest to 20 m/s in 5 s. Find its acceleration.",
    primary: "P3. Mechanics",
    secondary: [],
    alternatives: [],
    confidence: 0.96,
    ambiguous: false,
  },
  {
    // Misleading: mentions "compressed" and "pressure" but it's gas laws (P-T-V) not mechanics/forces
    question:
      "A fixed mass of gas is compressed at constant temperature. Explain what happens to the pressure.",
    primary: "P5. Matter",
    secondary: [],
    alternatives: ["P3. Mechanics", "P4. Thermal Physics"],
    confidence: 0.72,
    ambiguous: true,
  },
  {
    question: "Solve 2x^2 - 7x + 3 = 0.",
    primary: "M4. Algebra",
    secondary: [],
    alternatives: ["MM1. Algebra and Functions"],
    confidence: 0.94,
    ambiguous: false,
  },
  {
    // Misleading: looks like algebra manipulation but the tested concept is arithmetic series
    question:
      "The nth term of a sequence is given by 3n - 1. Find the sum of the first 20 terms.",
    primary: "MM2. Sequences and Series",
    secondary: [],
    alternatives: ["M4. Algebra"],
    confidence: 0.85,
    ambiguous: false,
  },
  {
    question: "Find the gradient of y = 3x^3 - 2x at x = 2.",
    primary: "MM6. Differentiation",
    secondary: ["MM8. Graphs of Functions"],
    alternatives: ["M4. Algebra"],
    confidence: 0.95,
    ambiguous: false,
  },
  {
    // Multi-topic: differentiation plus a coordinate-geometry output (tangent equation)
    question: "Find the equation of the tangent to y = x^2 + 3 at x = 2.",
    primary: "MM6. Differentiation",
    secondary: ["MM3. Coordinate Geometry"],
    alternatives: [],
    confidence: 0.88,
    ambiguous: false,
  },
  {
    question:
      "A capacitor and resistor are connected in series to a battery. Describe how current changes with time.",
    primary: "P1. Electricity",
    secondary: [],
    alternatives: ["P4. Thermal Physics"],
    confidence: 0.88,
    ambiguous: false,
  },
  {
    question:
      "A sample has count rate 640 counts per minute and half-life 20 minutes. Find rate after 1 hour.",
    primary: "P7. Radioactivity",
    secondary: [],
    alternatives: [],
    confidence: 0.93,
    ambiguous: false,
  },
  {
    question:
      "Find the area between y = x^2 and the x-axis from x = 0 to x = 3.",
    primary: "MM7. Integration",
    secondary: [],
    alternatives: ["MM6. Differentiation"],
    confidence: 0.95,
    ambiguous: false,
  },
  {
    question:
      "The probability of rain is 0.3 and the probability of wind is 0.4. The probability of both is 0.15. Find probability of rain or wind.",
    primary: "M7. Probability",
    secondary: [],
    alternatives: [],
    confidence: 0.97,
    ambiguous: false,
  },
  {
    // Genuine ambiguity between coordinate geometry and pure geometry language
    question:
      "A circle has equation x^2 + y^2 - 4x + 6y = 3. Find its centre and radius.",
    primary: "MM3. Coordinate Geometry",
    secondary: [],
    alternatives: ["M5. Geometry"],
    confidence: 0.79,
    ambiguous: true,
  },
  {
    question:
      "A gas is heated at constant pressure and volume changes from 2.0 m^3 to 2.4 m^3. Describe the relation between temperature and volume.",
    primary: "P4. Thermal Physics",
    secondary: [],
    alternatives: ["P5. Matter"],
    confidence: 0.84,
    ambiguous: true,
  },
];

/**
 * Serialises Stage 1 examples into prompt-ready text.
 * We keep examples in code (not external JSON) so edits can carry explanatory
 * comments about why a sample is intentionally tricky.
 *
 * @returns {string} Multi-example few-shot section for Stage 1 prompts.
 */
export function serialiseFewShots(): string {
  return FEW_SHOTS.map((shot, index) => {
    const sample = {
      question_id: `example-${index + 1}`,
      primary_topic: shot.primary,
      secondary_topics: shot.secondary,
      alternative_topics: shot.alternatives,
      confidence: shot.confidence,
      ambiguous: shot.ambiguous,
    };
    return `Example ${index + 1}\nInput question:\n${shot.question}\nOutput JSON item:\n${JSON.stringify(sample, null, 2)}`;
  }).join("\n\n");
}

const MODEL_B_FEW_SHOTS = [
  {
    input: {
      question: {
        question_id: "b-example-1",
        question_text: "Find the area under y = 3x^2 between x = 0 and x = 2.",
      },
      model_a_result: {
        question_id: "b-example-1",
        primary_topic: "MM6. Differentiation",
        secondary_topics: ["MM8. Graphs of Functions"],
        alternative_topics: ["MM7. Integration"],
        confidence: 0.62,
        ambiguous: false,
        uncertainty_score: 0.55,
      },
    },
    output: {
      results: [
        {
          question_id: "b-example-1",
          primary_topic: "MM7. Integration",
          secondary_topics: [],
          alternative_topics: ["MM6. Differentiation"],
          confidence: 0.93,
          ambiguous: false,
        },
      ],
    },
  },
  {
    input: {
      question: {
        question_id: "b-example-2",
        question_text:
          "A coil is moved through a magnetic field. Explain why an emf is induced and how it depends on the speed of motion.",
      },
      model_a_result: {
        question_id: "b-example-2",
        primary_topic: "P1. Electricity",
        secondary_topics: [],
        alternative_topics: ["P2. Magnetism"],
        confidence: 0.58,
        ambiguous: true,
        uncertainty_score: 0.69,
      },
    },
    output: {
      results: [
        {
          question_id: "b-example-2",
          primary_topic: "P2. Magnetism",
          secondary_topics: ["P1. Electricity"],
          alternative_topics: [],
          confidence: 0.9,
          ambiguous: false,
        },
      ],
    },
  },
  {
    input: {
      question: {
        question_id: "b-example-3",
        question_text:
          "The mean of a data set is 12 and the standard deviation is 3. Find the z-score for a value of 18.",
      },
      model_a_result: {
        question_id: "b-example-3",
        primary_topic: "M7. Probability",
        secondary_topics: [],
        alternative_topics: ["M6. Statistics"],
        confidence: 0.57,
        ambiguous: false,
        uncertainty_score: 0.56,
      },
    },
    output: {
      results: [
        {
          question_id: "b-example-3",
          primary_topic: "M6. Statistics",
          secondary_topics: [],
          alternative_topics: ["M7. Probability"],
          confidence: 0.86,
          ambiguous: false,
        },
      ],
    },
  },
];

/**
 * Serialises Stage 2 "review/correction" examples.
 * These examples are biased toward disagreement cases to teach the reviewer model
 * when it should actively override Stage 1.
 *
 * @returns {string} Multi-example few-shot section for Stage 2 reviewer prompts.
 */
export function serialiseModelBFewShots(): string {
  return MODEL_B_FEW_SHOTS.map(
    (shot, index) =>
      `Example ${index + 1}\nInput:\n${JSON.stringify(shot.input, null, 2)}\nOutput:\n${JSON.stringify(shot.output, null, 2)}`,
  ).join("\n\n");
}
