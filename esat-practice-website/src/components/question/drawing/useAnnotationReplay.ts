import { useEffect, useRef, useState } from "react";
import type { Annotation } from "../../../types/annotations";
import { replayTiming } from "../annotationGeometry";

type ReplayState = { order: Map<string, number>; step: number; dur: number };

/**
 * Bumped each time annotations are (re)loaded from storage, `replayNonce`
 * triggers a fast staggered "draw-in" replay of the loaded strokes; freshly
 * drawn strokes (which don't change the nonce) appear instantly.
 */
export function useAnnotationReplay(annotations: Annotation[], replayNonce = 0) {
  const [replay, setReplay] = useState<ReplayState | null>(null);
  const replayTimerRef = useRef<number | null>(null);
  const annotationsRef = useRef<Annotation[]>(annotations);
  annotationsRef.current = annotations;

  useEffect(() => {
    return () => {
      if (replayTimerRef.current !== null) window.clearTimeout(replayTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (replayNonce <= 0) return;
    if (replayTimerRef.current !== null) {
      window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    const items = annotationsRef.current;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (items.length === 0 || prefersReduced) {
      setReplay(null);
      return;
    }

    const order = new Map<string, number>();
    items.forEach((ann, index) => order.set(ann.id, index));
    const { step, dur, total } = replayTiming(items.length);

    setReplay({ order, step, dur });
    replayTimerRef.current = window.setTimeout(() => {
      setReplay(null);
      replayTimerRef.current = null;
    }, total);
  }, [replayNonce]);

  const getReplay = (id: string): { delay: number; dur: number } | null => {
    if (!replay) return null;
    const index = replay.order.get(id);
    if (index === undefined) return null;
    return { delay: index * replay.step, dur: replay.dur };
  };

  return { getReplay };
}
