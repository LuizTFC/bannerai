"use client";

import { Bot, CalendarDays, Send, User } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * A looping, self-driving demo of the conversational refinement: each instruction appears in the
 * chat and the banner mock answers with a visible change (bigger title → warmer background →
 * date moves into a card). Plays only while visible; static when reduced motion is on.
 */
export function RefineDemo() {
  const { d, f } = useT();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const [step, setStep] = useState(reduce ? 3 : 0);
  const steps = d.landing.demoInstructions;

  useEffect(() => {
    if (reduce || !inView) return;
    const id = setInterval(() => setStep((s) => (s + 1) % (steps.length + 1)), 2600);
    return () => clearInterval(id);
  }, [inView, reduce, steps.length]);

  const warm = step >= 2;
  const big = step >= 1;
  const dateCard = step >= 3;
  const mock = d.landing.mockups[0]!;

  return (
    <div ref={ref} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      {/* Banner */}
      <div className="relative mx-auto w-full max-w-[520px] text-[clamp(11px,2.3vw,17px)]">
        <motion.div
          layout
          className={cn(
            "relative aspect-[16/10] overflow-hidden rounded-[24px] border border-white/10 shadow-[0_50px_90px_-40px_rgba(0,0,0,0.6)] transition-colors duration-700",
            warm ? "bg-[radial-gradient(120%_100%_at_15%_10%,#5a1d2e_0%,#2a0b1f_55%,#120516_100%)]" : "bg-[radial-gradient(120%_100%_at_15%_10%,#1f1b4d_0%,#0a0820_60%,#04031a_100%)]",
          )}
        >
          <motion.div
            className="pointer-events-none absolute -right-1/4 -top-1/3 size-[80%] rounded-full blur-2xl"
            animate={{ background: warm ? "radial-gradient(closest-side, rgba(252,165,70,0.55), rgba(240,110,160,0.25), transparent)" : "radial-gradient(closest-side, rgba(96,58,252,0.5), rgba(240,110,160,0.2), transparent)" }}
            transition={{ duration: 0.8 }}
          />
          <div className="relative flex h-full flex-col justify-between p-[6%] text-white">
            <span className="w-fit rounded-full border border-white/25 px-2.5 py-0.5 text-[0.55em] font-semibold uppercase tracking-[0.18em] opacity-80">{mock.kicker}</span>
            <div className="flex items-end justify-between gap-4">
              <div>
                <motion.p className="font-heading font-bold uppercase leading-[0.9] tracking-tight" animate={{ fontSize: big ? "2.6em" : "1.7em" }} transition={{ type: "spring", stiffness: 160, damping: 18 }}>
                  {mock.title}
                </motion.p>
                <AnimatePresence>
                  {!dateCard && (
                    <motion.p key="inline-date" className="mt-[0.5em] text-[0.7em] font-medium opacity-80" initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} exit={{ opacity: 0, y: 10 }}>
                      {mock.details}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence>
                {dateCard && (
                  <motion.div
                    key="date-card"
                    layout
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-[0.6em] font-semibold backdrop-blur"
                  >
                    <CalendarDays className="size-[1.2em]" style={{ color: warm ? "#FCA546" : "#B583FA" }} /> {mock.details}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="absolute left-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[0.55em] font-medium text-white/80 backdrop-blur">{f(d.landing.demoVersion, { n: step + 1 })}</div>
        </motion.div>
      </div>

      {/* Chat */}
      <div className="rounded-3xl border bg-card/80 p-4 shadow-sm backdrop-blur sm:p-5">
        <div className="min-h-[220px] space-y-3">
          <AnimatePresence initial={false}>
            {steps.slice(0, step).map((text, i) => (
              <motion.div key={text} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-2">
                <div className="flex justify-end gap-2">
                  <span className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">{text}</span>
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted">
                    <User className="size-4" />
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Bot className="size-4" />
                  </span>
                  <span className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm">
                    {d.chat.applied} <span className="text-muted-foreground">· {f(d.landing.demoVersion, { n: i + 2 })}</span>
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {step === 0 && (
            <div className="flex gap-2">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Bot className="size-4" />
              </span>
              <span className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm">
                {d.chat.hereIsBanner} <span className="text-muted-foreground">· v1</span>
              </span>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-2xl border bg-background px-3 py-2 text-sm text-muted-foreground">
          <span className="flex-1 truncate">{steps[step % steps.length]}</span>
          <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
            <Send className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
