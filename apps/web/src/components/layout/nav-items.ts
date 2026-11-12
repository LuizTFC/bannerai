import { Coins, Images, Palette, Settings, Sparkles } from "lucide-react";

/** Navigation entries; labels are looked up in the dictionary by `key`. */
export const NAV_ITEMS = [
  { href: "/create", key: "create", icon: Sparkles },
  { href: "/banners", key: "banners", icon: Images },
  { href: "/brand-kit", key: "brandKit", icon: Palette },
  { href: "/credits", key: "credits", icon: Coins },
  { href: "/settings", key: "settings", icon: Settings },
] as const;
