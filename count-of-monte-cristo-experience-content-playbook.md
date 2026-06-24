# Count of Monte Cristo Experience — Content & Editorial Playbook
### Companion to `count-of-monte-cristo-experience-plan.md` (the build spec)

The build spec covers app architecture and treats content as a generic "admin adds a clipping"
model. **This document covers what actually goes into the app and how it's produced**: how we
source and crop the original newspaper scans, how we translate the *Journal des Débats*, and how
we assemble each content category (music, theatre/opera, politics, advertisements) for every
monthly session. Where this affects the data model, see §8 (schema additions to fold back in).

---

## 1. Guiding principle — original media first

We want maximum **original visual media**. The artifact itself — the scanned 1844–46 newspaper
page — is the star, not a decoration. Rank everything we show by authenticity:

1. **Actual page scans** of the *Débats* / *Galignani's* (the feuilleton strip, the ad pages).
2. **Cropped clippings** taken directly from those scans (a single review, ad, or headline).
3. Period **illustrated press** images (the *Débats* itself had no pictures — see §6).
4. Period **portraits, prints, art, architecture** for texture and people.

Translations and modern assets are scaffolding around the originals. Always keep and display the
French original (image + text) alongside any translation.

---

## 2. Sourcing the papers on Gallica

Both papers are free, public-domain, and browsable by date:

- **Journal des Débats:** `https://gallica.bnf.fr/ark:/12148/cb39294634r/date` → add year (`/date1844`)
- **Galignani's Messenger:** `https://gallica.bnf.fr/ark:/12148/cb32779538j/date` → add year
- Galignani's digested the French press, so for any *Débats* date, also check Galignani's on the
  **same date + the next 1–2 days**.

**Resolving a date → issue identifier.** Each daily issue has its own ark (e.g. `bpt6k...`). To
automate, use Gallica's periodical "Issues" service to list a year's fascicules with their dates
and arks, e.g.:
```
https://gallica.bnf.fr/services/Issues?ark=ark:/12148/cb39294634r/date&date=1844
```
(returns each issue's ark + publication date — confirm exact params during Phase 4). Or, manually,
click the date in the browser and copy the issue's ark from the URL.

Per-reading-month issue dates are listed in the **Appendix** so a curator can work from this file alone.

---

## 3. Pulling the original page scans (the core media pipeline)

Gallica implements the **IIIF Image API** (note: the older v1.1 — quality token is `native`, not
`default`). Given an issue ark and a view/page number `f{n}`:

```
# Full page, full resolution
https://gallica.bnf.fr/iiif/ark:/12148/{issueArk}/f1/full/full/0/native.jpg

# Scaled to 2000px wide (region/size/rotation/quality order)
https://gallica.bnf.fr/iiif/ark:/12148/{issueArk}/f1/full/2000,/0/native.jpg

# CROP a region (x,y,width,height in pixels) — e.g. one ad or one review
https://gallica.bnf.fr/iiif/ark:/12148/{issueArk}/f1/2400,5200,1800,1400/full/0/native.jpg

# Percentage region (handy when you don't know pixel dims)
https://gallica.bnf.fr/iiif/ark:/12148/{issueArk}/f1/pct:5,72,90,26/full/0/native.jpg

# Per-image metadata (dimensions etc.)
https://gallica.bnf.fr/iiif/ark:/12148/{issueArk}/f1/info.json

# Whole-document IIIF manifest (all pages)
https://gallica.bnf.fr/iiif/ark:/12148/{issueArk}/manifest.json
```

**Finding crop coordinates two ways:**
- *Manually:* a IIIF cropping tool (Mirador's region selector, or any "awesome-iiif" cropper) gives
  you the `x,y,w,h` to paste into the URL above.
- *Automatically:* fetch the page's **ALTO XML** OCR, which carries bounding boxes for text blocks
  and `<Illustration>` regions (`HPOS/VPOS/WIDTH/HEIGHT`) that convert directly into IIIF region
  crops:
  ```
  https://gallica.bnf.fr/RequestDigitalElement?O={issueArk}&E=ALTO&Deb=1
  ```

**Storage & display.** Download crops/pages at high resolution, push to Cloudflare R2 (via the
`lib/media.ts` abstraction), and store the resulting URL **plus the IIIF region string** in the DB
(so any crop can be regenerated/verified). In the app, use:
- full-page scans as immersive backdrops / collage layers,
- the feuilleton-strip crop as the "this is the very strip Dumas's readers saw" element,
- individual crops as the clipping cards (review, ad, headline).

**Rights.** These 1844–46 issues are public domain. Attribute **"Source: gallica.bnf.fr / BnF."**
(Note: BnF applies separate conditions to *commercial* reuse of its reproductions — fine for a
private club; revisit if the project is ever monetized.)

---

## 4. Translating the Journal des Débats

**Scope first:** we translate the **excerpts we choose to feature**, never whole pages. The
French scan is always shown; the translation is a reading aid beside it.

**Pipeline per clipping:**
1. **Crop** the passage (§3) so OCR/translation isn't fighting the whole dense page.
2. **Get the French text.** Try Gallica's existing OCR first:
   ```
   https://gallica.bnf.fr/ark:/12148/{issueArk}/f1.texteBrut     # plain OCR text, one page
   https://gallica.bnf.fr/ark:/12148/{issueArk}.texteBrut        # whole issue
   ```
   OCR quality varies (Gallica flags it via `nqamoyen`; ≥50 means it's indexed). If the text is
   garbled — likely for dense 1840s multi-column print — re-OCR just the **cropped region** with
   Tesseract (`fra` model) or Transkribus (better for historical layouts).
3. **Machine-translate** FR→EN. **DeepL** handles 19th-c. French nuance best; Google Translate is
   the fallback.
4. **Light human post-edit.** Fix OCR noise, proper names, period idiom, abbreviations (`M.` =
   Monsieur, francs/centimes, place names), and trim to the relevant lines. Keep it **gist-level
   for ads and routine news**; be **more careful for reviews and editorials you intend to quote**.
5. **Store** all three: the **scan image** (always), the **French transcription** (when feasible),
   and the **English translation**, plus the Gallica permalink, source, and date.

**Layout gotcha:** the *Débats* is multi-column with the feuilleton across the bottom of page 1.
Crop per column/section before OCR or the lines interleave.

---

## 5. Content category playbooks

Each item below becomes a `clippings` row (category + reading_month + optional day + source +
original_date + FR/EN + media + license + Gallica link). One of each per session is plenty (§7).

### 5a. Music of the session
- **Identify what was played/reviewed.** The *Débats* music critic was **Hector Berlioz**; use his
  feuilleton index (Appendix) to see which concerts/operas he reviewed on a given date. The paper
  also printed the **opera/theatre programs**, so you can see the week's repertoire even without a
  review.
- **Likely 1844–46 Paris repertoire** (research leads, not date claims): the Opéra (Meyerbeer,
  Halévy), the Théâtre-Italien (Rossini, Donizetti, Bellini, early Verdi), the Opéra-Comique
  (Auber, Adam), Conservatoire concerts (Beethoven symphonies), Berlioz's own works, and touring
  virtuosi (Liszt, Chopin, Thalberg).
- **Find a usable recording.** Compositions are public domain, **but recordings carry their own
  copyright.** Use public-domain/CC recordings (**Musopen**, **IMSLP**, **archive.org**, Wikimedia
  Commons audio) or **link/embed** an external stream rather than hosting. Log the license per track.
- **In the app:** audio asset + the review clipping (scan + translation) + work/composer metadata;
  obeys the global music toggle.

### 5b. Theatre & opera reviews
- **Critics:** drama was **Jules Janin** ("the Prince of Critics"); opera/concerts often Berlioz.
  Both wrote in the page-1 feuilleton — clip from there on review dates.
- **Theatres of the day** to look for: Comédie-Française, Odéon, the Opéra (rue Le Peletier),
  Théâtre-Italien, Opéra-Comique, and the boulevard houses (Porte-Saint-Martin, Ambigu, Gaîté).
- **Pair with a period image:** a playbill, a costume/scene engraving, or a theatre-interior view
  (see §6). Nice tie-in: Dumas was himself a major man of the theatre.

### 5c. Political opinion — Débats vs Galignani
This comparison is a headline feature, not a footnote.
- **The two voices:** the *Débats* is the **Orléanist establishment** organ, aligned with the
  Guizot government and the July Monarchy; **Galignani's** is an English-language **digest for
  expats**. Same events, very different selection, timing, and framing.
- **Workflow:** per session, pick **1–2 events** that appear in both papers. Clip both (scans),
  translate the *Débats* piece, and present them **side by side** with notes on what differs (did
  Galignani's carry it at all? how many days later? whose framing?).
- **Research leads for 1844–46** (verify against the actual issues): the Guizot ministry and
  Chamber debates; Anglo-French friction (the **Pritchard affair**, 1844; the **Spanish
  marriages**, 1846); Algeria (Abd el-Kader, Bugeaud); the railway boom. These are exactly the
  stories where a French establishment paper and an English expat paper diverge most.
- **Pair with caricature:** **Le Charivari** ran **Daumier** lithographs — public-domain, period-
  perfect political art to set beside the editorials (see §6).

### 5d. Advertisements
- **Where:** usually pages 3–4 of each paper. Crop individual ads via IIIF region (§3).
- **Why:** cultural texture and great collage material — books, theatres, patent remedies, fashion,
  railways, shipping. Often funny and revealing.
- **Treatment:** the **scan is the point**; a one-line gist translation is enough. Running the
  *Débats*' French ads next to *Galignani's* English ads is its own small, charming comparison.

---

## 6. Supplementary original visual media (beyond the two papers)

The *Débats* and *Galignani's* were dense, **picture-free** text papers. For imagery, draw on the
illustrated and visual sources of the era — all public domain:

1. **The page scans themselves** (always first).
2. **L'Illustration** — the French illustrated weekly launched in **1843**; engraved coverage of
   the very events in your news section. On Gallica.
3. **Le Charivari / Honoré Daumier** lithographs — satire and political caricature; ideal for §5c.
4. **Playbills, costume and set engravings, opera-house and theatre views** for §5b.
5. **Portraits / early daguerreotypes** of the cast of characters: Dumas, Berlioz, Janin, Guizot,
   Louis-Philippe.
6. **Later public-domain illustrated editions** of the novel for chapter art.
7. **Art & architecture of 1840s Paris** for the aesthetic layer (boulevards, the Opéra, interiors).

**Sources:** Gallica (BnF), Wikimedia Commons, **Paris Musées Open Content**, **The Met Open
Access**. Record source + license for every asset.

**Caveat:** photography was brand-new (daguerreotype, 1839), so genuine *photos* of 1844–46 events
barely exist — expect engravings and lithographs to serve as the period's "news pictures."

---

## 7. The per-session content packet (one per monthly meeting)

A repeatable checklist mapping to a single reading-month. Pull each packet **~2 weeks before** that
session.

```
SESSION: Reading-month __  (orig. ____ 184_)   Chapters: ____

[ ] Chapter scans   — feuilleton strip(s) for this month's release dates (full page + crop)
[ ] Novel text      — confirm seeded Gutenberg chapters match this month's range
[ ] Music (1)       — work + composer + recording (license noted) + review clipping (scan + FR/EN)
[ ] Theatre/Opera(1)— review clipping (scan + FR/EN) + one period image
[ ] Politics pair   — Débats clip (scan + FR/EN) + Galignani clip (scan) + a Daumier/Charivari image
[ ] Advertisements  — 1–3 crops (scan + one-line gist)
[ ] Supplementary   — 2–4 images (L'Illustration / portraits / scenes) with source + license
[ ] Data entry      — each saved as a clipping/media row: category, reading_month_index, day,
                      source, original_date, transcription_fr, translation_en, media_url,
                      page_image_url, iiif_region, license, attribution, gallica_url
```

---

## 8. Schema additions to fold back into the build spec

The dev spec's `clippings` table needs more fields, plus two new tables, to support the above:

**Extend `clippings`:**
- `transcription_fr` (French OCR/transcription) and `translation_en` (clarifies the generic
  `transcription`/`translation`)
- `page_image_url` (full-page scan) **distinct from** `media_url` (the cropped clipping)
- `iiif_region` (the `f{n}` + `x,y,w,h` used) — for reproducibility
- `license`, `attribution`, `gallica_url`
- music-specific: `work_title`, `composer`, `audio_license` (or move to `media_assets`)

**New `media_assets` table** (reusable supplementary images so one engraving can attach to many days):
```
id, kind ('illustration'|'portrait'|'caricature'|'playbill'|'architecture'|'novel_plate'),
title, source, source_url, iiif_region, license, attribution, r2_url, created_at
```
plus a join table `clipping_media` / `chapter_media` for many-to-many attachment.

**New `chapter_scans` table** (the feuilleton itself, per release date):
```
chapter_number, release_date, issue_ark, page_image_url, feuilleton_crop_url, iiif_region
```

This lets the "Day" experience show the chapter's text **next to the actual strip it ran in**.

---

## 9. Licensing & attribution (summary)

- **1844–46 newspaper issues, 1840s art/engravings:** public domain. Attribute Gallica items as
  "Source: gallica.bnf.fr / BnF." Commercial reuse of BnF reproductions has separate conditions.
- **Sound recordings:** separate copyright even when the music is public domain → use PD/CC
  recordings (Musopen, IMSLP, archive.org, Wikimedia) or embed/link out. Track per asset.
- **Novel text:** use the public-domain translation (Project Gutenberg / Standard Ebooks). The
  modern Robin Buss translation is **copyrighted** — do not use it.
- **Always store source + license + attribution** with every media asset.

---

## Appendix — Issue dates to pull, per reading-month

Pull the *Débats* on these dates; pull *Galignani's Messenger* on the **same dates + the next 1–2
days**. (Reading-months map onto your club's consecutive calendar months; see build spec §5.)

| RM | Orig. month | Chapters | *Débats* issue dates |
|----|-------------|----------|----------------------|
| 1 | Aug 1844 | I–V | 28, 29, 31 Aug |
| 2 | Sep 1844 | VI–XXI | 1, 4, 5, 6, 7, 11, 20, 21, 22, 25, 26, 27, 28, 29 Sep |
| 3 | Oct 1844 | XXII–XXXI | 3, 4, 5, 6, 10, 11, 12, 13, 17, 18, 19, 31 Oct |
| 4 | Nov 1844 | XXXII–XXXIX | 1, 2, 3, 6, 7, 8, 9, 13, 14, 15, 16, 20, 21, 26 Nov |
| — | *hiatus* | — | *Dec 1844 – May 1845: none* |
| 5 | Jun 1845 | XL–XLIV | 20, 21, 22, 25, 26, 27, 28, 29 Jun |
| 6 | Jul 1845 | XLV–LVII | 2, 3, 4, 5, 6, 10, 11, 12, 13, 17, 18, 19, 20, 23, 24, 25, 26, 27, 31 Jul |
| 7 | Aug 1845 | LVIII–LXXV | 1, 2, 3, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 27, 28, 29, 30, 31 Aug |
| 8 | Sep 1845 | LXXVI–LXXXV | 3, 4, 5, 6, 10, 11, 12, 13, 17, 18, 19, 20, 25, 26, 27 Sep |
| 9 | Oct 1845 | LXXXVI–XCVI | 2, 3, 4, 10, 11, 12, 15, 16, 17, 18, 22, 23, 24, 25 Oct |
| 10 | Nov 1845 | XCVII–CX | 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 22, 23, 27, 28, 29 Nov |
| 11 | Dec 1845 | CXI–CXIV | 25, 26, 27, 28 Dec |
| 12 | Jan 1846 | CXV–CXVII | 1, 2, 16 Jan |

**Key reference links**
- Berlioz feuilleton index (Débats, by date): `http://www.hberlioz.com/feuilletons/debatsindex.htm`
- Novel text: Project Gutenberg / Standard Ebooks (public-domain translation)
- Images: Gallica, Wikimedia Commons, Paris Musées Open Content, The Met Open Access
- Recordings: Musopen, IMSLP, archive.org
