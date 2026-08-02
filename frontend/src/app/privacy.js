import React from 'react';
import LegalPage from '../components/LegalPage';

const SECTIONS = [
  {
    heading: '1. Who we are',
    body: [
      {
        type: 'p',
        text:
          '**Tidyups Cleaning Inc.** ("Tidyups", "we", "us", "our") is a residential and commercial cleaning company operating in Edmonton, Alberta, Canada. This policy describes how we collect, use, and share your information when you use the Tidyups Cleaning mobile app and website at [bookscrubby.com](https://bookscrubby.com) (together, the "Services").',
      },
      {
        type: 'p',
        text:
          'For questions about this policy or your data, email us at [hello@tidyupscleaning.com](mailto:hello@tidyupscleaning.com) or call **(780) 718-5092**.',
      },
    ],
  },
  {
    heading: '2. Information we collect',
    body: [
      {
        type: 'p',
        text:
          'We collect only the information we need to book, deliver, and improve your clean.',
      },
      { type: 'p', text: '**Information you provide when requesting a quote or booking:**' },
      {
        type: 'ul',
        items: [
          'Full name, phone number, and email address',
          'Service address (city, province, postal code, and street address)',
          'Property details you choose to share (property type, bedrooms, bathrooms, preferred date, and any notes)',
        ],
      },
      { type: 'p', text: '**Information collected automatically:**' },
      {
        type: 'ul',
        items: [
          'Approximate device information (browser, OS, screen size) needed to render the app correctly',
          'Basic analytics such as which pages/screens you visited so we can improve the app',
          'A local record of your most recent quote request (stored on your device) so we can offer a one-tap "Book Again"',
        ],
      },
      { type: 'p', text: '**Cleaner-only information (for staff who check in to our dispatch):**' },
      {
        type: 'ul',
        items: [
          "Cleaner name and the team PIN used to check in",
          "Precise device location shared **only while a cleaner has explicitly tapped 'Start Sharing Location'** and stops as soon as they tap 'Stop Sharing' or sign out",
          "Before-and-after photos of a job site that the cleaner explicitly captures and uploads for proof of service",
        ],
      },
    ],
  },
  {
    heading: '3. How we use your information',
    body: [
      { type: 'p', text: 'We use the information above to:' },
      {
        type: 'ul',
        items: [
          'Contact you to confirm a quote and schedule the clean',
          'Route the assigned cleaning team to your address',
          'Send a one-time text message with a link to leave a Google review after the job is marked done (you can ignore or unsubscribe at any time)',
          'Provide before-and-after photos on request so you can see the work that was completed',
          'Improve the reliability, safety, and quality of our Services',
          'Meet our legal, tax, and safety obligations',
        ],
      },
      {
        type: 'p',
        text:
          'We do **not** sell your personal information, and we do **not** share it with advertisers or data brokers.',
      },
    ],
  },
  {
    heading: '4. Who we share information with',
    body: [
      { type: 'p', text: 'We share information only with the small number of service providers we need to operate:' },
      {
        type: 'ul',
        items: [
          '**Twilio** (SMS delivery) — receives the customer phone number and message text needed to send booking confirmations and the post-job review link.',
          '**Google Cloud / Google Sheets** — used internally to keep an ordered log of quote requests for our operations team.',
          '**Emergent Platform** — hosts the app, backend, and object storage where uploaded photos and business assets are stored.',
          '**MongoDB Atlas** — the database that stores appointments, cleaner profiles, and photos.',
        ],
      },
      {
        type: 'p',
        text:
          "We may also disclose information when required by law, to enforce our terms, or to protect the rights and safety of Tidyups, our customers, or the public.",
      },
    ],
  },
  {
    heading: '5. Location data (cleaners only)',
    body: [
      {
        type: 'p',
        text:
          "Location sharing is used exclusively by our cleaning team. When a cleaner taps **Start Sharing Location** we begin sending their device's GPS coordinates to our dispatch board so the admin can see who is on the way to which job. Location sharing:",
      },
      {
        type: 'ul',
        items: [
          "Is **off by default** and never runs in the background — only while the cleaner has the app open and has tapped Start",
          "Stops immediately when the cleaner taps **Stop Sharing** or signs out",
          "Is retained only for the duration of the shift; older pings are discarded",
          "Is never shown to customers and is never sold or used for advertising",
        ],
      },
    ],
  },
  {
    heading: '6. Photos (job proof)',
    body: [
      {
        type: 'p',
        text:
          "Cleaners can add before-and-after photos to an active job. These photos are stored securely and shown only to (a) the assigned cleaner, (b) our office admin, and (c) the customer whose home was cleaned, on request.",
      },
      {
        type: 'p',
        text:
          "You can request that we delete any photo of your property by emailing [hello@tidyupscleaning.com](mailto:hello@tidyupscleaning.com). We will remove it within 7 days.",
      },
    ],
  },
  {
    heading: '7. How long we keep your data',
    body: [
      {
        type: 'ul',
        items: [
          'Quote requests and booking history: up to **24 months** to help with recurring bookings and disputes.',
          'Before/after photos: up to **12 months** unless you ask us to delete them sooner.',
          'Cleaner location pings: **not persisted** beyond active use.',
          'Aggregate, non-identifying analytics: retained indefinitely.',
        ],
      },
    ],
  },
  {
    heading: '8. Your rights',
    body: [
      {
        type: 'p',
        text:
          'You can ask us to (a) tell you what personal information we hold about you, (b) correct any inaccuracies, or (c) delete your data. Visit [Delete Your Data](https://bookscrubby.com/removerdata) or email [hello@tidyupscleaning.com](mailto:hello@tidyupscleaning.com) with the subject line **"Privacy request"** and we will respond within 30 days.',
      },
      {
        type: 'p',
        text:
          "Because Tidyups is based in Alberta, we follow Alberta's Personal Information Protection Act (PIPA) and Canada's Personal Information Protection and Electronic Documents Act (PIPEDA). If you are not satisfied with how we handled your request, you can contact the Office of the Information and Privacy Commissioner of Alberta.",
      },
    ],
  },
  {
    heading: '9. Children',
    body: [
      {
        type: 'p',
        text:
          "The Services are intended for adults booking a cleaning service. We do not knowingly collect personal information from children under 13. If you believe a child has provided us information, please contact us and we will delete it.",
      },
    ],
  },
  {
    heading: '10. Security',
    body: [
      {
        type: 'p',
        text:
          'We use HTTPS everywhere, encrypted database connections, and role-based access controls so only authorised staff can view customer records. No system is 100% secure — if we ever learn of a breach that affects your information, we will notify you as required by law.',
      },
    ],
  },
  {
    heading: '11. Changes to this policy',
    body: [
      {
        type: 'p',
        text:
          "We may update this policy from time to time. When we do, we will update the 'Last updated' date at the top of this page and, for material changes, add a notice inside the app.",
      },
    ],
  },
];

export default function PrivacyScreen() {
  return (
    <LegalPage
      testID="privacy-page"
      kicker="Legal"
      title="Privacy Policy"
      updated="July 26, 2026"
      intro="This policy explains what personal information Tidyups Cleaning Inc. collects when you use bookscrubby.com or the Tidyups mobile app, and how we use, store, and protect it."
      sections={SECTIONS}
    />
  );
}
