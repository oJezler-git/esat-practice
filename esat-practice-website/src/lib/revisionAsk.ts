import { getApiUrl } from "./cloudSync";

export type RevisionAskTurn = {
  role: "user" | "model";
  text: string;
};

export async function askRevisionQuestion(
  moduleSlug: string,
  topicSlug: string,
  question: string,
  history: RevisionAskTurn[] = [],
): Promise<string> {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/revision/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleSlug, topicSlug, question, history }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { answer?: string };
  if (!data.answer) {
    throw new Error("The AI assistant did not return an answer.");
  }
  return data.answer;
}
