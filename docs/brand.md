# Bannerai — brand identity

Bannerai is an AI banner studio for anyone who needs to announce something: churches and
ministries, schools, small businesses, NGOs, festivals, creators. The brand is confident, warm
and fast — a creative partner, not an admin tool.

## Name

**Bannerai** — "banner" + "ai". Always written with a capital B; in the wordmark the "ai" is set
in the brand gradient. Pronounced "banner-ai".

## Logo

Source asset: [`docs/brand/bannerai-logo.png`](brand/bannerai-logo.png) (full lock-up on the
night background). The mark is two stacked, tilted ribbons forming a "B":

- top ribbon: Lilac `#B583FA` → Electric Violet `#603AFC`
- bottom ribbon: Violet `#9F3CFC` → Pink `#F06EA0` → Orange `#FCA546`

The vector version used in the UI and the favicon lives in
`apps/web/src/components/brand/logo.tsx` and `apps/web/src/app/icon.svg`. Minimum size 16 px;
keep clear space equal to half the mark's height. Do not recolor the ribbons, rotate the mark or
place it on busy photos without a solid backdrop.

## Color

| Token | Hex | Use |
| --- | --- | --- |
| Night | `#040021` | Brand background, dark surfaces |
| Electric Violet | `#603AFC` | Primary actions, links, the "ai" gradient start |
| Lilac | `#B583FA` | Soft highlights, top-ribbon light end |
| Pink | `#F06EA0` | Gradient midpoint, energy |
| Orange | `#FCA546` | Gradient end, warm accents |
| Paper | `#FAFAF7` | Light background |

The UI uses Electric Violet as `--primary` (light and dark themes) and keeps every other surface
neutral so the user's banners are the color in the room.

## Typography

- Wordmark and headings: a geometric, rounded, heavy sans (the lock-up uses a Poppins/Nunito-like
  face; the app uses Bricolage Grotesque bold).
- Interface: Geist Sans; numbers and code: Geist Mono.

## Voice

Short, direct, encouraging. Speak to the person, not the system ("Your banner will appear here",
"Done — I applied your change"). Never jargon-first; explain AI settings in outcomes.
