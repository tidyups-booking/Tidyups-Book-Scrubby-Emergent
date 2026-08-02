# Tidyups Cleaning — App Store & Google Play Submission Guide

Everything in the repo is already configured (app.json bundle IDs, icons,
splash, eas.json build profiles, location, and notification permission strings).
Native artifacts are built manually by the repository's **Local EAS Builds**
GitHub Actions workflow. It uses `eas build --local`, not EAS cloud builds.

## 0. One-time setup (10 min)
1. Create a free Expo account at https://expo.dev/signup (if you don't have one).
2. Configure the repository secret `EXPO_TOKEN2` and the Expo-managed Android
   and iOS signing credentials for the existing project ID in `frontend/app.json`.
3. In GitHub Actions, select **Local EAS Builds** and use **Run workflow**.
4. Choose the required platform and production artifact. Building avoids EAS
   cloud-build charges, but GitHub-hosted runner minutes can incur cost after
   quota; macOS iOS minutes are especially expensive.

## 1. Android — Google Play ($25 one-time account)
1. Run **Local EAS Builds** with platform `android` and artifact
   `android-aab`, then download the `.aab` workflow artifact.
2. Go to https://play.google.com/console → "Create app":
   - Name: Tidyups Cleaning · Default language: English (CA) · App type: App · Free.
3. Complete the "Set up your app" checklist (content rating, data safety — see notes below, target audience 18+).
4. Upload the downloaded `.aab` under Production → Create new release.
   Submission is intentionally not automated by this repository.

## 2. iOS — App Store ($99/yr Apple Developer account)
1. Run **Local EAS Builds** with platform `ios` and artifact `ios-production`,
   then download the `.ipa` workflow artifact.
2. Upload the `.ipa` to App Store Connect with Apple's Transporter or another
   explicitly authorized release tool. Submission is intentionally not
   automated by this repository.
3. In https://appstoreconnect.apple.com → My Apps → Tidyups Cleaning:
   - Fill in the listing (description, keywords, support URL, screenshots).
   - Screenshots: run the app, take 6.5" iPhone screenshots (1290×2796). The dark theme looks great here.
   - Add the App Privacy details (see below) and submit for review.

## 3. Data-safety / App-privacy answers (both stores)
The app collects:
- **Contact info (name, phone, email, address)** — only when a customer submits a quote request; used for
  service delivery; not shared with third parties; not used for tracking.
- **Precise location** — ONLY for staff members who tap "Start Sharing Location" in the Cleaner
  Check-In screen; used for dispatch coordination; user-initiated, can stop anytime; not shared.
- No ads, no analytics SDKs, no tracking across apps.
Privacy policy: host `PRIVACY_POLICY.md` (in the repo root) on your website, e.g.
`https://tidyupscleaning.com/privacy`, and paste that URL into both store listings.

## 4. Store listing copy (ready to paste)
- **Title**: Tidyups Cleaning
- **Subtitle/Short description**: Edmonton's trusted cleaning crew — quotes in one tap.
- **Description**:
  Sparkling spaces, zero hassle. Tidyups Cleaning Service brings Edmonton's 5-star residential and
  commercial cleaning to your pocket. Browse our services, get a free quote in under a minute,
  check out our latest promotions, and call or text us with one tap. Insured & bonded, eco-friendly
  products, satisfaction guaranteed.
- **Keywords (iOS)**: cleaning,house cleaning,maid,Edmonton,deep clean,move out,airbnb,office cleaning
- **Category**: Lifestyle (or House & Home on Google Play)

## 5. After approval
- Push notifications & background location for cleaners work best in these native builds.
- To ship an update later, run the local GitHub Actions build again, review its
  artifact, and perform the store upload as a separate release action.
