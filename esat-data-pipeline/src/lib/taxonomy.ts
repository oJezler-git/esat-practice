export const ESAT_TAXONOMY = {
  "Mathematics 1": {
    "M1. Units": "Standard and compound units (speed, density, pressure)",
    "M2. Number":
      "Arithmetic, primes, indices, surds, standard form, fractions, decimals, percentages, bounds, rounding",
    "M3. Ratio and Proportion":
      "Scale, ratio, fractions, percentages, direct/inverse proportion, growth and decay",
    "M4. Algebra":
      "Linear/quadratic equations, simultaneous equations, inequalities, sequences, graph sketching, gradients",
    "M5. Geometry":
      "Angles, polygons, circles, area, volume, transformations, vectors, similarity, Pythagoras, trigonometry",
    "M6. Statistics":
      "Charts, averages, spread, sampling, cumulative frequency, box plots",
    "M7. Probability":
      "Basic probability, combined events, tree diagrams, Venn diagrams, conditional probability",
  },
  "Mathematics 2": {
    "MM1. Algebra and Functions":
      "Function notation, domain/range, composite and inverse functions, transformations",
    "MM2. Sequences and Series":
      "Arithmetic and geometric sequences, sigma notation, binomial expansion",
    "MM3. Coordinate Geometry":
      "Line equations, circles, intersection of curves",
    "MM4. Trigonometry":
      "Sine/cosine rules, exact values, identities, radians, solving trig equations",
    "MM5. Exponentials and Logarithms":
      "Exponential functions, log laws, solving exponential equations, natural log",
    "MM6. Differentiation":
      "First principles, polynomial differentiation, tangents/normals, stationary points, chain/product/quotient rules",
    "MM7. Integration":
      "Indefinite/definite integrals, area under curve, reverse chain rule",
    "MM8. Graphs of Functions":
      "Curve sketching, asymptotes, transformations, intersection of graphs",
  },
  Physics: {
    "P1. Electricity": "Current, voltage, resistance, power, circuits, fields",
    "P2. Magnetism": "Magnetic fields, motor effect, electromagnetic induction",
    "P3. Mechanics":
      "Forces, motion, Newton's laws, momentum, energy, work, power",
    "P4. Thermal Physics":
      "Temperature, heat transfer, specific heat capacity, gas laws",
    "P5. Matter": "Density, pressure, states of matter, atomic structure",
    "P6. Waves":
      "Wave properties, sound, light, reflection, refraction, EM spectrum",
    "P7. Radioactivity":
      "Decay types, half-life, nuclear equations, fission/fusion",
  },
};

export type ESATModule = keyof typeof ESAT_TAXONOMY;
