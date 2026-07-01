declare module "*.mdx" {
  import type { ComponentType } from "react";
  import type { RevisionDocMeta } from "../content/revision/types";

  export const meta: RevisionDocMeta;
  const MDXContent: ComponentType<any>;
  export default MDXContent;
}
