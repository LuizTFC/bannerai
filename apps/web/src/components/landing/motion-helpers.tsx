"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Fades/slides children in when they enter the viewport. Respects reduced motion. */
export function Reveal({ children, className, delay = 0, y = 28, once = true }: { children: React.ReactNode; className?: string; delay?: number; y?: number; once?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/** Staggers the reveal of its direct children. */
export function RevealGroup({ children, className, stagger = 0.08 }: { children: React.ReactNode; className?: string; stagger?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export const revealItem = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

/**
 * Moves children vertically at a fraction of the scroll speed while the wrapper is on screen.
 * `speed` > 0 lags behind (background feel), < 0 moves ahead (foreground feel).
 */
export function Parallax({ children, className, speed = 0.2, rotate = 0 }: { children?: React.ReactNode; className?: string; speed?: number; rotate?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [speed * 160, speed * -160]);
  const r = useTransform(scrollYProgress, [0, 1], [-rotate, rotate]);
  const smoothY = useSpring(y, { stiffness: 80, damping: 22, mass: 0.6 });
  return (
    <motion.div ref={ref} className={cn("will-change-transform", className)} style={reduce ? undefined : { y: smoothY, rotate: r }}>
      {children}
    </motion.div>
  );
}

/** Scroll progress of a section as a 0–1 MotionValue, for scroll-linked effects. */
export function useSectionProgress(ref: React.RefObject<HTMLElement | null>): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  return scrollYProgress;
}
