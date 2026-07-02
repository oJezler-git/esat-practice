import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// Kept in a standalone module so the (heavy) markdown + KaTeX stack is a lazy
// chunk, loaded only once the Ask panel actually renders an answer.
const remarkPlugins: Options["remarkPlugins"] = [remarkGfm, remarkMath];
// output: "html" matches the pre-rendered guide math (no duplicate MathML).
const rehypePlugins: Options["rehypePlugins"] = [[rehypeKatex, { output: "html" }]];

export default function RevisionMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
      {children}
    </ReactMarkdown>
  );
}
