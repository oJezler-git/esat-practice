// Annotation types for the source-scan drawing layer.
// All geometry is stored in the image's natural-pixel coordinate space so it
// stays locked to the scan regardless of zoom/pan, and ink scales with the
// paper the way real pen-on-paper does.

export type AnnPoint = { x: number; y: number };

export type AnnTool =
  | "pan"
  | "pen"
  | "highlighter"
  | "eraser"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "text";

export type FreehandKind = "pen" | "highlighter";
export type ShapeKind = "line" | "arrow" | "rect" | "ellipse";

export type FreehandAnnotation = {
  id: string;
  kind: FreehandKind;
  color: string;
  width: number;
  points: AnnPoint[];
};

export type ShapeAnnotation = {
  id: string;
  kind: ShapeKind;
  color: string;
  width: number;
  start: AnnPoint;
  end: AnnPoint;
};

export type TextAnnotation = {
  id: string;
  kind: "text";
  color: string;
  x: number;
  y: number;
  fontSize: number;
  text: string;
};

export type Annotation = FreehandAnnotation | ShapeAnnotation | TextAnnotation;

export const ANNOTATION_COLORS = [
  "#1f2933", // ink
  "#d92d20", // red
  "#1570ef", // blue
  "#0a8754", // green
  "#f79009", // amber
  "#7c3aed", // violet
] as const;

export const HIGHLIGHTER_COLORS = [
  "#fde047", // yellow
  "#86efac", // green
  "#93c5fd", // blue
  "#f9a8d4", // pink
] as const;
