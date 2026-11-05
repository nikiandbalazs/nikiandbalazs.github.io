# Niki & Balázs · Wedding gallery

A small static photo gallery for family, published with GitHub Pages:
https://nikiandbalazs.github.io/

Links that open in Polish or Hungarian:
- https://nikiandbalazs.github.io/?lang=pl
- https://nikiandbalazs.github.io/?lang=hu

There is no framework and no build tool, just HTML, CSS and JavaScript.

## What's on the page

- **Opening screen:** the names, "Our wedding photos…", a Play slideshow button and a short hint on how to swipe and tap.
- **Language switch:** always opens in English. Polski and Magyar are one tap away on the flags, or send a `?lang=pl` / `?lang=hu` link. A tap applies to that visit only and never changes the link, so copied links open in English.
- **Carousel of all 42 photos:**
  - moves sideways only, one photo per swipe;
  - opens on photo 20 (the two of us at the signing);
  - the photo in the middle comes forward while the neighbours step back;
  - every photo has a Save button.
- **Chapter shortcuts:** under the carousel, linking to the two chapters.
- **Grid in two chapters:** The ceremony (01–26) and In the garden (28–53). Rows ease into place as you scroll.
- **Colour | Black & white, and Framed:**
  - colour without the frame by default: true to the day, and the full-size files (the framed copies are only about 4 megapixels);
  - each visitor's choice is remembered;
  - a change fades across the photos, and the page keeps its place;
  - the main "Download all" button follows the version on screen.
- **Full-screen viewer:**
  - the photo grows out of its spot, like the phone's own Photos app;
  - Close, the phone's Back gesture or Escape closes it;
  - Previous/Next and swipes slide photos in, and pinch-zoom works.
- **Play slideshow:** at the top and at the end of the page. A photo every 3 seconds, with a crossfade and a slow zoom, and a Pause button. The screen stays on while it plays.
- **Saving a photo:**
  - On iPhone and iPad, "Save photo" opens the share sheet with a tip to tap "Save Image", which puts it in Photos.
  - On Android and computers, the file downloads directly, and phones show where it went.
- **Download all:** four zips, attached to the `photos` GitHub release, with a note that they're best on a computer. On phones the links open in a new tab, which is what makes the download start.
- **Loading:** each photo shows a soft wash of its own colours until it arrives.
- **Motion:** all of it switches off for visitors whose phone asks for less motion.

## Files

- `index.html` is the page.
- `assets/app.js` holds the behaviour. To change the first photo in the carousel, edit `OPENER_ID`.
- `assets/i18n.js` holds all page text in the three languages.
- `assets/style.css` is the design.
- `assets/flags/` holds the three flags.
- `photos/<version>/<large|thumb>/<id>.jpg` are the web copies. The versions are `colour`, `bw`, `framed-colour` and `framed-bw`. Large copies are 2048px on the long edge and thumbnails 900px, all with camera and location data removed.
- `photos.json` lists every photo with its size and colour wash per version, plus the names and sizes of the zips.
- `dist/` (not in git) holds the four zips that are uploaded to the release.

## Preview locally

```sh
python3 -m http.server 4321
```

Then open http://127.0.0.1:4321.

## Change the photos

The photos come from `~/Photos/Wedding/Final`, which holds four folders with the same file names. To rebuild the web copies, the zips and `photos.json`:

```sh
python3 tools/build_photos.py
```

Add `--no-zips` to skip the zips. To change where the ceremony chapter ends, edit `CEREMONY_LAST` in the same file.

After a rebuild, commit and push; Pages republishes in about a minute. Browsers may keep old copies for up to 10 minutes, so after changing `style.css`, `i18n.js` or `app.js`, bump the `?v=` number on those three links in `index.html`. If the zips changed, replace the release files as well:

```sh
gh release upload photos dist/*.zip --clobber
```

## Design

- **Fonts:** Boska for display and Switzer for text, both linked from Fontshare (free, ITF Free Font License). They load without blocking the page.
- **Colours:** gallery white `#fafaf8`, suit black `#121212`, and bow-tie burgundy `#6b1c2a` as the only accent.
- **Motif:** the crescent echoes the moon-shaped floral arch from the ceremony.

The page asks search engines not to index it, but anyone with the link can view it.
