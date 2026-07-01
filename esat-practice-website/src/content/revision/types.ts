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

export type RevisionDoc = {
  id: string;
  path: string;
  raw: string;
  meta: RevisionDocMeta;
  Content: ComponentType<any>;
};

export type RevisionModule = {
  slug: RevisionModuleSlug;
  title: string;
  shortTitle: string;
  description: string;
  docs: RevisionDoc[];
};

export type RevisionHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};
