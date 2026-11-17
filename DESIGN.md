---
name: Rabbit
description: A private garden club bulletin for useful thoughts and small circles.
colors:
  primary: "#2F5843"
  neutral-bg: "#F8F9F4"
  paper: "#FFFFFF"
  ink: "#27332D"
  muted: "#6D756E"
  faint: "#92998F"
  green-light: "#E8EEE1"
  border: "#E5E8DE"
  sidebar: "#F1F3EB"
  peach: "#F6E8DD"
  lavender: "#ECE8F4"
  sage: "#E4ECDD"
  blue: "#E5EDF3"
  sand: "#F3EEDA"
  sage-ink: "#4F6945"
  peach-ink: "#99643F"
  lavender-ink: "#776196"
  blue-ink: "#4F6C89"
  sand-ink: "#8E7839"
  error: "#A63B31"
  focus: "#527453"
  chip-selected-border: "#D3DEC8"
  chip-hover: "#F0F3E9"
typography:
  display:
    fontFamily: "DMSans_600SemiBold, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: "43px"
    letterSpacing: "-1px"
  headline:
    fontFamily: "DMSans_600SemiBold, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "36px"
    letterSpacing: "-0.7px"
  title:
    fontFamily: "DMSans_600SemiBold, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.5px"
  card-title:
    fontFamily: "DMSans_600SemiBold, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: "27px"
    letterSpacing: "-0.4px"
  body:
    fontFamily: "DMSans_400Regular, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
  small:
    fontFamily: "DMSans_400Regular, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "18px"
  label:
    fontFamily: "DMSans_600SemiBold, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  button:
    fontFamily: "DMSans_500Medium, sans-serif"
    fontSize: "13px"
    fontWeight: 500
rounded:
  type-tab: "6px"
  chip: "7px"
  icon-button: "8px"
  control: "9px"
  compact-panel: "10px"
  group-icon: "11px"
  card: "16px"
  dialog: "18px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "18px"
  card: "22px"
  panel: "24px"
  columns: "28px"
  page: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 18px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "48px"
  filter-chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.chip}"
    padding: "0px 13px"
    height: "36px"
  filter-chip-active:
    backgroundColor: "{colors.green-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.chip}"
    padding: "0px 13px"
    height: "36px"
  post-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "22px"
  nav-active:
    backgroundColor: "{colors.green-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    height: "45px"
    padding: "0px 15px"
  audience-self:
    backgroundColor: "{colors.sage}"
    textColor: "{colors.sage-ink}"
    rounded: "{rounded.chip}"
    height: "36px"
    padding: "0px 10px"
---

# Design System: Rabbit

## Overview

**Creative North Star: "The Private Garden Club Bulletin"**

Rabbit is a calm writing and reading space for friends and small communities. Its warm paper ground, forest actions and softly colored circles make sharing feel personal and deliberate. DM Sans keeps the interface familiar and legible; information and recipients supply the character.

The interface is spacious around the primary task and compact around its supporting metadata. White panels, light strokes and quiet controls frame useful posts. The distinctive audience control changes its icon, tint and privacy explanation together before publication.

**Key Characteristics:**
- Warm paper ground with white reading and writing surfaces.
- One forest action color and five consistent identity tones.
- Readable DM Sans with compact, sentence-case controls.
- Visible recipients and privacy wording before posting.
- Flat panels and restrained state feedback.

This is a scan of the implemented light appearance. `src/theme.ts` and the styled wrappers in `src/ui.tsx` are the normative app source. `App.tsx` forces the gluestack provider to light mode. The `.dark` declarations in `global.css` are available library scaffolding, not an integrated or visually verified dark theme.

## Colors

A muted garden palette supports a paper-like interface and identifiable small circles. The frontmatter carries exact values; the names below explain their roles.

### Primary

- **Forest** (`primary`): filled primary actions, active navigation and selected control ink.
- **Pale foliage** (`green-light`): selected filters, navigation and quiet interaction feedback.

### Secondary

- **Sage**, **clay peach**, **soft lavender**, **sky blue** and **oat sand**: paired background/ink tokens identify circles and people. Preserve the pair wherever that identity appears.
- **Sage** also marks the composer's self audience; it does not imply circle membership.

### Neutral

- **Warm ivory** (`neutral-bg`): application ground.
- **White paper** (`paper`): composer, post cards, fields and dialogs.
- **Leaf ink** (`ink`): primary reading and headings.
- **Muted olive gray** (`muted`): secondary copy, readable placeholders and inactive controls.
- **Faint gray** (`faint`): minor decoration and directional separators, not essential input guidance.
- **Paper edge** (`border`): quiet card and field strokes.
- **Rail paper** (`sidebar`): persistent desktop navigation ground.

The error color is reserved for error messages. The focus color is the web keyboard outline. Selected chips pair the selected-border token with pale foliage; unselected chip hover uses the chip-hover token.

**The Audience Agreement Rule.** In the composer, recipient glyph, identity tone and privacy explanation change together. A color change alone is insufficient.

Sidecar tonal ramps are synthesized exploratory metadata, not a shipped color scale.

The library's light CSS variables differ slightly from the fixed JS palette; this file captures the visible app palette rather than asserting that the two layers are synchronized. Sidecar component samples resolve JS values literally.

## Typography

**Display Font:** DM Sans semibold, loaded as `DMSans_600SemiBold`.
**Body Font:** DM Sans regular, loaded as `DMSans_400Regular`.
**Control Font:** DM Sans medium; brand lettering uses bold. All four actual assets (400, 500, 600, 700) load through Expo on web and native. Browser snippets use sans-serif as a fallback.

**Character:** friendly, clear and compact. Hierarchy comes from size and weight within a single family, with slightly tightened large headings.

### Hierarchy

- **Display:** the desktop page heading; `headline` is its phone counterpart.
- **Title:** section and dialog headings; component-specific headings also use observed smaller sizes.
- **Card title:** compact information heading. Detail expands to (24px/32px), preserving semibold and the same tracking.
- **Body:** regular reading copy. Post excerpts use (13px/22px); composer body uses (14px/24px).
- **Small:** supporting copy; metadata sometimes reduces to (10–11px). Do not expand this compact treatment into primary instructions.
- **Label / button:** semibold field labels and medium action labels. Filter labels use (12px); active labels gain medium weight.
- **Composer title:** medium (23px) with (-0.6px) tracking; placeholders use the muted color, including this prominent field.

**The Reading First Rule.** Use semibold titles, regular reading text and quieter metadata; keep action labels subordinate to the information they serve.

## Layout

The adaptive shell uses a persistent left rail (228px) at viewport widths of (960px) and above. Below that threshold, the four primary destinations—Home, labeled “Your space”; Recent, labeled “Recent posts”; Goals; and Profile—move into bottom navigation. Its items have a minimum height of (54px) and width of (78px), so four fit at 360px.

At (1230px) and above, a support column (278px) sits beside the flexible main column with a (28px) gap. The inner page is centered with a maximum width of (1190px). The reading column uses `minWidth: 0` so long content can wrap. Desktop outer horizontal padding is (40px), phone content padding is (18px); the header uses (20px) on phones. Page top padding is (34px) desktop and (26px) phone. Panel stacks commonly use (24px) gaps.

Composer padding is (24px) horizontally and (22px) at the top; its footer uses (22px) horizontally and (14px) vertically. Post cards use the card spacing token. Identity, metadata and action rows typically use gaps between (6px) and (12px), wrapping when needed. Mobile circle shortcuts scroll horizontally within their own strip.

Dialogs center within a viewport scrim, use standard/wide maximum widths of (520px)/(740px), and cap height at viewport height minus (48px). Outer dialog padding changes from (12px) below (600px) to (32px) above it.

## Elevation & Depth

The system is flat at rest. Tonal grounds, thin borders and white surfaces distinguish context from reading. Cards carry no app-defined shadow. The secondary button inherits the library's small `shadow-xs`; it is not a new elevation tier for panels. Modal separation uses a translucent forest-black scrim (`rgba(29,42,31,0.35)`) and a rounded white surface.

**The Paper Surface Rule.** Separate resting panels with a white fill and a light border. Do not add decorative elevation to reading cards.

Web button state transitions last (180ms), ease out, and affect background, border and opacity only when reduced motion is not requested. Dialogs use React Native's platform fade; native reduced-motion behavior for that fade has not been established.

## Shapes

Forms are gently rounded rectangles. Cards have the card radius, controls the control radius, and compact chips the chip radius. Modal surfaces are slightly softer. Borders are normally a single pixel in paper edge. Avatars are true circles; circle marks are rounded squares using the group-icon radius. Use stroked Lucide vector icons with mostly (1.7–1.8px) strokes; circle marks scale their glyph to (46%) of the container. Keep icons subordinate to text and never substitute text glyphs for the vector assets.

## Components

### Buttons

Quiet and direct. The primary action uses forest with white medium text, a control radius and a minimum height of (44px). Standard horizontal padding is (18px); the composer Post action uses (22px) and a (40px) minimum height. Secondary actions use transparent fill, leaf ink and a border. The fixed JS background may override inherited library background hover styles; do not infer a second app-defined hover color. Disabled app actions use half opacity; loading replaces the label with “One moment…”.

Icon buttons use a (44px) square hit area, muted stroked icons, icon-button radius and a pale-foliage hover/press fill. The global web focus treatment is a (2px) focus-color outline offset by (4px).

### Chips

Compact filter chips have a (36px) minimum height, (13px) horizontal padding and a light border. Active chips use pale foliage with forest medium text and a selected border. Hover gives inactive chips a faint foliage fill. Composer post-type controls are distinct: (34px) tall, borderless, and softly filled when selected.

### Cards / Containers

White, lightly outlined and spacious enough to read. Cards use the card radius and normally (22px) padding. Post cards place identity and audience before the title and excerpt, followed by tags and a subdued action row. Useful votes, reply counts and save state stay visually quieter than the post. Composer and field surfaces share the same paper vocabulary.

### Inputs / Fields

Standard labeled fields use a (48px) minimum height, white fill, one-pixel paper-edge stroke and the control radius. Reading text is leaf ink and placeholder text muted. Composer title and body are borderless inside the shared card, with the title larger than body text. Preserve keyboard focus visibility even on these minimal fields; errors use explicit text in the error color. Do not infer unimplemented success or validation styling.

### Navigation

Desktop rail items are compact rows with a (45px) minimum height and control radius. Active rows use pale foliage, forest ink and semibold labels; inactive rows are transparent with muted regular labels. Hover uses a gentle tonal fill. Phone navigation is white with a top border, four equal destinations and icons above (10px) labels; active state uses forest and semibold without a filled tile.

The Home compose/search switch has a softly tinted, outlined compact-panel container. Its selected segment is white with forest medium text; the other segment remains muted. It belongs inside Home rather than becoming a fourth primary destination.

### Audience signature

The composer's audience button is a (36px) minimum-height chip with a (240px) maximum width. Self pairs a lock with sage and “Only you can see this.” A person pairs `UserRound` with that person's avatar tone and “Only you and [first name].” A circle pairs its actual palette/blocks/book/users glyph with its circle tone and “Visible to [count] circle members.” The footer keeps a quiet lock beside the explanation. The recipient picker repeats actual avatar/circle identities and marks the selected row with pale foliage and a check.

This three-part signature is specific to the composer. Existing post metadata badges use a smaller lock badge and are not claimed to implement the same glyph-switching behavior.

### Goals

Goals reuse the circle vocabulary rather than adding a new one. The nav glyph is Lucide `Sprout`.

- **Goal mark:** the group-icon rounded square in one of the five identity tone pairs, with a stroked glyph at (46%) (flag, footprints, book, leaf, languages, heart). Keep the tone pair together, as with circles.
- **Momentum panel:** pale-foliage fill, (16px) radius, a card-title sentence in forest (“You completed 10 tasks across 3 goals in the last 7 days.”), seven day bars (today in forest, other days in a light sage) and one small follow-up line. It is a sentence, not KPI tiles. On Home it leads the main column on phones and tops the support column at (1230px) and above.
- **Goal card:** a paper card with the goal mark, title, “done of total” line and a (6px) forest-on-sage progress bar, followed by the top three next tasks and a quiet “Add a task” row.
- **Task row:** a (22px) circular checkbox (forest fill when done) with a 44px-equivalent hit area, regular body text and an (11px) meta line. Priority always pairs a signal glyph with its word (High in clay-peach ink, Medium in oat-sand ink, Low muted). Overdue uses clay-peach ink with the word “Overdue”, never the error colour. Done rows strike through in faint. Tree levels indent (26px) on desktop and (20px) on phones, up to four levels; a selected row uses pale foliage.
- **Refresh:** a secondary button that takes the selected-chip treatment (pale foliage, selected border, forest ink) and a forest count badge while completions are pending. Completed rows stay in place with a forest “Undo” until Refresh.
- **Task detail placement:** below (960px), a bottom sheet with a grab handle and top-only dialog radius (`Sheet placement="bottom"`); from (960px) to (1229px), a right-anchored sheet (`placement="side"`); at (1230px) and above, an inline (360px) paper panel in place of the support column, so the tree stays visible.
- **Phone quick add:** a white bar with a top border, docked above the bottom navigation on a goal page, with a (44px) forest send button.

- **Sharing:** a goal page shows its audience under the header, with the icon and words changing together: a lock with “Only you can see this goal”, or overlapping member avatars with “Shared with Sam and 2 others”. It opens the “People in this goal” sheet, which lists members (owner tagged), offers Leave or Remove where allowed, and repeats the circle friend picker (avatar rows, pale-foliage selection, check). The create form offers the same picker as an optional section. Goal cards repeat the avatar line for shared goals, and goals someone else owns say “{Name}’s goal”. Tasks finished by someone else carry a quiet “Done by {Name}” meta line.

Evidence: responsive web captures at 390px and 1440px from the goals and goal sharing browser suites. Native appearance is not verified.

## Do's and Don'ts

### Do:
- Do use the JS theme palette for app surfaces and the paired tone foregrounds for identity badges.
- Do keep the composer audience visible and update its icon, tint and privacy wording together.
- Do preserve actual DM Sans weight assets on web and native.
- Do keep controls quiet, keyboard focus visible and explanatory text readable.
- Do adapt the rail and support column to the observed breakpoints while preserving the four primary destinations.

### Don't:
- Don't use circle colors to replace the primary action color.
- Don't add decorative shadows to reading cards.
- Don't use the faint color for composer placeholders; use muted.
- Don't treat the available dark token declarations as a shipped dark appearance.
- Don't turn the existing uppercase sidebar category label into a reusable heading style.

Evidence and limits: extracted from `src/theme.ts`, `global.css`, `src/ui.tsx`, `src/Composer.tsx`, `src/Posts.tsx`, `src/Sheet.tsx`, `App.tsx` and the gluestack button wrapper, with desktop and phone web captures in `.impeccable/review/`. The scoped final review resolved the audience-signature and placeholder-contrast findings; its regression statement applies to that responsive web evidence. Native bundles compile, but there are no native device screenshots or native visual QA. No comparison comp or QUALITY BAR calibration was supplied. Native appearance and behavior therefore remain unverified.

Not canonized: the existing uppercase sidebar category label is a carried craft-floor defect, not a future typography rule. The JS/gluestack palette drift and unintegrated dark declarations remain implementation limits rather than new system variants. This documentation pass does not repair app code.
