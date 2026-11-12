"use client";

import { ArrowRight, ChevronDown, Download, MessageSquareText, Palette, Sparkles } from "lucide-react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Wordmark } from "@/components/brand/logo";
import { CreditPacks } from "@/components/credits/credit-packs";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/endpoints";
import { usePricing } from "@/lib/api/queries";
import { useT } from "@/lib/i18n";
import { currencyForLocale, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { HeroMockups } from "./banner-mockups";
import { Parallax, Reveal, RevealGroup, revealItem, useSectionProgress } from "./motion-helpers";
import { RefineDemo } from "./refine-demo";

const STEP_ICONS = [Sparkles, Palette, MessageSquareText, Download];

/** Animated gradient blobs that drift on their own and slide with the scroll. */
function Backdrop() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 2000], [0, -260]);
  const y2 = useTransform(scrollY, [0, 2000], [0, 180]);
  const y3 = useTransform(scrollY, [0, 2000], [0, -120]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div style={reduce ? undefined : { y: y1 }} className="blob absolute -left-[10%] -top-[10%] size-[55vw] rounded-full bg-[radial-gradient(closest-side,rgba(96,58,252,0.55),transparent_70%)] blur-3xl" />
      <motion.div style={reduce ? undefined : { y: y2 }} className="blob blob-2 absolute -right-[12%] top-[20%] size-[50vw] rounded-full bg-[radial-gradient(closest-side,rgba(240,110,160,0.42),transparent_70%)] blur-3xl" />
      <motion.div style={reduce ? undefined : { y: y3 }} className="blob blob-3 absolute bottom-[-20%] left-[25%] size-[45vw] rounded-full bg-[radial-gradient(closest-side,rgba(252,165,70,0.38),transparent_70%)] blur-3xl" />
      <div className="absolute inset-0 studio-grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
    </div>
  );
}

function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });
  return <motion.div style={{ scaleX }} className="fixed inset-x-0 top-0 z-40 h-[3px] origin-left bg-gradient-to-r from-[#603AFC] via-[#F06EA0] to-[#FCA546]" />;
}

function Marquee({ items }: { items: readonly string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="marquee relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
      <div className="marquee-track flex w-max gap-3 py-1">
        {doubled.map((a, i) => (
          <span key={`${a}-${i}`} className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-4 py-2 text-sm font-medium backdrop-blur">
            <span className="size-1.5 rounded-full bg-gradient-to-r from-[#603AFC] to-[#FCA546]" /> {a}
          </span>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  const { d } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(ref);
  const line = useSpring(progress, { stiffness: 90, damping: 25 });
  return (
    <section ref={ref} className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <h2 className="text-center font-heading text-3xl font-bold tracking-tight sm:text-5xl">{d.landing.howTitle}</h2>
      </Reveal>
      <div className="relative mt-14">
        {/* scroll-linked connector */}
        <div className="absolute left-0 right-0 top-[52px] hidden h-[3px] rounded-full bg-border lg:block">
          <motion.div style={{ scaleX: line }} className="h-full origin-left rounded-full bg-gradient-to-r from-[#603AFC] via-[#F06EA0] to-[#FCA546]" />
        </div>
        <RevealGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" stagger={0.12}>
          {d.landing.steps.map((step, i) => {
            const Icon = STEP_ICONS[i] ?? Sparkles;
            return (
              <motion.li key={step.title} variants={revealItem} className="tilt-card group relative list-none rounded-3xl border bg-card/80 p-6 backdrop-blur hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(96,58,252,0.5)]">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-[#603AFC] to-[#F06EA0] text-white shadow-lg shadow-primary/30">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-heading text-3xl font-bold text-muted-foreground/40 transition-colors group-hover:text-primary">0{i + 1}</span>
                </div>
                <p className="mt-5 text-lg font-semibold">{step.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
              </motion.li>
            );
          })}
        </RevealGroup>
      </div>
    </section>
  );
}

function CtaButton({ size = "lg", className, href, label, signedIn }: { size?: "lg" | "sm"; className?: string; href: string; label: string; signedIn: boolean }) {
  const inner = (
    <>
      {label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </>
  );
  return (
    <Button asChild size={size} className={cn("group rounded-xl", size === "lg" && "h-12 px-6 text-[15px]", className)}>
      {signedIn ? <Link href={href}>{inner}</Link> : <a href={href}>{inner}</a>}
    </Button>
  );
}

export function LandingPage() {
  const { d, f, locale } = useT();
  const { status } = useAuth();
  const pricing = usePricing();
  const reduce = useReducedMotion();
  const currency = currencyForLocale(locale);
  const signedIn = status === "authenticated";
  const ctaHref = signedIn ? "/create" : api.auth.googleLoginUrl();
  const ctaLabel = signedIn ? d.landing.ctaStudio : d.landing.ctaStart;

  const starter = pricing.data?.packs[0];
  const perCredit = starter ? starter.prices[currency] / starter.credits : null;
  const bannerPrice = perCredit && pricing.data ? Math.ceil(perCredit * pricing.data.costs.generation) : null;
  const examplePrice = perCredit && pricing.data ? Math.ceil(perCredit * (pricing.data.costs.generation + 3 * pricing.data.costs.edit)) : null;

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroTextY = useTransform(heroProgress, [0, 1], [0, -80]);
  const heroFade = useTransform(heroProgress, [0, 0.7], [1, 0]);

  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <Backdrop />
      <ScrollProgressBar />

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitcher compact className="hidden w-auto border-transparent bg-transparent shadow-none sm:flex" />
            <CtaButton size="sm" href={ctaHref} label={ctaLabel} signedIn={signedIn} />
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section ref={heroRef} className="relative">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-5 pb-14 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1fr_1fr] lg:gap-6 lg:pb-24 lg:pt-28">
            <motion.div style={reduce ? undefined : { y: heroTextY, opacity: heroFade }} className="relative z-10 text-center lg:text-left">
              <motion.p initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                <Sparkles className="size-3.5 text-primary" /> {d.landing.tagline}
              </motion.p>
              <motion.h1 initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} className="mt-6 text-balance font-heading text-[2.6rem] font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.2rem]">
                <span className="text-gradient-brand">{d.landing.heroTitle}</span>
              </motion.h1>
              <motion.p initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }} className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0">
                {d.landing.heroDesc}
              </motion.p>
              <motion.div initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <CtaButton href={ctaHref} label={ctaLabel} signedIn={signedIn} />
                {pricing.data && pricing.data.trialCredits > 0 && <p className="text-sm text-muted-foreground">{f(d.landing.ctaFree, { n: pricing.data.trialCredits })}</p>}
              </motion.div>
              <RevealGroup className="mt-10 grid grid-cols-3 gap-3 text-left" stagger={0.1}>
                {d.landing.stats.map((s) => (
                  <motion.div key={s.label} variants={revealItem} className="rounded-2xl border bg-card/70 px-3 py-3 backdrop-blur">
                    <p className="font-heading text-2xl font-bold sm:text-3xl">{s.value}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">{s.label}</p>
                  </motion.div>
                ))}
              </RevealGroup>
            </motion.div>
            <div className="relative">
              <HeroMockups />
            </div>
          </div>
          <motion.div aria-hidden animate={reduce ? undefined : { y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} className="mx-auto mb-2 flex w-fit items-center gap-1 text-xs text-muted-foreground">
            {d.landing.scrollHint} <ChevronDown className="size-3.5" />
          </motion.div>
        </section>

        {/* Audiences marquee */}
        <section className="py-10">
          <Reveal>
            <p className="mb-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{d.landing.forWhom}</p>
          </Reveal>
          <Marquee items={d.landing.audiences} />
        </section>

        <HowItWorks />

        {/* Refine demo */}
        <section className="relative overflow-hidden border-y border-border/60 bg-card/40 py-20 sm:py-28">
          <Parallax speed={0.35} className="pointer-events-none absolute -left-24 top-10 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(96,58,252,0.35),transparent)] blur-2xl" />
          <Parallax speed={-0.25} className="pointer-events-none absolute -right-20 bottom-0 size-80 rounded-full bg-[radial-gradient(closest-side,rgba(252,165,70,0.3),transparent)] blur-2xl" />
          <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-5xl">{d.landing.demoTitle}</h2>
              <p className="mt-3 text-muted-foreground sm:text-lg">{d.landing.demoDesc}</p>
            </Reveal>
            <Reveal className="mt-12" delay={0.1}>
              <RefineDemo />
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-5xl">{d.landing.pricingTitle}</h2>
            <p className="mt-3 text-muted-foreground sm:text-lg">{bannerPrice ? f(d.landing.pricingDesc, { price: formatMoney(bannerPrice, currency) }) : ""}</p>
            {pricing.data && (
              <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
                <span className="rounded-full border bg-card/70 px-3 py-1">{f(d.landing.priceGeneration, { n: pricing.data.costs.generation })}</span>
                <span className="rounded-full border bg-card/70 px-3 py-1">{f(d.landing.priceEdit, { n: pricing.data.costs.edit })}</span>
                {examplePrice && <span className="rounded-full border bg-card/70 px-3 py-1 text-muted-foreground">{f(d.landing.priceExample, { price: formatMoney(examplePrice, currency) })}</span>}
              </div>
            )}
          </Reveal>
          <Reveal className="mt-12" delay={0.1}>{pricing.data && <CreditPacks pricing={pricing.data} currency={currency} checkout={false} signInHref={signedIn ? "/credits" : api.auth.googleLoginUrl()} />}</Reveal>
        </section>

        {/* Final CTA */}
        <section className="px-5 pb-24 sm:px-8">
          <Reveal>
            <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[32px] border bg-[radial-gradient(120%_120%_at_0%_0%,#603AFC_0%,#F06EA0_55%,#FCA546_100%)] p-10 text-center text-white shadow-[0_50px_100px_-40px_rgba(96,58,252,0.6)] sm:p-16">
              <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
              <h2 className="relative text-balance font-heading text-3xl font-bold tracking-tight sm:text-5xl">{d.landing.finalTitle}</h2>
              <p className="relative mx-auto mt-4 max-w-xl text-balance text-white/85 sm:text-lg">{f(d.landing.finalDesc, { n: pricing.data?.trialCredits ?? 10 })}</p>
              <div className="relative mt-8 flex justify-center">
                <Button asChild size="lg" className="h-12 rounded-xl bg-white px-6 text-[15px] text-[#1a0b3d] hover:bg-white/90">
                  {signedIn ? (
                    <Link href="/create">
                      {d.landing.ctaStudio} <ArrowRight className="size-4" />
                    </Link>
                  ) : (
                    <a href={api.auth.googleLoginUrl()}>
                      {d.landing.ctaStart} <ArrowRight className="size-4" />
                    </a>
                  )}
                </Button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:px-8">
          <p>{f(d.landing.footer, { year: new Date().getFullYear() })}</p>
          <LocaleSwitcher compact className="w-auto border-transparent bg-transparent shadow-none" />
        </div>
      </footer>
    </div>
  );
}
