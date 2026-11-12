import { cn } from "@/lib/utils";

/**
 * Bannerai mark — two stacked, tilted ribbons forming a "B" (vectorized from the official logo in
 * docs/brand/bannerai-logo.png). Top ribbon: lilac → electric violet. Bottom ribbon: violet → pink → orange.
 */
export function Logo({ className, title = "Bannerai" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label={title} className={cn("size-8", className)}>
      <defs>
        <linearGradient id="bannerai-top" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B583FA" />
          <stop offset="1" stopColor="#603AFC" />
        </linearGradient>
        <linearGradient id="bannerai-bottom" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#9F3CFC" />
          <stop offset="0.5" stopColor="#F06EA0" />
          <stop offset="1" stopColor="#FCA546" />
        </linearGradient>
      </defs>
      <polygon points="9.1,3.2 41,10.6 43.2,15.4 40.6,20.8 26.2,22 8.6,18.2 8.6,4.2" fill="url(#bannerai-top)" stroke="url(#bannerai-top)" strokeWidth="2.6" strokeLinejoin="round" />
      <polygon points="26.4,24.2 41.6,24.2 43.2,29 10.2,45.4 5.6,45.4 5.6,32.6" fill="url(#bannerai-bottom)" stroke="url(#bannerai-bottom)" strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  );
}

/** "Banner" in the foreground color + "ai" in the brand gradient, like the official wordmark. */
export function Wordmark({ className, size = "md" }: { className?: string; size?: "md" | "lg" | "xl" }) {
  const mark = size === "xl" ? "size-14" : size === "lg" ? "size-10" : "size-8";
  const text = size === "xl" ? "text-4xl" : size === "lg" ? "text-2xl" : "text-[17px]";
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Logo className={mark} />
      <span className={cn("font-heading font-bold tracking-tight", text)}>
        Banner
        <span className="bg-gradient-to-r from-[#603AFC] via-[#C44BFF] to-[#FCA546] bg-clip-text text-transparent">ai</span>
      </span>
    </span>
  );
}
