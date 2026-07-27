import React from 'react';
import LegalPage from '../components/LegalPage';

const SECTIONS = [
  {
    heading: '1. Submit a deletion request',
    body: [
      {
        type: 'p',
        text:
          'Email [hello@tidyupscleaning.com](mailto:hello@tidyupscleaning.com?subject=Delete%20my%20Tidyups%20data) with the subject line **"Delete my Tidyups data"**.',
      },
      {
        type: 'p',
        text:
          'You do not need to install the app or sign in to submit a request. You may also call **(780) 718-5092** if you need help.',
      },
    ],
  },
  {
    heading: '2. Information to include',
    body: [
      {
        type: 'ul',
        items: [
          'Your full name',
          'The phone number or email address used with Tidyups',
          'Your service address, if needed to identify the correct booking records',
          'Whether you want all personal data deleted or only specific records or photos',
        ],
      },
      {
        type: 'p',
        text:
          'Do not email passwords, payment card details, government identification, or other unnecessary sensitive information.',
      },
    ],
  },
  {
    heading: '3. What we delete',
    body: [
      {
        type: 'p',
        text: 'After verifying the request, we will delete the personal data associated with you, including where applicable:',
      },
      {
        type: 'ul',
        items: [
          'Contact details and service addresses',
          'Quote requests and booking history',
          'Property notes and service preferences',
          'Before-and-after photos linked to your jobs',
          'Cleaner profile and location records if you used the app as a staff member',
        ],
      },
    ],
  },
  {
    heading: '4. Verification and timing',
    body: [
      {
        type: 'p',
        text:
          'We may contact you using information already associated with your records to confirm your identity and prevent unauthorized deletion requests.',
      },
      {
        type: 'p',
        text:
          'Verified photo-deletion requests are completed within **7 days**. Other verified deletion requests are completed within **30 days**, and we will confirm when the request is finished.',
      },
    ],
  },
  {
    heading: '5. Data we may retain',
    body: [
      {
        type: 'p',
        text:
          'We may retain limited records when required for tax, accounting, fraud prevention, safety, dispute resolution, or other legal obligations. Data that no longer identifies you may also be retained for aggregate reporting. Any retained information remains protected and is not used for marketing.',
      },
    ],
  },
];

export default function RemoveDataScreen() {
  return (
    <LegalPage
      testID="remove-data-page"
      kicker="Privacy"
      title="Delete Your Data"
      updated="July 26, 2026"
      intro="Use this page to request deletion of personal information associated with the Tidyups Cleaning app or services."
      sections={SECTIONS}
    />
  );
}
