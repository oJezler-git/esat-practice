import { useCallback, useEffect, useRef, useState } from "react";
import type { AnnPoint, Annotation, MathAnnotation, TextAnnotation } from "../../../types/annotations";

type LabelAnnotation = TextAnnotation | MathAnnotation;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface UseLabelEditorArgs {
  color: string;
  fontSize: number;
  onCommit: (annotation: Annotation) => void;
  onErase: (id: string) => void;
  onUpdate: (annotation: Annotation) => void;
  onTextEditingChange?: (editing: boolean) => void;
}

/** State and actions for the text/math label editor overlay (open, edit, commit, cancel). */
export function useLabelEditor({ color, fontSize, onCommit, onErase, onUpdate, onTextEditingChange }: UseLabelEditorArgs) {
  const [editor, setEditor] = useState<{ x: number; y: number } | null>(null);
  const [editorText, setEditorText] = useState("");
  const [editorKind, setEditorKind] = useState<"text" | "math">("text");
  // Non-null when editing an *existing* annotation (so commit calls onUpdate/onErase).
  const [editingId, setEditingId] = useState<string | null>(null);
  const editorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editor) {
      const id = window.requestAnimationFrame(() => editorInputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [editor]);

  const openEditorForLabel = useCallback(
    (ann: LabelAnnotation) => {
      if (ann.kind === "text") {
        // editor.y is the top of the foreignObject; baseline = editor.y + fontSize
        setEditor({ x: ann.x, y: ann.y - ann.fontSize });
        setEditorText(ann.text);
      } else {
        setEditor({ x: ann.x, y: ann.y });
        setEditorText(ann.latex);
      }
      setEditingId(ann.id);
      setEditorKind(ann.kind);
      onTextEditingChange?.(true);
    },
    [onTextEditingChange],
  );

  const commitEditor = useCallback(() => {
    if (!editor) return;
    const text = editorText.trim();
    if (editingId) {
      // Updating an existing annotation: empty text deletes it.
      if (text) {
        onUpdate(
          editorKind === "math"
            ? { id: editingId, kind: "math", color, x: editor.x, y: editor.y, fontSize, latex: text }
            : { id: editingId, kind: "text", color, x: editor.x, y: editor.y + fontSize, fontSize, text },
        );
      } else {
        onErase(editingId);
      }
    } else {
      if (text) {
        onCommit(
          editorKind === "math"
            ? { id: newId(), kind: "math", color, x: editor.x, y: editor.y, fontSize, latex: text }
            : { id: newId(), kind: "text", color, x: editor.x, y: editor.y + fontSize, fontSize, text },
        );
      }
    }
    setEditor(null);
    setEditorText("");
    setEditingId(null);
    onTextEditingChange?.(false);
  }, [color, editingId, editor, editorKind, editorText, fontSize, onCommit, onErase, onUpdate, onTextEditingChange]);

  const cancelEditor = useCallback(() => {
    setEditor(null);
    setEditorText("");
    setEditingId(null);
    onTextEditingChange?.(false);
  }, [onTextEditingChange]);

  // Commits any editor already open (no-op if none), then opens a fresh one at `point`.
  const startNewEditor = useCallback(
    (point: AnnPoint, kind: "text" | "math") => {
      commitEditor();
      setEditor({ x: point.x, y: point.y });
      setEditorText("");
      setEditingId(null);
      setEditorKind(kind);
      onTextEditingChange?.(true);
    },
    [commitEditor, onTextEditingChange],
  );

  return {
    editor,
    editorText,
    editorKind,
    editingId,
    editorInputRef,
    setEditorText,
    openEditorForLabel,
    commitEditor,
    cancelEditor,
    startNewEditor,
  };
}
