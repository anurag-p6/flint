---
name: flint-ui
description: UI design guidance for Flint dashboard — all white, minimal, developer-native
sources: [chat]
---

# Flint UI Design Skill

## The Brief

Flint is a trustless disbursement protocol used by developers, grant committees, and open source maintainers. The UI should feel like a developer tool. Think GlassBox402, Linear, Vercel. Everything is white. Clean. No decoration.

---

## Colors

```
--white:       #FFFFFF   everything. background, sidebar, cards, all of it
--gray-50:     #F9F9F9   subtle hover states on rows
--gray-100:    #F0F0F0   borders, dividers, input borders
--gray-400:    #9A9A9A   secondary text, labels, placeholders
--gray-700:    #3A3A3A   primary body text
--black:       #0A0A0A   page titles, logo, strong headings
--green:       #22C55E   live status dot, success
--amber:       #F59E0B   pending status dot
--red:         #EF4444   error states, failed transactions
--accent:      #2563EB   primary buttons, active nav item, links only
```

No gradients. No shadows. No colored backgrounds anywhere.

---

## Typography

```
--font-sans:   Inter, system-ui, sans-serif
--font-mono:   JetBrains Mono, monospace
```

Sans for all UI text. Mono strictly for wallet addresses, tx hashes, amounts, CLI commands, anything that is raw data.

```
11px   labels, metadata, table headers
13px   table rows, body text
15px   default UI text
18px   section titles
22px   page titles
28px   key metrics, balances
```

---

## Spacing

8px base unit. All spacing is a multiple of 8.

---

## Layout

```
+------------------+------------------------------------------+
|                  |  Header: page title + status + balance   |
|   Left nav       +------------------------------------------+
|   White bg       |                                          |
|   Gray text      |   Page content                           |
|   Thin border    |   White bg, left aligned                 |
|   on right       |   Max width 860px                        |
|   (240px)        |                                          |
+------------------+------------------------------------------+
```

Everything is white. Left nav has a single 1px gray-100 border on its right edge to separate it from content. No background color difference between nav and content.

---

## Left Navigation

```
App name / Logo      black, 15px, font-weight 600
---
Nav items            13px, gray-400 default
                     black + accent left border (2px) when active
                     no background highlight on active
---
[bottom]
Wallet address       monospace, gray-400, truncated 0x1234...abcd
Network status       green dot + network name, 12px
Balance              black, 13px
Disconnect           gray-400, 12px
```

No icons unless absolutely necessary. Text navigation only.

---

## Components

### Status Indicator

```
● Hub connected     green dot, 12px, gray-700 text
● Pending           amber dot
● Failed            red dot
```

8px circle. No badges. No pills. Just a dot and a label.

### Command Block

```
background:     #0A0A0A
text:           #22C55E
font:           monospace, 13px
padding:        16px 20px
border-radius:  6px
copy button:    top right corner, gray-400
```

Only for CLI commands and prominent transaction hashes.

### Tables

No card wrapper. Tables sit directly on white background.

```
header row:    11px, gray-400, uppercase, letter-spacing 0.05em
data rows:     13px, gray-700
row divider:   1px solid gray-100 bottom border
hover state:   gray-50 background
padding:       12px 0 per row
```

Wallet addresses and tx hashes always monospace. Amounts right aligned. Status as dot plus text.

### Buttons

Primary:
```
background:    --accent
text:          white
padding:       8px 16px
font-size:     13px
border-radius: 6px
font-weight:   500
```

Secondary:
```
background:    white
border:        1px solid gray-100
text:          gray-700
same sizing
```

Button copy is exact and action-oriented. "Approve Payout" not "Submit". "Connect Repo" not "Add Integration".

### Inputs

```
border:         1px solid gray-100
background:     white
padding:        8px 12px
font-size:      13px
border-radius:  4px
focus:          border-color --accent, no glow, no shadow
placeholder:    gray-400
```

Address inputs use monospace font.

---

## Specific Pages

### Maintainer Dashboard

```
[Repo name]                          page title, black
[Cycle period] · [Pool] USDC         subtitle, gray-400

                          [Approve Payout]   right aligned button

GitHub Username   Score   Share   Amount      Status
anurag-p6         847     45%     450 USDC    ● Pending
alice-dev         621     33%     330 USDC    ● Pending
bob-codes         412     22%     220 USDC    ● Pending
```

Show the math. Maintainer sees exactly how scores map to amounts before approving.

### Contributor Profile

```
0xanurag.eth                         page title
Flint Score: 847                     subtitle, gray-400

Date       Repo              Score   Amount      Tx
Sep 2026   meshery/meshery   847     450 USDC    0xabc...
Aug 2026   layer5/smp        621     330 USDC    0xdef...
```

### Grant Dashboard

```
[Grant name]                         page title
[Grantor] · [Total] USDC             subtitle

01   Ship v1             ● Verified    300 USDC released   Sep 1
02   Deploy to mainnet   ● Pending     300 USDC locked
03   Reach 100 stars     ● Locked      400 USDC locked

                         [Approve Tranche]   visible only when milestone verified
```

---

## The One Animated Moment

When waiting for Ledger device confirmation after clicking Approve Payout:

```
button text changes to:  "Waiting for Ledger..."
border pulses:           1px solid --accent, slow pulse animation
no spinner, no modal, no overlay
```

This is the only animation in the entire UI. Everything else is completely static.

---

## What to Avoid

- No dark sidebar or dark backgrounds anywhere
- No gradients or shadows
- No rounded pill buttons
- No emoji in the UI
- No centered hero sections inside the dashboard
- No decorative elements between sections
- No skeleton loaders — just "Loading..." in gray-400
- No ALL CAPS labels
- No toast notifications stacking

---

## Voice and Copy

- Sentence case everywhere
- Truncate addresses always: 0x1234...abcd
- Always show token symbol with amounts: 450 USDC not 450
- Dates in plain format: Sep 2026
- Error messages say what went wrong and how to fix it

---

## Reference

GlassBox402 dashboard. All white, clean borders, monospace for data, status dots, left nav with thin divider, tables not cards.