import type { ComponentType } from "react";

export type RevisionModuleSlug = "m1" | "m2" | "physics";

export type RelatedQuestionFilters = {
  topics?: string[];
  years?: number[];
};

export type RevisionDocMeta = {
  slug: string;
  module: RevisionModuleSlug;
  title: string;
  subtitle: string;
  topicCode: string;
  estimatedMinutes: number;
  order: number;
  relatedQuestionFilters?: RelatedQuestionFilters;
};

/** Lightweight doc descriptor available synchronously (metadata only, no content). */
export type RevisionDocEntry = {
  id: string;
  path: string;
  meta: RevisionDocMeta;
};

/** A doc entry with its compiled MDX component, loaded on demand. */
export type RevisionDoc = RevisionDocEntry & {
  Content: ComponentType<any>;
};

export type RevisionModule = {
  slug: RevisionModuleSlug;
  title: string;
  shortTitle: string;
  docs: RevisionDocEntry[];
};

export type RevisionHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};
