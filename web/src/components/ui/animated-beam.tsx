"use client";

import {
  useEffect,
  useId,
  useState,
  type RefObject,
} from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type AnimatedBeamProps = {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
};

/**
 * Aceternity / Magic UI–style animated beam between two anchored nodes.
 */
export function AnimatedBeam({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration = 4.5,
  delay = 0,
  pathColor = "var(--line)",
  pathWidth = 1.5,
  pathOpacity = 0.55,
  gradientStartColor = "#4cc9f0",
  gradientStopColor = "#0f9bc8",
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}: AnimatedBeamProps) {
  const id = useId().replace(/:/g, "");
  const [pathD, setPathD] = useState("");
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const from = fromRef.current;
      const to = toRef.current;
      if (!from || !to) return;

      const containerRect = container.getBoundingClientRect();
      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();

      const width = containerRect.width;
      const height = containerRect.height;
      setSvgSize({ width, height });

      const startX =
        fromRect.left - containerRect.left + fromRect.width / 2 + startXOffset;
      const startY =
        fromRect.top - containerRect.top + fromRect.height / 2 + startYOffset;
      const endX =
        toRect.left - containerRect.left + toRect.width / 2 + endXOffset;
      const endY =
        toRect.top - containerRect.top + toRect.height / 2 + endYOffset;

      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2 - curvature;

      setPathD(
        `M ${startX},${startY} Q ${midX},${midY} ${endX},${endY}`,
      );
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(container);
    if (fromRef.current) ro.observe(fromRef.current);
    if (toRef.current) ro.observe(toRef.current);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [
    containerRef,
    fromRef,
    toRef,
    curvature,
    startXOffset,
    startYOffset,
    endXOffset,
    endYOffset,
  ]);

  const gradientCoords = reverse
    ? {
        x1: ["90%", "-10%"],
        x2: ["100%", "0%"],
        y1: ["0%", "0%"],
        y2: ["0%", "0%"],
      }
    : {
        x1: ["10%", "110%"],
        x2: ["0%", "100%"],
        y1: ["0%", "0%"],
        y2: ["0%", "0%"],
      };

  return (
    <svg
      fill="none"
      width={svgSize.width}
      height={svgSize.height}
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "pointer-events-none absolute left-0 top-0 transform-gpu stroke-2",
        className,
      )}
      viewBox={`0 0 ${svgSize.width} ${svgSize.height}`}
      aria-hidden
    >
      <path
        d={pathD}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
      />
      <path
        d={pathD}
        strokeWidth={pathWidth}
        stroke={`url(#beam-${id})`}
        strokeOpacity={1}
        strokeLinecap="round"
      />
      <defs>
        <motion.linearGradient
          id={`beam-${id}`}
          gradientUnits="userSpaceOnUse"
          initial={{
            x1: "0%",
            x2: "0%",
            y1: "0%",
            y2: "0%",
          }}
          animate={{
            x1: gradientCoords.x1,
            x2: gradientCoords.x2,
            y1: gradientCoords.y1,
            y2: gradientCoords.y2,
          }}
          transition={{
            delay,
            duration,
            ease: [0.16, 1, 0.3, 1],
            repeat: Infinity,
            repeatDelay: 0,
          }}
        >
          <stop stopColor={gradientStartColor} stopOpacity="0" />
          <stop stopColor={gradientStartColor} />
          <stop offset="32.5%" stopColor={gradientStopColor} />
          <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </svg>
  );
}
