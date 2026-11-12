"use client";

import { CalendarDays, MapPin } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Parallax } from "./motion-helpers";

type Mock = { kicker: string; title: string; details: string };

/** A stylized, CSS-only banner used as hero art. `variant` picks the look; content comes from i18n. */
export function BannerMock({ mock, variant, className, titleScale = 1 }: { mock: Mock; variant: 0 | 1 | 2; className?: string; titleScale?: number }) {
  const looks = [
    { bg: "bg-[radial-gradient(120%_90%_at_20%_10%,#1f1b4d_0%,#0a0820_60%,#04031a_100%)]", accent: "#B583FA", glow: "from-[#603AFC]/50 via-[#F06EA0]/25 to-transparent", text: "text-white" },
    { bg: "bg-[linear-gradient(160deg,#FFF4E6_0%,#FFD9B3_55%,#FFC07A_100%)]", accent: "#D9480F", glow: "from-[#FCA546]/60 via-[#F06EA0]/20 to-transparent", text: "text-[#2a1707]" },
    { bg: "bg-[linear-gradient(150deg,#0E8F8C_0%,#0b6b6a_60%,#06393a_100%)]", accent: "#FFC857", glow: "from-[#FFC857]/40 via-transparent to-transparent", text: "text-white" },
  ] as const;
  const look = looks[variant];
  return (
    <div className={cn("relative overflow-hidden rounded-[22px] border border-white/10 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.55)]", look.bg, className)}>
      <div className={cn("pointer-events-none absolute -right-1/4 -top-1/3 size-[80%] rounded-full bg-gradient-to-br blur-2xl", look.glow)} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px]" />
      <div className={cn("relative flex h-full flex-col justify-between p-[7%]", look.text)}>
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-current/30 px-2.5 py-0.5 text-[0.55em] font-semibold uppercase tracking-[0.18em] opacity-80">{mock.kicker}</span>
          <span className="size-[1.1em] rounded-full" style={{ background: look.accent }} />
        </div>
        <div>
          <p className="font-heading font-bold uppercase leading-[0.92] tracking-tight" style={{ fontSize: `${1.55 * titleScale}em` }}>
            {mock.title}
          </p>
          <span className="mt-[0.5em] block h-[0.12em] w-[2.6em] rounded-full" style={{ background: look.accent }} />
        </div>
        <div className="flex flex-wrap gap-[0.4em] text-[0.58em] font-semibold">
          <span className="inline-flex items-center gap-1 rounded-lg bg-black/20 px-2 py-1 backdrop-blur">
            <CalendarDays className="size-[1.1em]" /> {mock.details}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-black/20 px-2 py-1 backdrop-blur">
            <MapPin className="size-[1.1em]" /> ONE
          </span>
        </div>
      </div>
    </div>
  );
}

/** Three floating banners in a layered, parallaxed composition for the hero. */
export function HeroMockups() {
  const { d } = useT();
  const reduce = useReducedMotion();
  const float = (delay: number) => (reduce ? {} : { y: [0, -10, 0], transition: { duration: 6 + delay, repeat: Infinity, ease: "easeInOut" as const, delay } });
  const [a, b, c] = d.landing.mockups;
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[560px] text-[clamp(10px,2.2vw,16px)]">
      <Parallax speed={0.18} rotate={2} className="absolute left-[2%] top-[8%] w-[46%]">
        <motion.div animate={float(0)} initial={reduce ? false : { opacity: 0, y: 40, rotate: -6 }} whileInView={{ opacity: 1, y: 0, rotate: -6 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
          <BannerMock mock={a!} variant={0} className="aspect-[9/16]" titleScale={1.1} />
        </motion.div>
      </Parallax>
      <Parallax speed={-0.12} rotate={-2} className="absolute right-[0%] top-[0%] w-[58%]">
        <motion.div animate={float(0.8)} initial={reduce ? false : { opacity: 0, y: 50, rotate: 4 }} whileInView={{ opacity: 1, y: 0, rotate: 4 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}>
          <BannerMock mock={b!} variant={1} className="aspect-[16/9]" />
        </motion.div>
      </Parallax>
      <Parallax speed={0.3} rotate={1} className="absolute bottom-[0%] right-[8%] w-[44%]">
        <motion.div animate={float(1.6)} initial={reduce ? false : { opacity: 0, y: 60, rotate: -2 }} whileInView={{ opacity: 1, y: 0, rotate: -2 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}>
          <BannerMock mock={c!} variant={2} className="aspect-square" />
        </motion.div>
      </Parallax>
    </div>
  );
}
