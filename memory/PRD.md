# Tidyups Cleaning — MOBILE APP (Expo) — PRD

## What this task is
This fork was converted from the Tidyups website codebase into the **Tidyups mobile app** (Expo SDK 57 + expo-router,
React Native). The user deploys THIS task to a **separate domain** (the website lives in the original task at
https://bookmycleaning.xyz / tidyups.xyz and must NOT be touched from here).
Original build spec: /app/MOBILE_APP_SPEC.md.

## Architecture (IMPORTANT — two backends)
- **Quotes + admin login** → PRODUCTION website backend `https://bookmycleaning.xyz/api` (shared leads DB + Twilio SMS).
  Env: `EXPO_PUBLIC_BACKEND_URL` in frontend/.env. CORS on production is wide open (verified).
- **App images (dynamic, admin-managed)** → THIS task's own FastAPI backend (`/app/backend`, port 8001) + its own Mongo
  (`app_images` collection) + Emergent Object Storage. On web the app calls it same-origin (window.location.origin);
  on native it uses `EXPO_PUBLIC_IMAGES_URL` (frontend/.env).
- Frontend runs via supervisor `yarn start` = `expo start --web --port 3000`. Deployment build: `yarn build` =
  `expo export -p web --output-dir build`.
- Old website frontend preserved at /app/frontend_web_backup (do not delete; git history also has it).

## App structure (frontend/src)
- Tabs: Home (hero, CTAs, stats, badges, Promotions carousel, why-us, reviews), Services (9 services → Quote with
  preselect), Quote (form → POST production /api/quotes), Gallery (dynamic images + fullscreen viewer),
  Contact (tel links, hours, hidden Staff Login).
- /admin (modal stack route): password login (production /api/admin/login, stored in AsyncStorage) → segmented tabs:
  **Leads** (production GET /api/quotes, pull-to-refresh, tap-to-call) | **Images** (upload via expo-image-picker,
  label, up/down reorder, delete, per-image fit toggle "Fill frame"/"Show full" — against LOCAL backend /api/app-images*) |
  **Business** (AdminBusiness.js: logo upload/reset, phone, toll-free, address, website, editable hours rows → LOCAL /api/app-settings).
- Business details are served app-wide via `src/lib/business.js` (BusinessProvider context wrapped in root _layout;
  `useBusiness()` gives `business` in CONTACT shape + `logoUrl` + `refresh()`). Home call button/logo and the whole
  Contact tab read from it; static CONTACT in constants/data.js is only the fallback default.
- PWA: `src/app/+html.js` (manifest link, theme-color, apple meta, SW registration) + `public/manifest.json`,
  `public/sw.js` (network-first navigation, cache-first assets, skips /api), `public/icons/*` (192/512/maskable/apple).
- Theme: dark #0A0611 / panels #150B22, gradient #FF8A3D→#E0218A→#8B2FC9, fonts Sora (display) + Outfit (body).
- Brand assets in frontend/assets/images (logo.png, banner.jpg, generated icon.png/splash-icon.png/favicon.png).

## Backend additions (this fork only)
- `/api/app-images` GET (public list, now includes `fit`), `/api/app-images/upload` POST (multipart file+label, X-Admin-Password),
  `/api/app-images/{id}` DELETE (soft), `/api/app-images/{id}` PATCH (`{"fit":"cover"|"contain"}`), `/api/app-images/reorder` POST,
  `/api/app-images/file/{path}` GET (serves from Emergent Object Storage).
- `/api/app-settings` GET (public business details + computed phone_tel/tollfree_tel/maps_url/website_url),
  PUT (admin, partial update of phone/tollfree/address/city_line/website/hours), `/api/app-settings/logo` POST (multipart upload,
  sets logo_url) / DELETE (reset to default logo). Stored in `app_settings` collection (single doc key="business").
- Cleaner tracking: `/api/staff/pin` GET/PUT (admin, 4-8 digit PIN, stored app_settings key="staff", default 1234),
  `/api/cleaners/checkin` POST {name,pin} (dedupe by lowercased name, name max 80), `/api/cleaners/location` POST
  {cleaner_id,pin,lat,lng} (bounds-validated, keeps last 20 history points, sets sharing=true+last_seen),
  `/api/cleaners/stop` POST, `/api/cleaners` GET (admin), `/api/cleaners/{id}` DELETE (admin). Collection: `cleaners`.
- Seeds 5 images on startup if `app_images` empty (2 cropped flyers stored in object storage + 3 customer-asset URLs).
- `seed_site_images` self-heals BOTH `hero` and `why` slots on startup if soft-deleted.
- backend/.env: MONGO_URL, DB_NAME=tidyups_database, ADMIN_PASSWORD=tidyups2026, EMERGENT_LLM_KEY (storage), CORS *.
- backend/tests/conftest.py loads backend/.env so pytest never falls back to wrong DB.
- NOTE: backend/tests/test_cleaner_tracking.py must run sequentially (`-n 0`) — PIN-mutation test races under xdist.

## Critical notes
- DO NOT modify the production website/backend — it belongs to the original task.
- Quote POST to production sends a REAL SMS to the owner — ask user before submitting test quotes to production.
- Admin password must stay in sync between production ADMIN_PASSWORD and this backend's .env.
- Never `pip freeze > requirements.txt`; add packages manually. Do not add .env to .gitignore.
- yarn needs `--ignore-engines` (node 20 vs some deps wanting 22) — handled via frontend/.yarnrc.
- THIS POD: kernel inotify max_user_watches=12288 (cannot raise) → Metro's file watcher crashes with ENOSPC.
  Fix in place: package.json start script is `CI=1 expo start --web --port 3000` (watching disabled).
  **NO HOT RELOAD on frontend** — after any frontend code change run `sudo supervisorctl restart frontend` and wait ~25s.

## Done (Feb 24, 2026 — code-quality refactor #3, iteration 17: 100% backend + 100% frontend)
- Added `GRADIENT_START` / `GRADIENT_END_H` / `GRADIENT_END_D` constants to `constants/theme.js` and replaced every
  inline `<LinearGradient start={{...}} end={{...}} />` object in `ui.js`, `(tabs)/index.js`, `(tabs)/services.js`.
- New memoized image sub-components (source object stable per url — eliminates `<Image source={{uri: ...}}/>` in
  render bodies): `PhotoThumb` (CleanerJobs.js), `useMemo(source)` in AdminImages.js `ImageRow`, `PromoImage`
  ((tabs)/index.js), `GalleryImage` ((tabs)/gallery.js). AdminHistory.js `PhotoImage` was already memoized in
  refactor #1.
- Extracted module-level style constants: `TOP_EDGES`, `HEADER_STYLE`, `STACK_STYLE`, `CARD_TEXT_STYLE`,
  `LIST_CONTENT_STYLE`, `SECTION_MT_32`, `CTA_OUTLINE_STYLE`, `H_SCROLL_CONTENT`, `DISABLED_STYLE` — removed inline
  `{ flex:1 }`, `{ gap:12 }`, `{ marginTop:32 }`, `{ marginBottom:12 }`, `{ color:... }` style objects across
  Home / Services / Gallery / Contact / Cleaner / AdminHistory.
- **Skipped as false positives**: "missing hook deps" that flag refs/module-imports/local-vars/globals (oxlint
  reports 0/0); Python `is None`/`is True/False` (PEP-8 idiom); console.warn already `if (__DEV__)`-gated.
- Iteration 17 verdict: backend 100%, frontend 100%, no critical / minor / UI / integration / design issues,
  retest_needed=false, should_main_agent_self_test=false. 103/103 pytest serial. oxlint 0 warnings 0 errors
  across all 31 src files.

## Done (Feb 24, 2026 — App Store submission prep)
- **New static routes**: `/privacy` and `/terms` at bookscrubby.com now render actual policy pages (not the empty SPA shell). Apple's App Store crawler can now read them for the submission under review (App Store Connect ID `6792950350`, bundle `com.tidyups.cleaning`).
- **LegalPage component**: reusable renderer with markdown-lite (**bold** and [text](url) supported), section headings, bullet lists, sticky back button, mailto/tel deep-links, and the standard "Back" nav (SafeAreaView + Expo Router `router.back() ?? replace('/')`).
- **Privacy content** covers: who we are, what we collect (customer + cleaner), how we use it, who we share with (Twilio + Google Sheets + Emergent + MongoDB Atlas), location-only-when-tapping-Start disclosure, before/after photos, retention windows, PIPA/PIPEDA rights, children, security, changes.
- **Terms content** covers: quote-vs-booking, payment/cancellation, access/safety, photo usage, satisfaction & re-clean guarantee, review SMS opt-out, liability cap, acceptable use, governing law (Alberta).
- **Contact-tab footer**: added Privacy / Terms links + copyright line so the App Store reviewer can find them from the Home tab in 2 taps.
- **app.json store metadata**:
  - `ios.bundleIdentifier` = `com.tidyups.cleaning`, `buildNumber` = "1"
  - `ios.associatedDomains` = `applinks:bookscrubby.com`
  - `ios.config.usesNonExemptEncryption` = false + `ITSAppUsesNonExemptEncryption` = false (satisfies the "encryption" review question)
  - `ios.infoPlist` usage strings: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` — all written in plain language explaining why each permission is requested.
  - `android.package` = `com.tidyups.cleaning`, `versionCode` = 1, `permissions` list (location + camera + media), `intentFilters` for App Links to `bookscrubby.com`.
  - `expo-image-picker` plugin block with `cameraPermission` + `photosPermission` text.
  - `extra`: `privacyPolicyUrl`, `termsOfServiceUrl`, `supportUrl` (pointers used by EAS submit templates).
- **eas.json store submit scaffolding**:
  - `submit.production.ios`: `ascAppId` set to **6792950350** (the App Store Connect ID user provided), plus placeholders `REPLACE_WITH_APPLE_ID_EMAIL` and `REPLACE_WITH_APPLE_TEAM_ID` for user to fill before `eas submit`.
  - `submit.production.android`: `serviceAccountKeyPath` pointing to `./google-play-service-account.json` (user drops that in when ready), `track: production`, `releaseStatus: completed`.
  - `build.production.android.buildType` = `app-bundle` (required by Google Play).
  - `build.production.ios.resourceClass` = `m-medium`.
- Verified: preview /privacy + /terms both return 200, oxlint 0/0, screenshot confirms the full Privacy Policy renders with headings and bullet lists.

## Done (Feb 24, 2026 — code-quality refactor #2 vs Code Quality Report Env e28e105d-bedd-45c6-bad8-782f1d891e1a)
- Verified serial `pytest -n 0` runs 103/103 clean; oxlint reports 0 warnings / 0 errors across all 28 src files.
- **False-positive fixes SKIPPED (correct behaviour)**: The static analyzer flagged `watchRef`/`AsyncStorage`/`HTTP_UNAUTHORIZED`/`ADMIN_PW_KEY`/`L`/`Platform`/local-vars as missing hook deps — none of these are valid deps. It also flagged `is None`/`is True/False` as identity-comparison anti-patterns — every flagged occurrence is the PEP-8 idiom. Console.warn statements already gated behind `if (__DEV__)`.
- **Real refactors applied**:
  - `_layout.js`: `STACK_SCREEN_OPTIONS`, `MODAL_OPTIONS`, `FONT_MAP`, `ROOT_STYLE` hoisted to module scope.
  - `(tabs)/index.js`: `TOP_EDGES` + `H_SCROLL_CONTENT` constants (edges + horizontal carousel).
  - `(tabs)/quote.js`: `TOP_EDGES` + `KAV_BEHAVIOR` constants + `styles.kavFill`.
  - `components/AdminImages.js`: split into `UploadCard` + `ImageRow` + `RowActions` subcomponents; `LIST_CONTENT_STYLE` constant; inline `{flex:1}` + `{paddingTop:60}` moved to StyleSheet (`rowText`/`emptyPad`).
  - `components/AdminTeam.js`: extracted `CleanerRow` + `PinCard`; `LIST_CONTENT_STYLE` + `MAP_PIN_ROW_STYLE` constants.
- Iteration 16 outcome (bug_testing_agent runtime verification): backend 100%, frontend 90%, 103/103 pytest,
  all 4 backend smoke curls pass, all admin/cleaner/business/history/team/home flows verified with runtime screenshots
  under /app/test_reports/screenshots/iteration_16. Only "issue" flagged was LOW-priority selector-name
  mismatch (`quote-submit` vs `quote-submit-btn` requested in the test spec) — not a regression; button works.

## Done (Feb 23, 2026 session — Job History + Photo Proof + Review Requests, iteration 12: 103/103 backend + frontend 100%)
- **Job History (admin)** — new "History" tab (5th admin segment): browsable list of DONE assignments,
  filterable by cleaner (chip row). Each card shows customer, service, address, phone, completed timestamp,
  photo counts (before/after), and a "Send Google review link" CTA. Long tap thumbnails opens a fullscreen
  photo viewer modal. Backend: `GET /api/assignments/history?cleaner_id=<opt>&limit=100` (admin), returns
  status=done sorted by completed_at desc.
- **Photo Proof (cleaner)** — Before/After PhotoRow blocks on every active job card. On mobile uses camera
  (`launchCameraAsync`); on web falls back to file picker (`launchImageLibraryAsync`). Long-press or tap the
  X on a thumbnail to remove. Photos live inside the assignment doc as
  `photos:[{id,kind:'before'|'after',url,storage_path,uploaded_at}]`. Backend endpoints:
  `POST /api/assignments/{id}/photos` (multipart: file+kind+cleaner_id+pin) and
  `DELETE /api/assignments/{id}/photos/{photo_id}?cleaner_id=&pin=` (both PIN-gated).
- **Review Requests** — new Business tab card "Review Requests" with `admin-biz-review-url` field for the
  Google review link. Backend: `review_url` added to DEFAULT_BUSINESS + BusinessSettingsUpdate; when a
  cleaner marks a job done via `/status`, `_auto_send_review` fires (Twilio SMS via existing config +
  customer phone + business review_url). Manual re-send: `POST /api/assignments/{id}/send-review` (admin)
  returns `{sent_via_sms, review_sent_at, review_url}`. In preview Twilio isn't configured →
  `sent_via_sms:false` is expected; the admin can still copy the link.
- New tests: `test_history_photos_reviews.py` (10 tests: review_url set/get, history done-only + filter +
  401, photo upload rejects wrong pin/invalid kind + accepts before/after, photo delete, send-review admin
  auth + 400 without url + 200 marks review_sent_at).
- Iteration 12 result: 103/103 backend pytest, frontend 100% (Playwright verified admin 5-tab layout
  at 420px width, History tab + filter + review send flow, Business review_url save+persist, cleaner
  check-in + Before/After Upload buttons all working). Zero regressions on 93 existing tests.
- **Advisory (non-blocking, not fixed to keep changes minimal)**: send-review sets `review_sent_at` even
  when Twilio isn't configured (returns `sent_via_sms:false`). Admin sees "Review sent Nm ago" pill
  regardless of whether SMS actually went out; the response payload includes the truth.

## Done (June 24, 2026 session — code review + fixes, iteration 11: 93/93 backend, frontend 100%)
- Ran code_review_agent on deployed codebase → verdict READY WITH FIXES (1 MEDIUM, 4 LOW). All fixed + tested:
  - **MEDIUM — completed jobs vanished from dispatch board**: STATUS_META now includes done:'Completed' (green);
    LeadCard shows Completed pill + check-circle, hides unassign X, shows "Assign again" button (repeat icon).
    admin.js loadAssignments maps ALL assignments (active preferred over done per quote_id). Backend
    create_assignment now delete_many({quote_id, status:{$ne:'done'}}) → done history preserved on re-assign,
    "Done Today" counter no longer drops. New pytest: test_re_assign_after_done_preserves_history.
  - LOW fixes: removed dead completeAssignment from api.js (legacy /done endpoint kept on backend — tests use it);
    leadAlerts poll now clears stored admin pw on 401; unused catch bindings removed (AdminImages, cleaner.js,
    api.js formatDate). oxlint: 0 warnings 0 errors.
- Iteration 11 also retro-verified the previously-UNTESTED session-13 refactor (AdminLogin.js / LeadCard.js /
  CleanerJobs.js extractions) — no regressions, all admin tabs + cleaner flow work end-to-end.
- **PRODUCTION NOTE**: user redeployed (bookscrubby.com) BEFORE these fixes landed — production still has the
  pre-fix code. Another redeploy is needed to ship the completed-jobs fix.
- Known advisory notes from iter 11 (not bugs): done records grow unbounded per quote (consider archival later);
  re-assign while a cleaner is mid-'cleaning' silently replaces their job; 30s poll refreshes assignments only.

## Backlog
- P1: Native builds via EAS — CONFIG READY (eas.json, plugins, guide at /app/STORE_SUBMISSION_GUIDE.md). User has
  both Apple + Google dev accounts; they run `eas build`/`eas submit` from their machine (needs their Expo login).
- P1 (unlocks review SMS in production): set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER in
  the LOCAL backend `.env` (production deploy). Once set, marking a job done or tapping "Send Google review
  link" texts the customer their Google review URL automatically.
- P2: True push notifications + background location for cleaners — bundle with native builds (foreground
  polling/sharing already works everywhere).
- P3 (code health, from testing agent review): split server.py (~1050 lines) into modules; wrap put_object/get_object
  in run_in_threadpool (partially done for photo upload); hard-delete orphaned storage blobs on assignment/photo
  delete; themed confirm dialogs instead of window.confirm; stale-ping warning on cleaner screen; pause
  AdminTeam polling when tab hidden; assignment upsert w/ unique quote_id index; Field(max_length) on
  AssignmentCreate; dynamic import() for leaflet; skip fitBounds when cleaner set unchanged;
  AdminHistory catch on cleaners fetch is silent — surface a subtle hint.

## Done (June 21, 2026 session)
- Admin "Business" tab: editable logo (upload/reset), phone, toll-free, address, website, hours — live app-wide.
- Per-image fit toggle (Fill frame / Show full) in admin Images; respected by Home promos + Gallery.
- PWA: manifest, service worker, icons, meta tags (installable web app).
- Fixes: hero slot self-heal on startup; tests conftest.py env loading; CI=1 Metro workaround for low inotify limit.
- **Book Again**: last quote saved to AsyncStorage ('tidyups_last_quote', src/lib/lastQuote.js). Home shows
  "Welcome back" card → /quote?bookAgain=<ts> prefills form (banner shown, stale date cleared). On submit of a
  book-again form, message gets '[Book Again]' tag → admin LeadCard shows gold "Returning customer" chip and
  strips the tag from the displayed message (production backend untouched — tag rides in the message field).
- **Cleaner tracking**: /cleaner modal (Contact tab → "Cleaner Check-In"): name+PIN check-in (profile stored in
  AsyncStorage 'tidyups_cleaner'), Start/Stop sharing via expo-location watchPositionAsync (20s/40m), pings LOCAL
  backend. Admin → 4th "Team" segment (AdminTeam.js): PIN editor, live cleaner list (green dot if sharing &
  last_seen<3min, 30s auto-poll), open-in-Google-Maps track button, delete.
- **Lead alerts**: useLeadAlerts hook (src/lib/leadAlerts.js) in root layout — polls production GET /api/quotes
  every 60s when tidyups_admin_pw stored, compares created_at vs 'tidyups_last_lead_seen', fires web Notification
  (web) / expo-notifications local notification (native). Permission requested on admin login.
- **Store prep**: eas.json (build profiles), app.json plugins (expo-location perm string, expo-notifications),
  /app/STORE_SUBMISSION_GUIDE.md (user has both Apple + Google accounts; builds must run from user's machine
  with their Expo login), /app/PRIVACY_POLICY.md (host at tidyupscleaning.com/privacy for store listings).
- All tested: iteration_6.json (19/19 + 100%), iteration_7.json (20/20 + 100%), Book Again self-tested via
  Playwright with network interception (no production quote ever submitted).
- **Code-quality pass (iteration 8, all verified — 68/68 backend, 0 console errors)**: removed both
  dangerouslySetInnerHTML in +html.js (style → string child; SW registration → public/register-sw.js);
  test files read ADMIN_PASSWORD from env via conftest (no hardcoded creds); serve_site_image/serve_app_image
  return moved inside try; `is True/False` assertions → truthiness; contact.js hours key `${day}-${index}`;
  console.warn added to previously-silent catches (leadAlerts/lastQuote/business/gallery). Verified false
  positives NOT changed: `is None` idioms in google_sheets.py/server.py; hook deps (module constants/stable
  setters — adding them risks loops).
- **Dispatch Board (iteration 9, 80/80 backend + frontend 100%)**: LOCAL `assignments` collection (snapshot of
  lead details since production untouchable): POST/GET/DELETE /api/assignments (admin), GET
  /api/cleaners/{id}/jobs (X-Cleaner-Pin header), POST /api/assignments/{id}/done (cleaner), cascade delete on
  cleaner removal, 1-assignment-per-quote (delete_many+insert). Admin lead cards: "Assign to cleaner" btn →
  CleanerPicker.js bottom sheet → "Assigned to {name}" row with unassign X. Cleaner screen: "Your Jobs" section
  (60s poll) with tappable address/phone + Mark Done; 401 during poll clears jobs + prompts re-checkin.
- **Team Map View (iteration 9)**: AdminTeam List/Map toggle; TeamMap.js = raw Leaflet (yarn leaflet@1.9.4,
  require() in effect, web-only w/ native fallback), Carto dark_all tiles, circleMarkers (green live/gray stale),
  permanent name tooltips, fitBounds. leaflet.css copied to public/ + linked in +html.js.
- Post-review polish applied: setError('') on assign/unassign, CleanerPicker inline error, pointerEvents via style.
- **Dispatch button (owner request)**: violet "Dispatch" pill in Home top bar (testid dispatch-btn, replaced the
  Edmonton chip) → /admin; app remembers admin password after first login so it's one tap. Self-tested via
  Playwright (button → login → board).
- **Iteration 10 (92/92 backend + frontend 100%)** — three features:
  - **Job status updates**: assignments lifecycle assigned→on_the_way→cleaning→done via POST
    /api/assignments/{id}/status (cleaner PIN auth; sets status_updated_at, completed_at on done); cleaner job
    cards show 3-step status row (JOB_STEPS in cleaner.js, testids cleaner-job-{status}-{i}); jobs filter now
    $in[assigned,on_the_way,cleaning]; admin lead cards show status pill (STATUS_META: violet/gold/green);
    assignments auto-poll every 30s on Leads tab. Legacy /done endpoint kept.
  - **Daily summary**: DailySummary card atop Leads tab (Today's Leads / Active Jobs (status!=done) / Done Today,
    testids summary-*), computed client-side from leads + full assignmentList state.
  - **Dispatch password change**: ARCHITECTURE CHANGE — app admin login + leads now hit LOCAL backend
    (/api/admin/login, new GET /api/leads proxy that relays production /api/quotes using backend/.env
    PRODUCTION_API_URL + PRODUCTION_ADMIN_PASSWORD via run_in_threadpool). Local password: ADMIN_PW_CACHE
    (env default, DB override app_settings key="security", loaded at startup, updated on PUT /api/admin/password,
    min 6 chars). Business tab "Dispatch Password" card (admin-pw-new/confirm/save); on success updates
    AsyncStorage + parent storedPw via onPasswordChanged. NOTE: cache is process-local — fine single-worker;
    multi-worker would need per-request DB read.


- **Iteration 18 (Feb 2026, 103/103 backend + frontend 100%)** — TestFlight crash fix + 10 code-review fixes verified:
  - **TestFlight startup crash fix**: `/app/frontend/src/lib/api.js` line 9 now falls back to hardcoded backend URL
    when `EXPO_PUBLIC_BACKEND_URL` is missing at EAS build time (no top-level throw that would crash native app
    before React mounts).
  - **Atomic assignment claim**: `server.py:1006` uses `db.assignments.find_one_and_update` — single-writer wins,
    prevents double-assignment races.
  - **HMAC-signed proof photos**: `_apply_proof_signature/_proof_sig_ok` (server.py:48-82) use `hmac.compare_digest`
    with 1h TTL; `serve_app_image` (649-683) enforces sig OR admin header OR cleaner+pin on `/proof/` paths.
  - **Background Twilio task GC fix**: `_spawn_bg` (server.py:33-45) retains strong refs in `_BG_TASKS` set with
    done-callback for exception logging — no "coroutine was never awaited" warnings.
  - **Idempotent review-request**: `review_sent_at` only set after successful Twilio send (line 1173 sync path,
    line 1149 background path); endpoint returns 502 when Twilio env vars missing.
  - **iOS location metadata**: Removed "Always" location permission from app.json (only when-in-use).
  - Backend regression: `pytest -n 0` 103/103 in 90.72s. Frontend regression: home, /privacy, /terms, /quote,
    /cleaner check-in (PIN 1234), /admin login (tidyups2026) all 5 tabs — all pass.
  - Report: `/app/test_reports/iteration_18.json`.

- **Feb 2026 session (108/108 backend + smoke frontend)** — additional owner-facing tools:
  - **Twilio production creds** set in `/app/backend/.env` (SID/token/from +18255334317). Verified queued send to +17807185092.
  - **Rapid photo capture (cleaner)**: on native, `launchCameraAsync` loops after each successful upload
    — up to 50-photo burst until cleaner cancels. On web, gallery multi-select with `selectionLimit: 50`.
    Photo count shown in label; "Snap another" / "Add more" button.
  - **Client Notes**: new `client_notes` Mongo collection keyed by `_client_key(name, phone)` (lowercased trimmed name + digits-only phone). Endpoints:
    `GET /api/clients/notes?customer_name=…&phone=…`, `PUT /api/clients/notes`. Assignments now include
    `client_notes` field (batch-loaded via `_clean_assignments_with_notes` on list endpoints). Admin edits
    inline in "By Client" History view; cleaners see gold notes box on every matching job card.
  - **History By-Client view**: new "Recent / By Client" toggle in AdminHistory. Groups done assignments by
    `_client_key`, shows expandable client card (visits list + notes editor).
  - **Photo-Required-To-Done**: `require_photos_for_done` flag in app_settings (DEFAULT_BUSINESS default False).
    Business tab toggle. Server enforces on POST /api/assignments/{id}/status (status=done) — returns 400
    with helpful message when photos missing. Cleaner Done button gets lock icon + gold hint. Setting polled
    every 60s by cleaner screen. 5 new pytest cases.
  - **Duplicate-Client Merge**: `POST /api/clients/merge` (from_name+from_phone → into_name+into_phone).
    Rewrites assignments' customer_name/phone, concatenates notes into target ([merged from …] tag), deletes
    source note doc. UI: "Merge into another client…" button on each ClientGroupCard opens a MergePickerModal
    listing other groups from current list; select target → confirm → refresh.
  - **Owner Nightly Digest**: env vars `DIGEST_TO_NUMBER`, `DIGEST_HOUR` (default 21), `DIGEST_TZ_OFFSET_HOURS`
    (default -7 = Mountain). Background scheduler task (`_digest_scheduler_loop`) spawned via `_schedule_bg`
    at startup; runs hourly, fires once at target hour, idempotent via `last_sent_local_date` in `digest_meta`.
    Body includes today's leads count + top lead, jobs done, missed reviews. Endpoints
    `GET /api/admin/digest/preview` + `POST /api/admin/digest/send-now`. UI: DigestCard in Business tab with
    "Preview digest" and gold "Send now" buttons + preview body.
  - **Home Staff Login button**: prominent violet CTA in hero section (below Call) — `home-staff-login` testID
    navigates to /admin. Complements existing top-bar Dispatch pill.
  - **Twilio review-request test** rewritten to be Twilio-config-agnostic (`test_send_review_respects_twilio_configuration`).
  - Test credentials note: DB admin password is now `tidyups` (user changed from baseline `tidyups2026`).

