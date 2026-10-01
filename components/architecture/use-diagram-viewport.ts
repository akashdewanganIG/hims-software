"use client";

import * as React from "react";

const PADDING = 28;
const MIN_ZOOM = 0.28;
const MAX_ZOOM = 2;

export function useDiagramViewport({
  width,
  height,
  signature,
}: {
  width: number;
  height: number;
  signature: string;
}) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: PADDING, y: PADDING });

  const clampZoom = React.useCallback(
    (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)),
    []
  );

  const fitToScreen = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !width || !height) return;
    const { clientWidth, clientHeight } = viewport;
    if (!clientWidth || !clientHeight) return;
    const next = clampZoom(
      Math.min(
        (clientWidth - PADDING * 2) / width,
        (clientHeight - PADDING * 2) / height
      )
    );
    setZoom(next);
    setPan({
      x: (clientWidth - width * next) / 2,
      y: (clientHeight - height * next) / 2,
    });
  }, [clampZoom, height, width]);

  const zoomBy = React.useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      setZoom(current => {
        const next = clampZoom(current * factor);
        if (viewport) {
          const centreX = viewport.clientWidth / 2;
          const centreY = viewport.clientHeight / 2;
          setPan(position => ({
            x: centreX - ((centreX - position.x) / current) * next,
            y: centreY - ((centreY - position.y) / current) * next,
          }));
        }
        return next;
      });
    },
    [clampZoom]
  );

  const reset = React.useCallback(() => {
    setZoom(1);
    setPan({ x: PADDING, y: PADDING });
  }, []);

  React.useEffect(() => {
    if (!width || !height) return;
    const frame = window.requestAnimationFrame(fitToScreen);
    return () => window.cancelAnimationFrame(frame);
  }, [fitToScreen, height, signature, width]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => fitToScreen());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitToScreen]);

  const drag = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-diagram-node]")) return;
    if (event.button !== 0) return;
    viewportRef.current?.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setPan({
      x: current.originX + event.clientX - current.startX,
      y: current.originY + event.clientY - current.startY,
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (viewportRef.current?.hasPointerCapture(event.pointerId))
      viewportRef.current.releasePointerCapture(event.pointerId);
    drag.current = null;
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08);
      return;
    }
    setPan(current => ({
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  };

  return {
    viewportRef,
    zoom,
    pan,
    zoomBy,
    fitToScreen,
    reset,
    viewportProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onWheel,
    },
  };
}
