export const ROUTES = {
  home: "/",
  practiceSetup: "/practice",
  session: "/session/:id",
  results: "/results/:id",
  questionBank: "/question-bank",
  progress: "/progress",
  settings: "/settings",
} as const;

export const routeForSession = (sessionId: string): string =>
  `/session/${sessionId}`;

export const routeForResults = (sessionId: string): string =>
  `/results/${sessionId}`;
