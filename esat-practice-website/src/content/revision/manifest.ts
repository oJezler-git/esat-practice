import type { RevisionDoc, RevisionDocMeta, RevisionModule, RevisionModuleSlug } from "./types";

type MdxModule = {
  default: RevisionDoc["Content"];
  meta: RevisionDocMeta;
};

const moduleInfo: Record<RevisionModuleSlug, Omit<RevisionModule, "docs">> = {
  m1: {
    slug: "m1",
    title: "Mathematics 1",
    shortTitle: "M1",
    description: "Core number, algebra, geometry, graphs, and standard problem-solving fluency.",
  },
  m2: {
    slug: "m2",
    title: "Mathematics 2",
    shortTitle: "M2",
    description: "Advanced algebra, calculus, complex numbers, differential equations, and harder modelling.",
  },
  physics: {
    slug: "physics",
    title: "Physics",
    shortTitle: "Physics",
    description: "Mechanics, waves, electricity, thermal physics, and practical reasoning under time pressure.",
  },
};

const modules = import.meta.glob<MdxModule>("./topics/**/*.mdx", { eager: true });
type RawModule = string | { default: string };

const rawModules = import.meta.glob<RawModule>("./topics/**/*.mdx", {
  eager: true,
  query: "?raw",
  import: "default",
});

export const revisionDocs: RevisionDoc[] = Object.entries(modules)
  .map(([path, mod]) => {
    const rawModule = rawModules[path];
    const raw = typeof rawModule === "string" ? rawModule : rawModule?.default ?? "";
    const id = `${mod.meta.module}/${mod.meta.slug}`;

    return {
      id,
      path,
      raw,
      meta: mod.meta,
      Content: mod.default,
    };
  })
  .sort(compareDocs);

export const revisionModules: RevisionModule[] = (Object.keys(moduleInfo) as RevisionModuleSlug[])
  .map((slug) => ({
    ...moduleInfo[slug],
    docs: revisionDocs.filter((doc) => doc.meta.module === slug).sort(compareDocs),
  }));

export function compareDocs(left: RevisionDoc, right: RevisionDoc): number {
  return (
    left.meta.module.localeCompare(right.meta.module) ||
    left.meta.order - right.meta.order ||
    left.meta.title.localeCompare(right.meta.title)
  );
}

export function findRevisionDoc(moduleSlug: string | undefined, topicSlug: string | undefined): RevisionDoc | undefined {
  if (!moduleSlug || !topicSlug) {
    return undefined;
  }

  return revisionDocs.find(
    (doc) => doc.meta.module === moduleSlug && doc.meta.slug === topicSlug,
  );
}

export function getFirstRevisionDoc(): RevisionDoc | undefined {
  return revisionDocs[0];
}

export function getRevisionModule(slug: RevisionModuleSlug): RevisionModule {
  return revisionModules.find((module) => module.slug === slug) ?? revisionModules[0];
}
