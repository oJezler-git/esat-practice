import type { ComponentType } from "react";
import metaEntries from "./revision-meta.json";
import type {
  RevisionDocEntry,
  RevisionDocMeta,
  RevisionModule,
  RevisionModuleSlug,
} from "./types";

type MdxModule = {
  default: ComponentType<any>;
  meta: RevisionDocMeta;
};

const moduleInfo: Record<RevisionModuleSlug, Omit<RevisionModule, "docs">> = {
  m1: {
    slug: "m1",
    title: "Mathematics 1",
    shortTitle: "M1",
  },
  m2: {
    slug: "m2",
    title: "Mathematics 2",
    shortTitle: "M2",
  },
  physics: {
    slug: "physics",
    title: "Physics",
    shortTitle: "Physics",
  },
};

// Lazy: each compiled guide is its own chunk, fetched only when its topic is opened.
const contentLoaders = import.meta.glob<MdxModule>("./topics/**/*.mdx");

// Lazy: raw MDX source, fetched only when "Copy page" is used.
const rawLoaders = import.meta.glob<string>("./topics/**/*.mdx", {
  query: "?raw",
  import: "default",
});

type MetaEntry = { path: string; meta: RevisionDocMeta };

export const revisionDocs: RevisionDocEntry[] = (metaEntries as MetaEntry[])
  .map(({ path, meta }) => ({
    id: `${meta.module}/${meta.slug}`,
    path,
    meta,
  }))
  .sort(compareDocs);

export const revisionModules: RevisionModule[] = (Object.keys(moduleInfo) as RevisionModuleSlug[])
  .map((slug) => ({
    ...moduleInfo[slug],
    docs: revisionDocs.filter((doc) => doc.meta.module === slug).sort(compareDocs),
  }));

export function compareDocs(left: RevisionDocEntry, right: RevisionDocEntry): number {
  return (
    left.meta.module.localeCompare(right.meta.module) ||
    left.meta.order - right.meta.order ||
    left.meta.title.localeCompare(right.meta.title)
  );
}

export function findRevisionDoc(
  moduleSlug: string | undefined,
  topicSlug: string | undefined,
): RevisionDocEntry | undefined {
  if (!moduleSlug || !topicSlug) {
    return undefined;
  }

  return revisionDocs.find(
    (doc) => doc.meta.module === moduleSlug && doc.meta.slug === topicSlug,
  );
}

export function getFirstRevisionDoc(): RevisionDocEntry | undefined {
  return revisionDocs[0];
}

export function getRevisionModule(slug: RevisionModuleSlug): RevisionModule {
  return revisionModules.find((module) => module.slug === slug) ?? revisionModules[0];
}

const prefetched = new Set<string>();
const contentCache = new Map<string, ComponentType<any>>();

/** Warms a doc's compiled MDX chunk ahead of navigation (e.g. on link hover/focus). */
export function prefetchRevisionContent(path: string): void {
  if (prefetched.has(path) || contentCache.has(path)) {
    return;
  }
  if (!contentLoaders[path]) {
    return;
  }
  prefetched.add(path);
  void loadRevisionContent(path).catch(() => {
    // Allow a retry on a later hover if the prefetch failed.
    prefetched.delete(path);
  });
}

/** Loads the compiled MDX component for a doc on demand. */
export async function loadRevisionContent(path: string): Promise<ComponentType<any>> {
  const cached = contentCache.get(path);
  if (cached) {
    return cached;
  }
  const loader = contentLoaders[path];
  if (!loader) {
    throw new Error(`No revision content registered for ${path}`);
  }
  const mod = await loader();
  contentCache.set(path, mod.default);
  return mod.default;
}

/** Loads the raw MDX source for a doc on demand (used for "Copy page"). */
export async function loadRevisionRaw(path: string): Promise<string> {
  const loader = rawLoaders[path];
  if (!loader) {
    return "";
  }
  return loader();
}
