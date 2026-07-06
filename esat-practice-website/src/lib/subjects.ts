export type Subject = "maths1" | "maths2" | "physics" | "chemistry" | "biology";

export const ALL_SUBJECTS: Subject[] = ["maths1", "maths2", "physics", "chemistry", "biology"];

export const SUBJECT_LABELS: Record<Subject, string> = {
  maths1: "Maths",
  maths2: "Maths 2",
  physics: "Physics",
  chemistry: "Chemistry",
  biology: "Biology",
};

export function subjectForTopic(topic: string | null | undefined): Subject | null {
  if (!topic) return null;
  if (topic.startsWith("MM")) return "maths2";
  if (topic.startsWith("M")) return "maths1";
  if (topic.startsWith("P")) return "physics";
  if (topic.startsWith("C")) return "chemistry";
  if (topic.startsWith("B")) return "biology";
  return null;
}
