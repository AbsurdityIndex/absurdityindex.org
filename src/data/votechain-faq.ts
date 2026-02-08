// VoteChain FAQ — 150 questions across 14 categories
// Content sourced from PRD-VOTER-VERIFICATION-CHAIN.md and PRD-VOTECHAIN-ELECTION-WEB-PROTOCOL.md

export type FaqStatus = 'answered' | 'open';

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  status: FaqStatus;
}

export interface FaqCategory {
  slug: string;
  title: string;
  icon: string;
  description: string;
  items: FaqItem[];
}

export const VOTECHAIN_FAQ: FaqCategory[] = [
  // ── 1. The Basics (12 questions, 0 open) ──────────────────────────────
  {
    slug: 'basics',
    title: 'The Basics',
    icon: 'help-circle',
    description: 'What VoteChain is, what it does, and what it does not do.',
    items: [
      {
        id: 'basics-01',
        question: 'What is VoteChain?',
        answer:
          'VoteChain is a proposed <strong>voter verification and ballot integrity system</strong> for U.S. federal elections. It uses cryptographic proofs — not trust in any single person or agency — to confirm that voters are eligible, that each vote is counted exactly once, and that nobody can tamper with the record after the fact.',
        status: 'answered',
      },
      {
        id: 'basics-02',
        question: 'Is VoteChain a voting machine?',
        answer:
          'No. VoteChain is a <strong>verification and audit layer</strong> that sits alongside existing election infrastructure. It does not replace ballot casting or counting equipment. A companion protocol called the <strong>Election Web Protocol (EWP)</strong> handles ballot integrity — the chain of custody from cast to tally.',
        status: 'answered',
      },
      {
        id: 'basics-03',
        question: 'Has VoteChain been used in a real election?',
        answer:
          'No. VoteChain is a <strong>technical blueprint</strong>, not a deployed system. It has not been certified by any election authority. The performance and security numbers in the design documents are targets, not proven results. A working proof-of-concept demo runs entirely in your browser for educational purposes.',
        status: 'answered',
      },
      {
        id: 'basics-04',
        question: 'Why use a blockchain instead of a normal database?',
        answer:
          'A normal database has an administrator who can change or delete records. A blockchain distributes the ledger across <strong>74 independent nodes</strong> — operated by federal agencies, all 50 states, independent auditors, and congressional oversight bodies. Altering a record would require corrupting a majority of nodes across multiple categories, which is computationally infeasible.',
        status: 'answered',
      },
      {
        id: 'basics-05',
        question: 'Is this like Bitcoin or cryptocurrency?',
        answer:
          'No. VoteChain uses a <strong>permissioned consortium blockchain</strong> with no tokens, no mining, no gas fees, and no speculation. Only authorized government and oversight entities can operate nodes. It borrows the tamper-resistance properties of blockchain technology without the economics.',
        status: 'answered',
      },
      {
        id: 'basics-06',
        question: 'What problem does VoteChain solve?',
        answer:
          'Today, the U.S. has 50 different voter ID systems, fraud detection that takes weeks, and contested results that erode public trust. VoteChain aims to answer four questions with mathematical certainty: <strong>Is this person a citizen? Are they eligible here? Are they alive and present? Have they already voted?</strong>',
        status: 'answered',
      },
      {
        id: 'basics-07',
        question: 'Do I need to understand cryptography to use VoteChain?',
        answer:
          'No. For voters, the experience is simple: enroll once, then tap your phone or card at the polls. All the cryptography happens behind the scenes. You never see a hash, a proof, or a blockchain address.',
        status: 'answered',
      },
      {
        id: 'basics-08',
        question: 'What are the "Five Pillars" of verification?',
        answer:
          'Every verification checks five things: <strong>(1) Citizenship</strong> — confirmed via government databases at enrollment. <strong>(2) Eligibility</strong> — registered in the right jurisdiction. <strong>(3) Liveness</strong> — the person is alive and physically present. <strong>(4) Uniqueness</strong> — they have not already voted in this election. <strong>(5) Chain of custody</strong> — the verification device itself has not been tampered with.',
        status: 'answered',
      },
      {
        id: 'basics-09',
        question: 'What is the Election Web Protocol (EWP)?',
        answer:
          'EWP is the companion protocol that handles <strong>ballot integrity</strong> — ensuring every ballot is encrypted, recorded on a public bulletin board, included in the tally, and counted correctly. It provides the cryptographic chain of custody from the moment you cast your vote to the final count.',
        status: 'answered',
      },
      {
        id: 'basics-10',
        question: 'Who controls VoteChain?',
        answer:
          'No single entity. Consensus requires agreement from at least <strong>3 of 4 node categories</strong> (federal, state, auditor, oversight), and at least one independent category must always be in the approving set. No political party, branch of government, or state can unilaterally control the system.',
        status: 'answered',
      },
      {
        id: 'basics-11',
        question: 'What happens to my current voter registration?',
        answer:
          'Your state voter registration remains in place. VoteChain links your cryptographic credential to your registration using encrypted state storage. On-chain, only a hashed jurisdiction linkage is recorded — not your name or address.',
        status: 'answered',
      },
      {
        id: 'basics-12',
        question: 'Can I still vote with a paper ballot?',
        answer:
          'Yes. VoteChain is a <strong>verification layer</strong>, not a ballot format. How you mark your choices — paper, touchscreen, or accessible device — is a separate decision. The EWP ballot integrity protocol works with both electronic and paper-based casting systems.',
        status: 'answered',
      },
    ],
  },

  // ── 2. Privacy & Surveillance (12 questions, 2 open) ──────────────────
  {
    slug: 'privacy',
    title: 'Privacy & Surveillance',
    icon: 'eye-off',
    description: 'How VoteChain protects your identity and prevents government tracking.',
    items: [
      {
        id: 'privacy-01',
        question: 'Can the government see how I voted?',
        answer:
          'No. VoteChain verifies <strong>eligibility and ballot issuance only</strong>. Ballot selection is handled by a completely separate system (the Election Web Protocol). The two are architecturally separated — VoteChain literally cannot reveal how you voted because it never has that information.',
        status: 'answered',
      },
      {
        id: 'privacy-02',
        question: 'Is my name stored on the blockchain?',
        answer:
          'No. <strong>No personally identifiable information (PII) is stored on-chain — ever.</strong> The blockchain only stores cryptographic attestations tied to your Decentralized Identifier (DID), which is a random-looking string of letters and numbers that is not linked to your real identity on-chain.',
        status: 'answered',
      },
      {
        id: 'privacy-03',
        question: 'What are zero-knowledge proofs and why do they matter?',
        answer:
          'A zero-knowledge proof lets VoteChain confirm "this person is eligible and hasn\'t voted yet" <strong>without revealing who they are</strong>. It is a mathematical way of proving a statement is true without showing any of the underlying data. Poll workers see a green light or red light — nothing else.',
        status: 'answered',
      },
      {
        id: 'privacy-04',
        question: 'Could someone correlate my identity by tracking when and where I voted?',
        answer:
          'The system mitigates this: verification records use <strong>polling-place hashes</strong> (not addresses), and timestamps are <strong>rounded to 15-minute windows</strong> on-chain. Linking a DID to a real person requires court-ordered access to the encrypted state PII vault.',
        status: 'answered',
      },
      {
        id: 'privacy-05',
        question: 'What if a node operator reads my verification data?',
        answer:
          'All verification data is <strong>encrypted in transit and at rest</strong>. Node operators see encrypted blobs, not cleartext. They can confirm the ledger is consistent without being able to read individual records.',
        status: 'answered',
      },
      {
        id: 'privacy-06',
        question: 'Can VoteChain data be subpoenaed for political targeting?',
        answer:
          'DIDs are pseudonymous. Linking a DID to a real person requires a <strong>court order</strong> to access the state PII vault. The proposed legislation explicitly prohibits using VoteChain data for non-election purposes — including immigration enforcement, law enforcement, and commercial use.',
        status: 'answered',
      },
      {
        id: 'privacy-07',
        question: 'Where is my biometric data stored?',
        answer:
          'If you choose the biometric path, your template is stored <strong>only on your personal device or secure card</strong> — never in a central database, never on the blockchain. At the polls, only a "match: yes/no" result is produced. The raw biometric never leaves your device.',
        status: 'answered',
      },
      {
        id: 'privacy-08',
        question: 'What happens to my data after an election?',
        answer:
          'On-chain verification records are permanent (that is the whole point of the audit trail). Enrollment PII in the encrypted vault is purged <strong>10 years after your last verification</strong>. Biometric templates remain under your control on your device until you delete them.',
        status: 'answered',
      },
      {
        id: 'privacy-09',
        question: 'Could a future government misuse the system for mass surveillance?',
        answer:
          'This is a legitimate concern. The architecture is designed to make misuse structurally difficult: PII is off-chain, DIDs are pseudonymous, multi-party consensus prevents unilateral access, and legislation prohibits non-election use. However, <strong>no technical system can fully prevent political misuse if laws change</strong>. Ongoing independent oversight and public auditing are the long-term safeguards.',
        status: 'open',
      },
      {
        id: 'privacy-10',
        question: 'Can I opt out of VoteChain entirely?',
        answer:
          'The design mandates VoteChain for federal election verification, but <strong>provisional ballot rights are always preserved</strong>. If you cannot or will not enroll, you can still vote via the existing provisional ballot process under HAVA. Your vote would be adjudicated through a tracked workflow.',
        status: 'answered',
      },
      {
        id: 'privacy-11',
        question: 'How does the receipt system avoid proving how I voted?',
        answer:
          'Cast receipts contain only a <strong>bulletin board leaf hash, a signed tree head, and a VoteChain anchor</strong> — none of which reveal ballot content. Even if you share your receipt with someone, they cannot determine your vote selections from it. Threshold decryption ensures no single party can decrypt an individual ballot.',
        status: 'answered',
      },
      {
        id: 'privacy-12',
        question: 'What stops the government from tracking IP addresses of remote voters?',
        answer:
          'For remote voting (Mode 3, which is gated and not yet approved), the design requires an <strong>OHTTP or equivalent proxy layer</strong> to prevent gateway operators from correlating IP addresses with voters. However, this is an unsolved gate criterion — independent traffic-analysis audits must validate it before any remote deployment.',
        status: 'open',
      },
    ],
  },

  // ── 3. Security & Hacking (12 questions, 2 open) ─────────────────────
  {
    slug: 'security',
    title: 'Security & Hacking',
    icon: 'shield',
    description: 'How VoteChain defends against nation-states, insiders, and hackers.',
    items: [
      {
        id: 'security-01',
        question: 'What if a nation-state attacks the blockchain?',
        answer:
          'Nodes are <strong>geographically distributed</strong> across the country, use hardware security modules (HSMs) for key storage, run on separate networks, and have DDoS protection with air-gapped backup nodes. Compromising the system would require corrupting a majority of nodes across multiple independent categories — federal, state, auditor, and oversight.',
        status: 'answered',
      },
      {
        id: 'security-02',
        question: 'What if a single node is hacked?',
        answer:
          'A compromised node is <strong>reduced to observer status</strong>. The other nodes continue consensus without it. The affected operator has 24 hours to bring a backup node online. No single node compromise can alter the ledger because consensus requires multi-category agreement.',
        status: 'answered',
      },
      {
        id: 'security-03',
        question: 'What if someone hacks a poll worker\'s device?',
        answer:
          'Every verification device has its own cryptographic identity (device DID) stored in a hardware security module. If a device is compromised, its attestations are <strong>revoked</strong>, all verifications it performed are <strong>flagged for review</strong>, and backup hardware is deployed. The Benaloh challenge also lets voters audit their encrypted ballot independently.',
        status: 'answered',
      },
      {
        id: 'security-04',
        question: 'Can quantum computers break VoteChain?',
        answer:
          'VoteChain specifies <strong>post-quantum cryptographic algorithms</strong> (following NIST PQC standards published in 2024) for all new key generation, plus a migration plan for existing keys. This is a long-term threat, not an immediate one, but the architecture is designed for cryptographic agility.',
        status: 'answered',
      },
      {
        id: 'security-05',
        question: 'What if someone steals my credential?',
        answer:
          'Your credential requires <strong>liveness verification</strong> at the polls — either a biometric scan on your device or a PIN/passphrase plus your device/card plus poll worker attestation. A stolen credential alone is not enough because the thief cannot pass the liveness check.',
        status: 'answered',
      },
      {
        id: 'security-06',
        question: 'Who does the security testing?',
        answer:
          'The plan requires <strong>annual red team exercises</strong> by at least two independent firms, a continuous bug bounty program with rewards up to $500K for critical vulnerabilities, and a pre-election stress test 60 days before each federal election simulating 2x expected load. Results are published publicly.',
        status: 'answered',
      },
      {
        id: 'security-07',
        question: 'What is the Benaloh challenge?',
        answer:
          'A <strong>cast-as-intended verification</strong> mechanism. Before casting, you can "challenge" the device to prove it encrypted your actual selections correctly. A challenged ballot is spoiled (not counted) and the encryption is revealed for verification. You can then re-encrypt and cast or challenge again. A cheating device cannot predict which ballots will be challenged.',
        status: 'answered',
      },
      {
        id: 'security-08',
        question: 'What happens if the entire network goes down on election day?',
        answer:
          'Polling devices <strong>cache the last known chain state</strong> and continue verifications in "optimistic mode." Provisional ballots are always available. Post-election reconciliation resolves any discrepancies. The incident command structure has a runbook for this exact scenario with a 30-minute workaround activation target.',
        status: 'answered',
      },
      {
        id: 'security-09',
        question: 'Can a rogue enrollment authority create fake voters?',
        answer:
          'Credential issuance uses <strong>threshold signing</strong> — at least 2 of 3 independent enrollment authorities must co-sign any credential. A single compromised authority cannot mint valid credentials alone. Enrollment anomaly detection also watches for patterns like burst registrations from a single address.',
        status: 'answered',
      },
      {
        id: 'security-10',
        question: 'What if multiple enrollment authorities collude?',
        answer:
          'If the required threshold of issuers collude and stay within the voter roll ceiling, the attack <strong>succeeds cryptographically</strong> — the system cannot distinguish forged credentials from legitimate ones. This is a known residual risk mitigated by operational controls: independent issuer selection, legal deterrence, audit trails, and post-election statistical analysis.',
        status: 'open',
      },
      {
        id: 'security-11',
        question: 'What if someone tampers with the bulletin board?',
        answer:
          'The bulletin board is an append-only Merkle log. <strong>Independent monitors</strong> (at least 3 operators from at least 2 different organizations) continuously check signed tree heads, consistency proofs, and VoteChain anchors. If the BB shows different histories to different observers, monitors detect the inconsistency and alert.',
        status: 'answered',
      },
      {
        id: 'security-12',
        question: 'How is the system protected against insider threats?',
        answer:
          'No single operator can alter records. Consensus requires <strong>multi-category agreement</strong> (federal + state + auditor + oversight). All operator actions are logged on-chain. Smart contract updates require multi-party approval with a 30-day public comment period for non-emergency changes. This is an area where <strong>governance design is as important as cryptography</strong>.',
        status: 'open',
      },
    ],
  },

  // ── 4. Voter Experience (11 questions, 1 open) ────────────────────────
  {
    slug: 'experience',
    title: 'Voter Experience',
    icon: 'user',
    description: 'What enrollment and election day actually look and feel like.',
    items: [
      {
        id: 'experience-01',
        question: 'How do I enroll in VoteChain?',
        answer:
          'Enrollment happens <strong>once</strong> (or once per decade for re-verification). You provide your name, date of birth, and identifiers at any enrollment location — DMV, library, community center, post office, or via a mobile enrollment van. The system verifies your identity through government databases, not by looking at a card. Target time: under 30 minutes.',
        status: 'answered',
      },
      {
        id: 'experience-02',
        question: 'Do I need a government-issued photo ID to enroll?',
        answer:
          '<strong>No.</strong> The system verifies identity through multi-source database matching — SSA, USCIS, state vital records, and passport records. A positive match from any 2 of 4 sources constitutes verification. No enrollment channel requires you to already have a photo ID.',
        status: 'answered',
      },
      {
        id: 'experience-03',
        question: 'What does election day verification look like?',
        answer:
          'You tap your phone or secure card at the polls. A quick liveness check confirms you are present (biometric scan or PIN entry). The system runs a zero-knowledge proof in the background. The poll worker sees a green light within seconds. Total target: <strong>under 60 seconds</strong>.',
        status: 'answered',
      },
      {
        id: 'experience-04',
        question: 'What if I lose my phone or card before election day?',
        answer:
          'Recovery is available at designated enrollment offices using <strong>Shamir secret sharing</strong> — a cryptographic technique that splits your recovery key across multiple designated agents. If recovery is not completed in time, you can still vote with a <strong>provisional ballot</strong> using the existing HAVA process.',
        status: 'answered',
      },
      {
        id: 'experience-05',
        question: 'What if I get flagged at the polls?',
        answer:
          'You <strong>still cast a provisional ballot</strong>. Your case enters a tracked adjudication workflow with notice, status updates, and appeal pathways. The system defaults to provisional handling whenever data is uncertain — it never silently denies anyone the right to vote.',
        status: 'answered',
      },
      {
        id: 'experience-06',
        question: 'Do I have to use a fingerprint scanner?',
        answer:
          '<strong>No.</strong> Biometrics are optional. A non-biometric path — PIN or passphrase plus your device or card plus poll worker attestation — is always available with equal legal standing, the same wait-time targets, and the same ballot access.',
        status: 'answered',
      },
      {
        id: 'experience-07',
        question: 'How do I verify my vote was counted?',
        answer:
          'After casting, you receive a <strong>receipt</strong> containing a bulletin board hash and a VoteChain anchor. You can independently verify that your encrypted ballot appears on the public bulletin board. Tally proofs let anyone confirm the published count matches the recorded ballots — all without revealing individual votes.',
        status: 'answered',
      },
      {
        id: 'experience-08',
        question: 'What if I am homeless and have no address?',
        answer:
          'You can use a <strong>shelter address or county election office address</strong> for enrollment. Residency is not required for federal elections. Mobile enrollment units and community partner organizations provide support for voters without stable housing.',
        status: 'answered',
      },
      {
        id: 'experience-09',
        question: 'What happens in same-day registration states?',
        answer:
          'Same-day registrants cannot complete full enrollment on the spot. The proposed solution is a <strong>rapid-enrollment track</strong> (target: under 10 minutes) with reduced verification, plus a provisional ballot that is upgraded to regular once full verification completes.',
        status: 'answered',
      },
      {
        id: 'experience-10',
        question: 'Can I enroll online?',
        answer:
          'You can <strong>start the process online</strong> (pre-enrollment) and complete it in-person for the liveness-method setup step. Fully remote enrollment is not supported in version 1 because liveness verification requires a physical presence at least once.',
        status: 'answered',
      },
      {
        id: 'experience-11',
        question: 'What happens if the verification device at my polling place breaks?',
        answer:
          'The immediate switch is to the <strong>non-biometric path</strong> or a backup device. If all devices fail, provisional ballots are issued under the existing HAVA process. Incident command runbooks specify a <strong>30-minute workaround activation target</strong>.',
        status: 'open',
      },
    ],
  },

  // ── 5. Fraud Detection (11 questions, 1 open) ─────────────────────────
  {
    slug: 'fraud',
    title: 'Fraud Detection',
    icon: 'alert-triangle',
    description: 'How VoteChain catches fraud in real time and resolves false positives.',
    items: [
      {
        id: 'fraud-01',
        question: 'How does VoteChain catch someone voting twice?',
        answer:
          'Each voter generates a one-time <strong>nullifier</strong> — a cryptographic token derived from their identity and the election ID. Before any ballot is issued, the system checks the shared national ledger for that nullifier. If it already exists, the second attempt is instantly flagged and routed to a provisional ballot.',
        status: 'answered',
      },
      {
        id: 'fraud-02',
        question: 'How does VoteChain catch dead people voting?',
        answer:
          'The system subscribes to <strong>continuous death record feeds</strong> — SSA Death Master File, state vital records, and hospital/coroner reports. When a death record matches an enrolled voter, a revocation is written to the blockchain within 48 hours. Any future attempt to use that credential is flagged instantly.',
        status: 'answered',
      },
      {
        id: 'fraud-03',
        question: 'Can VoteChain detect someone voting in two different states?',
        answer:
          'Yes. Because the blockchain is <strong>shared across all states</strong>, the nullifier check is cross-jurisdictional. If someone votes in Pennsylvania at 8 AM and tries to vote in New Jersey at 2 PM, the second attempt is caught instantly with cryptographic evidence.',
        status: 'answered',
      },
      {
        id: 'fraud-04',
        question: 'What is "geographic impossibility detection"?',
        answer:
          'If the same credential is used at two polling places closer together in time than physically possible, the system flags it as a <strong>geographic impossibility</strong>. The second attempt is routed to provisional handling with preserved evidence including timestamps, locations, and device attestations.',
        status: 'answered',
      },
      {
        id: 'fraud-05',
        question: 'What kinds of fraud patterns does VoteChain watch for?',
        answer:
          'Beyond individual fraud, VoteChain monitors for organized patterns: <strong>burst registrations</strong> from a single address, a single device verifying unusually many voters, votes from closed polling places at odd hours, mass credential revocations, and statistically unusual verification pass rates at specific locations.',
        status: 'answered',
      },
      {
        id: 'fraud-06',
        question: 'What happens when a flag is raised?',
        answer:
          'Every flag has a <strong>lifecycle</strong>: detection → assignment to an oversight team → investigation → resolution with documented legal basis. The voter receives notice and can appeal. No flag permanently blacklists a voter — each has a tracked adjudication workflow.',
        status: 'answered',
      },
      {
        id: 'fraud-07',
        question: 'What about false positives? Will innocent people get flagged?',
        answer:
          'Any fraud detection system produces some false positives. The critical design choice is that <strong>every flagged voter still gets a provisional ballot</strong>. VoteChain\'s cryptographic nullifier system reduces name/DOB-collision false positives compared to current post-election cross-matching, but operational review is still required for every flag.',
        status: 'answered',
      },
      {
        id: 'fraud-08',
        question: 'How fast is fraud detection compared to the current system?',
        answer:
          'Current systems detect most fraud <strong>weeks or months after an election</strong> via audits and tip lines. VoteChain operates in two windows: cryptographic checks (nullifier conflicts, invalid signatures) in <strong>seconds</strong>, and data-feed checks (death records, judicial updates, anomaly patterns) in <strong>minutes to hours</strong>.',
        status: 'answered',
      },
      {
        id: 'fraud-09',
        question: 'Can an official secretly alter fraud flags after the fact?',
        answer:
          'No. Every fraud flag, case-state transition, and resolution is <strong>immutable on the blockchain</strong>. An official cannot delete or modify a flag without it being visible to every node operator and auditor. The evidence chain is cryptographically sealed.',
        status: 'answered',
      },
      {
        id: 'fraud-10',
        question: 'How does VoteChain detect enrollment fraud?',
        answer:
          'The system watches for fraudulent enrollment patterns: synthetic identity signals, address clustering (50+ enrollments from one address), and enrollment rate anomalies. Credential issuance requires <strong>threshold co-signing</strong> by multiple independent authorities to prevent single-point forgery.',
        status: 'answered',
      },
      {
        id: 'fraud-11',
        question: 'What is the long-term fraud detection accuracy target?',
        answer:
          'The design targets are cryptographic conflict flags in <strong>under 30 seconds</strong> and asynchronous risk flags in <strong>under 24 hours</strong>. However, actual accuracy metrics will only be measurable after real pilot elections. The false-positive rate for statistical anomaly detection is still an area requiring calibration.',
        status: 'open',
      },
    ],
  },

  // ── 6. Accessibility & Equity (11 questions, 2 open) ──────────────────
  {
    slug: 'accessibility',
    title: 'Accessibility & Equity',
    icon: 'scale',
    description: 'How VoteChain works for everyone, not just the tech-savvy.',
    items: [
      {
        id: 'access-01',
        question: 'Do I need a smartphone?',
        answer:
          '<strong>No.</strong> Free secure cards are provided at enrollment for voters without phones. These NFC-enabled cards with a secure element work just like tapping a phone. In-person assisted verification is always available.',
        status: 'answered',
      },
      {
        id: 'access-02',
        question: 'Do I need internet access?',
        answer:
          '<strong>No.</strong> Polling place devices handle all network connectivity. As a voter, you only need your card or phone — the device does everything else. You do not need a data plan, Wi-Fi access, or any internet connection of your own.',
        status: 'answered',
      },
      {
        id: 'access-03',
        question: 'Is there a fee to enroll, get a card, or replace a lost one?',
        answer:
          '<strong>No fees, ever.</strong> Enrollment is free. Secure cards are free. Device replacement is free. This is a constitutional requirement — the 24th Amendment prohibits conditioning voting on payment, and the design takes that literally.',
        status: 'answered',
      },
      {
        id: 'access-04',
        question: 'How does VoteChain serve voters with disabilities?',
        answer:
          'The design requires <strong>audio guidance, large text, and tactile card support</strong> for blind or low-vision voters, plus seated-height kiosks. Screen reader compatibility is mandatory. The non-biometric path accommodates voters who cannot use fingerprint or iris scanners due to disability.',
        status: 'answered',
      },
      {
        id: 'access-05',
        question: 'What about voters who do not speak English?',
        answer:
          'Enrollment interfaces must support all <strong>Section 203-required languages</strong> (as mandated by the Voting Rights Act), and polling devices must support the top 15 U.S. languages. Local nonprofits and multilingual volunteers provide additional assistance.',
        status: 'answered',
      },
      {
        id: 'access-06',
        question: 'How does VoteChain reach rural voters?',
        answer:
          '<strong>Mobile enrollment units</strong> (buses and vans) travel to underserved areas. Enrollment by mail is available with in-person liveness-method setup at the nearest post office. The system does not require broadband or urban infrastructure.',
        status: 'answered',
      },
      {
        id: 'access-07',
        question: 'What about elderly voters who are not comfortable with technology?',
        answer:
          '<strong>Assisted enrollment</strong> is available with trained volunteers who walk voters through each step. Election day verification can be as simple as tapping a card — no screens to navigate. Community partners provide phone help lines and "come-to-you" onboarding support.',
        status: 'answered',
      },
      {
        id: 'access-08',
        question: 'What if I am incarcerated but legally eligible to vote?',
        answer:
          'Mobile enrollment units visit correctional facilities, and state eligibility rules are enforced by smart contract. If you are eligible to vote under your state\'s laws, VoteChain provides in-facility enrollment and verification.',
        status: 'answered',
      },
      {
        id: 'access-09',
        question: 'How does VoteChain track whether it is actually equitable?',
        answer:
          'The system must track enrollment rates, wait times, failure rates, and provisional ballot rates <strong>by demographic group</strong>. If any group has an enrollment rate more than 5% below the national average, the responsible jurisdiction must publish a remediation plan within 30 days.',
        status: 'answered',
      },
      {
        id: 'access-10',
        question: 'Can the ZKP proof generation run on a cheap phone?',
        answer:
          'Zero-knowledge proof generation is computationally expensive. The design offloads the heavy computation to the <strong>polling place device</strong> — your phone or card provides the signing key, and the device computes the proof. You do not need an expensive phone.',
        status: 'open',
      },
      {
        id: 'access-11',
        question: 'How will VoteChain work with tribal nations?',
        answer:
          'Tribal IDs and governance structures are unique. The design calls for <strong>dedicated engagement with tribal governments</strong> and recognizing tribal enrollment authorities as first-class system participants. However, the specific integration model has not been defined yet and requires direct tribal consultation.',
        status: 'open',
      },
    ],
  },

  // ── 7. Cost & Funding (10 questions, 1 open) ──────────────────────────
  {
    slug: 'cost',
    title: 'Cost & Funding',
    icon: 'banknote',
    description: 'What VoteChain costs and how it compares to current election spending.',
    items: [
      {
        id: 'cost-01',
        question: 'How much would VoteChain cost?',
        answer:
          'The baseline estimate is roughly <strong>$870 million one-time</strong> and <strong>$375 million per year</strong>. More realistic "expected" scenarios, accounting for federal IT delivery risk and legacy system modernization, range from $2–2.8 billion one-time and $500–700 million per year.',
        status: 'answered',
      },
      {
        id: 'cost-02',
        question: 'How does that compare to what we already spend on elections?',
        answer:
          'One commonly cited estimate places 2020 U.S. election administration spending at roughly <strong>$4.1 billion</strong> across all jurisdictions. VoteChain\'s annual cost represents roughly 9% (baseline) to 12–22% (expected/high-risk) of that existing spend.',
        status: 'answered',
      },
      {
        id: 'cost-03',
        question: 'What is the cost per voter?',
        answer:
          'Approximately <strong>$8.30 per enrolled voter per year</strong> (assuming 150 million enrolled), or about <strong>$5.60 per verified vote</strong> (assuming 67% turnout). For context, a single contested election recount costs $3–10 million or more per state.',
        status: 'answered',
      },
      {
        id: 'cost-04',
        question: 'What is the biggest cost driver?',
        answer:
          '<strong>Staffing</strong> is the largest ongoing expense at an estimated $150 million per year — enrollment workers, oversight teams, operations staff, help desk, and election-week surge capacity. Hardware and software development are large one-time costs.',
        status: 'answered',
      },
      {
        id: 'cost-05',
        question: 'Who pays for it?',
        answer:
          'The proposed model distributes costs across <strong>federal and state budgets</strong>, similar to how election infrastructure is funded today. Federal legislation would appropriate initial funding and establish ongoing cost-sharing formulas.',
        status: 'answered',
      },
      {
        id: 'cost-06',
        question: 'Are the cost estimates reliable?',
        answer:
          'Honestly, the baseline model assumes substantial reuse of existing government infrastructure and minimal API modernization overruns. Given known federal IT delivery risk, the "expected" scenario ($2–2.8B) is more realistic. A <strong>high-risk scenario reaching $3–4 billion</strong> accounts for multi-year legacy system remediation and procurement delays.',
        status: 'answered',
      },
      {
        id: 'cost-07',
        question: 'How much does the security program cost?',
        answer:
          'The security budget is estimated at <strong>$20 million per year</strong> — covering red team exercises, bug bounty program (up to $500K per critical vulnerability), audits, and pre-election stress tests. This is described as "non-negotiable."',
        status: 'answered',
      },
      {
        id: 'cost-08',
        question: 'How much do the secure cards cost?',
        answer:
          'Approximately <strong>$3 per card</strong> including the NFC chip and secure element, with a total estimated budget of $150 million one-time and $30 million per year for replacements and new enrollments.',
        status: 'answered',
      },
      {
        id: 'cost-09',
        question: 'Does VoteChain save money anywhere?',
        answer:
          'Potentially. A system that reduces contested election outcomes by even 10% could save tens of millions in recount and legal challenge costs per cycle. Faster fraud detection may also reduce post-election litigation. However, these savings are speculative and <strong>not yet proven</strong>.',
        status: 'answered',
      },
      {
        id: 'cost-10',
        question: 'What are the biggest cost risks?',
        answer:
          'The primary risk drivers are: <strong>legacy system integration</strong> (government APIs may need major modernization), state-by-state implementation variance, hardware lifecycle replacement logistics, 24/7 support staffing, and security hardening costs that grow as the threat landscape evolves.',
        status: 'open',
      },
    ],
  },

  // ── 8. Legal & Constitutional (10 questions, 2 open) ──────────────────
  {
    slug: 'legal',
    title: 'Legal & Constitutional',
    icon: 'gavel',
    description: 'How VoteChain fits within the Constitution and existing election law.',
    items: [
      {
        id: 'legal-01',
        question: 'Is VoteChain constitutional?',
        answer:
          'The design is built around constitutional requirements: the <strong>14th Amendment</strong> (equal protection — free enrollment, accessibility mandates), <strong>15th and 19th Amendments</strong> (non-discrimination), <strong>24th Amendment</strong> (no poll tax — all services free), and <strong>26th Amendment</strong> (voting age enforced in smart contract).',
        status: 'answered',
      },
      {
        id: 'legal-02',
        question: 'Does VoteChain require new laws?',
        answer:
          'Yes. At minimum: a <strong>VoteChain Authorization Act</strong>, amendments to HAVA recognizing blockchain verification, explicit privacy protections prohibiting non-election use of data, a federal participation requirement, and a judicial eligibility data framework with due-process guarantees.',
        status: 'answered',
      },
      {
        id: 'legal-03',
        question: 'Does this violate state sovereignty over elections?',
        answer:
          'The federal mandate is limited to <strong>federal elections only</strong>, which Congress can regulate under Article I, Section 4. State and local elections can optionally adopt VoteChain through state legislation, but this is not required.',
        status: 'answered',
      },
      {
        id: 'legal-04',
        question: 'Could VoteChain be challenged as an "undue burden" on voting?',
        answer:
          'This is a recognized legal risk under <em>Burdick v. Takushi</em>. The mitigation: free and accessible enrollment, existing methods preserved as fallback, and the argument that VoteChain actually <strong>reduces</strong> burden compared to current ID requirements. Courts would weigh the burden against the state interest in election integrity.',
        status: 'answered',
      },
      {
        id: 'legal-05',
        question: 'What about biometric privacy laws like Illinois BIPA?',
        answer:
          'The architecture is designed to support BIPA-like requirements: biometrics stored <strong>only on voter-controlled media</strong>, never centrally collected. However, jurisdiction-specific legal review would be needed to confirm compliance in each state.',
        status: 'answered',
      },
      {
        id: 'legal-06',
        question: 'Can law enforcement search VoteChain records?',
        answer:
          'Linking a DID to a real person requires a <strong>court order</strong> to access the state PII vault. The proposed legislation prohibits dragnet searches and non-election use. The 4th Amendment provides additional protection against unreasonable searches.',
        status: 'answered',
      },
      {
        id: 'legal-07',
        question: 'How are the 50 different felony disenfranchisement laws handled?',
        answer:
          'Each state\'s judicial eligibility rules are codified as <strong>statute-versioned smart contract logic</strong>, evaluated against authoritative court, corrections, and restoration data feeds. When data is stale, missing, or conflicting, the system defaults to a provisional ballot with expedited adjudication — never silent denial.',
        status: 'open',
      },
      {
        id: 'legal-08',
        question: 'What legal protections exist against VoteChain data misuse?',
        answer:
          'The proposed legislation explicitly prohibits using VoteChain data for <strong>immigration enforcement, law enforcement, and commercial purposes</strong>. PII access requires court order. The oversight board has independent authority to investigate misuse.',
        status: 'answered',
      },
      {
        id: 'legal-09',
        question: 'How does HAVA compliance work?',
        answer:
          'HAVA requires that provisional ballots be available. VoteChain <strong>preserves provisional ballot handling</strong> as a fallback for any verification failure, flag, or system outage. This is a core design principle, not an afterthought.',
        status: 'answered',
      },
      {
        id: 'legal-10',
        question: 'What happens if a state refuses to implement VoteChain?',
        answer:
          'This is an open governance question. The design proposes <strong>statutory funding conditions and a federal backstop</strong> for continuity, but enforcement mechanisms for non-compliant states have not been fully defined. Emergency waiver policies need specification.',
        status: 'open',
      },
    ],
  },

  // ── 9. The Technology (Explained Simply) (12 questions, 1 open) ───────
  {
    slug: 'technology',
    title: 'The Technology (Explained Simply)',
    icon: 'cpu',
    description: 'How the cryptography and blockchain work, in plain English.',
    items: [
      {
        id: 'tech-01',
        question: 'What is a "permissioned blockchain"?',
        answer:
          'Unlike public blockchains (Bitcoin, Ethereum) where anyone can participate, a permissioned blockchain only allows <strong>authorized entities</strong> to operate nodes. In VoteChain, these are federal agencies, state election offices, independent auditors, and oversight bodies. This provides tamper-resistance without the slowness and openness of public chains.',
        status: 'answered',
      },
      {
        id: 'tech-02',
        question: 'What is a Decentralized Identifier (DID)?',
        answer:
          'A DID is like a digital passport number that you control. It is a <strong>cryptographic key pair</strong> — a public part registered on the blockchain and a private part stored on your device or card. Unlike a Social Security number, your DID cannot be used to look up your name, address, or any personal information.',
        status: 'answered',
      },
      {
        id: 'tech-03',
        question: 'What is a nullifier?',
        answer:
          'A nullifier is a <strong>one-time code</strong> mathematically derived from your identity and a specific election. It proves you voted without revealing who you are. Once used, it cannot be reused — so if someone tries to vote twice with the same identity, the duplicate nullifier is caught instantly.',
        status: 'answered',
      },
      {
        id: 'tech-04',
        question: 'What is a "zero-knowledge proof" in simple terms?',
        answer:
          'Imagine proving you are old enough to enter a bar <strong>without showing your ID</strong>. A zero-knowledge proof lets VoteChain confirm "this person meets all five verification requirements" without the system learning who they are, where they live, or how old they are.',
        status: 'answered',
      },
      {
        id: 'tech-05',
        question: 'What is "threshold decryption"?',
        answer:
          'Encrypted ballots can only be decrypted when a <strong>minimum number of independent trustees</strong> (called a "threshold") combine their secret keys. No single trustee — and no single government agency — can decrypt any individual ballot. This is what protects ballot secrecy.',
        status: 'answered',
      },
      {
        id: 'tech-06',
        question: 'What is an HSM?',
        answer:
          'A <strong>Hardware Security Module</strong> — a tamper-resistant physical device that stores cryptographic keys. Every VoteChain node and verification device uses one. Even if someone physically steals a server, the keys inside the HSM are protected against extraction.',
        status: 'answered',
      },
      {
        id: 'tech-07',
        question: 'How fast is VoteChain?',
        answer:
          'Target throughput is <strong>10,000+ transactions per second</strong> with block finality in under 3 seconds. For comparison, Bitcoin handles about 7 TPS and Ethereum about 30 TPS. A permissioned chain can be much faster because it does not need energy-intensive mining.',
        status: 'answered',
      },
      {
        id: 'tech-08',
        question: 'What is a "Merkle log" or "bulletin board"?',
        answer:
          'A Merkle log is an <strong>append-only public ledger</strong> where new entries can be added but nothing can be deleted or changed. It is structured as a tree of hashes so that anyone can efficiently verify that a specific entry exists. The bulletin board is where encrypted ballots are published for independent verification.',
        status: 'answered',
      },
      {
        id: 'tech-09',
        question: 'What does "consensus" mean in this context?',
        answer:
          'Consensus is the process by which the 74 nodes <strong>agree on what gets written to the blockchain</strong>. VoteChain uses a Byzantine Fault Tolerant (BFT) consensus that requires 3 of 4 node categories to approve, with at least one independent category always in the mix. This means no single faction can control what gets recorded.',
        status: 'answered',
      },
      {
        id: 'tech-10',
        question: 'What blockchain framework would VoteChain use?',
        answer:
          'The recommendation is <strong>Hyperledger Fabric</strong> or a similar permissioned framework. Hyperledger Fabric is production-proven in supply chain, finance, and healthcare. However, the specific framework selection is an open question — a competitive 90-day evaluation of top candidates is proposed.',
        status: 'answered',
      },
      {
        id: 'tech-11',
        question: 'Which ZKP system would be used?',
        answer:
          'The candidates are <strong>Groth16, PLONK, and STARKs</strong>, each with different tradeoffs for proof size, generation time, and setup requirements. The specific choice is an open question requiring benchmark testing under realistic election-day load simulations.',
        status: 'open',
      },
      {
        id: 'tech-12',
        question: 'What is "post-quantum cryptography"?',
        answer:
          'Current encryption could theoretically be broken by future quantum computers. Post-quantum cryptography uses mathematical problems that are believed to be hard even for quantum computers. VoteChain specifies <strong>NIST PQC standards</strong> (published 2024) for new keys, with a migration plan for existing keys.',
        status: 'answered',
      },
    ],
  },

  // ── 10. Coercion & Vote Buying (10 questions, 2 open) ─────────────────
  {
    slug: 'coercion',
    title: 'Coercion & Vote Buying',
    icon: 'shield-off',
    description: 'Can someone force you to vote a certain way or sell your vote?',
    items: [
      {
        id: 'coercion-01',
        question: 'Can someone force me to vote a certain way?',
        answer:
          'At a <strong>polling place (Mode 1)</strong>, coercion resistance works the same as today — privacy booths, poll worker oversight, and controlled access. The EWP does not change this; it adds cryptographic verification after the ballot is cast. The hard problem is remote voting.',
        status: 'answered',
      },
      {
        id: 'coercion-02',
        question: 'What about coercion in remote voting?',
        answer:
          'Unsupervised remote voting (Mode 3) is where coercion becomes a <strong>protocol-level concern</strong> — the voter is at home or work, possibly under observation. No protocol can fully solve this. VoteChain defines mitigations, not magic. Mode 3 is gated and cannot deploy until coercion controls are independently validated.',
        status: 'answered',
      },
      {
        id: 'coercion-03',
        question: 'What is "revoting" and how does it help?',
        answer:
          'If enabled, voters can <strong>cast multiple times</strong>, with only the last valid cast before polls close being counted. If someone forces you to vote under observation, you can later re-cast privately. This reduces coercion but does not eliminate it — a coercer could monitor you until polls close.',
        status: 'answered',
      },
      {
        id: 'coercion-04',
        question: 'Can I go to a polling place to override a remote vote?',
        answer:
          'Yes. An <strong>in-person override</strong> allows a verified in-person ballot to replace any remote cast, with an on-chain audit trail. This provides a guaranteed escape path for coerced voters — even if someone forced your remote vote, you can nullify it in person.',
        status: 'answered',
      },
      {
        id: 'coercion-05',
        question: 'Can I prove to someone how I voted?',
        answer:
          '<strong>No.</strong> The receipt only proves your encrypted ballot was included on the bulletin board — it does not reveal your selections. Even if you share your receipt with a coercer, they cannot determine how you voted. This "receipt-freeness" is a fundamental design invariant across all deployment modes.',
        status: 'answered',
      },
      {
        id: 'coercion-06',
        question: 'Could someone buy votes through VoteChain?',
        answer:
          'Vote buying requires the buyer to verify how you voted. VoteChain makes this structurally difficult: receipts do not reveal selections, threshold decryption prevents individual ballot decryption, and revoting allows you to change your vote after being "paid." However, <strong>no system can completely prevent all forms of vote buying</strong>.',
        status: 'answered',
      },
      {
        id: 'coercion-07',
        question: 'Is remote voting actually safe enough to deploy?',
        answer:
          'Not yet. Mode 3 (unsupervised remote) has <strong>seven hard gate criteria</strong> that must all be independently cleared before deployment — including coercion mitigation, network privacy, client integrity, phishing defense, and equity parity. None have been cleared. Modes 1 (polling place) and 2 (supervised) deploy first.',
        status: 'answered',
      },
      {
        id: 'coercion-08',
        question: 'What stops someone from selling their credential?',
        answer:
          'The credential requires <strong>liveness verification</strong> — biometric or multi-factor authentication — at the point of voting. Selling your credential is like selling a key that requires your fingerprint to use. However, in a remote voting scenario, this protection is weaker because the seller could authenticate remotely.',
        status: 'open',
      },
      {
        id: 'coercion-09',
        question: 'How does VoteChain handle domestic abuse situations?',
        answer:
          'In-person voting (Mode 1) provides the same physical separation from an abuser as today\'s polling places. The <strong>in-person override</strong> allows a coerced voter to nullify a forced remote vote. However, domestic coercion in remote voting environments remains a fundamentally difficult problem that technology alone cannot fully solve.',
        status: 'open',
      },
      {
        id: 'coercion-10',
        question: 'Why not just skip remote voting entirely?',
        answer:
          'That is a legitimate position. VoteChain\'s Mode 1 (polling place) and Mode 2 (supervised) are designed to work <strong>without Mode 3</strong>. Remote voting is gated specifically because the design acknowledges it may never be safe enough. Modes 1 and 2 do not wait for Mode 3.',
        status: 'answered',
      },
    ],
  },

  // ── 11. Overseas & Military Voters (8 questions, 1 open) ──────────────
  {
    slug: 'overseas',
    title: 'Overseas & Military Voters',
    icon: 'plane',
    description: 'How VoteChain serves UOCAVA voters deployed around the world.',
    items: [
      {
        id: 'overseas-01',
        question: 'Can military members stationed overseas use VoteChain?',
        answer:
          'Yes. VoteChain explicitly supports <strong>UOCAVA voters</strong> (active-duty uniformed services, eligible family members, and U.S. citizens overseas). Enrollment happens at embassies, consulates, and military installations with supervised liveness-method setup.',
        status: 'answered',
      },
      {
        id: 'overseas-02',
        question: 'How does overseas enrollment work?',
        answer:
          'UOCAVA-compliant enrollment is available at <strong>consulates, embassies, and military bases</strong>. The liveness method is set up in-person at the facility. The system then integrates with existing absentee ballot request and return processes rather than replacing them.',
        status: 'answered',
      },
      {
        id: 'overseas-03',
        question: 'What about submarines or deployed ships with no internet?',
        answer:
          'Mode 2 (supervised remote) supports <strong>satellite or delayed-sync</strong> for deployed and shipboard environments. Verification can queue locally on supervised devices and sync when connectivity is available, with post-sync reconciliation.',
        status: 'answered',
      },
      {
        id: 'overseas-04',
        question: 'What if my verification status is uncertain at ballot return deadline?',
        answer:
          'VoteChain verification status must <strong>never suppress a lawful UOCAVA ballot request</strong>. If verification is uncertain, the ballot is routed to provisional adjudication with priority review and a deadline-aware triage queue tied to the state\'s specific FWAB/ballot return deadline.',
        status: 'answered',
      },
      {
        id: 'overseas-05',
        question: 'Can I recover a lost credential from overseas?',
        answer:
          'Yes. Recovery channels include embassy and consular support, military command assistance, and a proposed <strong>24/7 global voter support</strong> operation. The recovery process uses the same Shamir secret sharing mechanism, with identity re-verification at the facility.',
        status: 'answered',
      },
      {
        id: 'overseas-06',
        question: 'Are overseas voters second-class citizens in VoteChain?',
        answer:
          'The design explicitly requires <strong>parity</strong>. UOCAVA voters get dedicated enrollment paths, supervised voting environments (Mode 2), recovery support, and deadline-aware adjudication. The myth-vs-fact table directly rebuts the claim that overseas voters are an afterthought.',
        status: 'answered',
      },
      {
        id: 'overseas-07',
        question: 'How are absentee ballot deadlines harmonized across states?',
        answer:
          'Each state has different UOCAVA ballot return deadlines. The system proposes building a <strong>state-by-state deadline matrix</strong> with machine-readable cutoff rules and deadline-aware triage queues. However, the specific harmonization model is still an open question.',
        status: 'open',
      },
      {
        id: 'overseas-08',
        question: 'What time zone support exists for overseas voters?',
        answer:
          'The proposed 24/7 global voter support operation would staff help channels across time zones and languages. Election-week staffing multipliers ensure coverage during peak periods. The minimum staffing model is still being defined.',
        status: 'answered',
      },
    ],
  },

  // ── 12. Deployment & Timeline (8 questions, 1 open) ───────────────────
  {
    slug: 'deployment',
    title: 'Deployment & Timeline',
    icon: 'trending-up',
    description: 'When and how VoteChain would be rolled out.',
    items: [
      {
        id: 'deploy-01',
        question: 'How long would it take to build VoteChain?',
        answer:
          'The design separates rapid validation from production readiness. A <strong>proof of concept</strong> could be built in 1–6 months. Production hardening takes 6–24 months. Live pilots in 3–5 jurisdictions would run from months 24–36. Full federal rollout targets months 36–60.',
        status: 'answered',
      },
      {
        id: 'deploy-02',
        question: 'What has to happen before a single voter uses VoteChain?',
        answer:
          'Congressional authorization, standards body creation (NIST/EAC/CISA), privacy impact assessment, procurement, a full POC with mock election, production hardening with repeated security testing, and independent readiness assessment. This is <strong>years of work</strong> before live pilots.',
        status: 'answered',
      },
      {
        id: 'deploy-03',
        question: 'When would the first real election use VoteChain?',
        answer:
          'The timeline targets a first federal election with VoteChain verification at <strong>months 56–60</strong> (roughly 5 years from authorization). This is aggressive — federal IT projects frequently exceed timelines. The design acknowledges this and separates rapid POC from the harder production phases.',
        status: 'answered',
      },
      {
        id: 'deploy-04',
        question: 'Would it be deployed everywhere at once?',
        answer:
          'No. Deployment is <strong>phased, state by state</strong>. After pilot elections in 3–5 diverse jurisdictions, states onboard incrementally from months 36–52. The national enrollment target is 80% by months 44–56. Fallback to existing methods continues during transition.',
        status: 'answered',
      },
      {
        id: 'deploy-05',
        question: 'What is the enrollment target?',
        answer:
          'The Phase 2 pilot targets <strong>50%+ enrollment</strong> in pilot areas. The Phase 3 national target is <strong>80% enrollment</strong>. Expansion is supported by free enrollment, mobile units, community partner organizations, and voter education campaigns.',
        status: 'answered',
      },
      {
        id: 'deploy-06',
        question: 'What happens if the POC fails?',
        answer:
          'The Phase 1 POC ends with a public <strong>exit report</strong> documenting measured limits, risks, and go/no-go criteria for hardening. If results do not meet targets, the program publishes transparent findings and either remediates or halts. This is designed to be an honest evaluation, not a rubber stamp.',
        status: 'answered',
      },
      {
        id: 'deploy-07',
        question: 'Can states opt out?',
        answer:
          'For federal elections, the design proposes a <strong>federal participation requirement</strong>. For state and local elections, adoption remains entirely optional — a state legislative choice. Enforcement mechanisms for non-compliant states are still an open governance question.',
        status: 'answered',
      },
      {
        id: 'deploy-08',
        question: 'Is this timeline realistic?',
        answer:
          'Honestly, <strong>it is aggressive</strong>. Federal IT projects regularly exceed timelines and budgets. The design tries to mitigate this by separating the rapid POC (months) from production hardening (years), but political dynamics, procurement delays, and legacy system integration are real risks.',
        status: 'open',
      },
    ],
  },

  // ── 13. Open Questions & Honest Gaps (15 questions, 15 open) ──────────
  {
    slug: 'open-questions',
    title: 'Open Questions & Honest Gaps',
    icon: 'lightbulb',
    description: 'Things VoteChain does not yet have answers for. Listed honestly.',
    items: [
      {
        id: 'open-01',
        question: 'Which specific blockchain framework should VoteChain use?',
        answer:
          'Hyperledger Fabric is recommended, but Hyperledger Besu and custom solutions are candidates. The proposal calls for a <strong>competitive 90-day evaluation</strong> with proof-of-concept from the top 3 candidates. The choice affects throughput, consensus mechanics, and long-term maintainability.',
        status: 'open',
      },
      {
        id: 'open-02',
        question: 'Which zero-knowledge proof system performs best at election scale?',
        answer:
          'Groth16, PLONK, and STARKs each have different tradeoffs for proof size, generation time, and trusted setup requirements. <strong>Real benchmarks under election-day load</strong> are needed before a decision. This is not a theoretical question — it affects whether verification takes 5 seconds or 60.',
        status: 'open',
      },
      {
        id: 'open-03',
        question: 'Can 50 different judicial eligibility regimes be codified in smart contracts?',
        answer:
          'Each state has unique rules about felony disenfranchisement, restoration, pardons, and election-crime disqualifiers. The proposal suggests working with <strong>NCSL and state courts</strong> to create an open-source, statute-versioned rules library. This is a legal and political challenge as much as a technical one.',
        status: 'open',
      },
      {
        id: 'open-04',
        question: 'What happens if a state misses its implementation deadline?',
        answer:
          'The enforcement mechanism is undefined. Options include <strong>statutory funding conditions, waiver policies for emergencies, and federal backstop operations</strong>. But the political reality of forcing non-cooperative states to comply is not something a technical design can solve.',
        status: 'open',
      },
      {
        id: 'open-05',
        question: 'Can same-day registrants enroll fast enough?',
        answer:
          'Full enrollment is designed to take under 30 minutes. Same-day registrants need it in under 10. The proposed <strong>rapid-enrollment track</strong> reduces verification and issues a provisional ballot, but this path has not been tested with real users in real conditions.',
        status: 'open',
      },
      {
        id: 'open-06',
        question: 'Can a $50 phone generate zero-knowledge proofs?',
        answer:
          'Probably not fast enough. The design offloads computation to the <strong>polling place device</strong>, but this solution has not been validated. Proof generation is computationally expensive and could create bottlenecks on election day if polling-place hardware is insufficient.',
        status: 'open',
      },
      {
        id: 'open-07',
        question: 'How should smart contract updates be governed?',
        answer:
          'The proposal requires <strong>multi-party approval</strong> (federal + state majority + auditor sign-off) with 30-day public comment for non-emergency changes. But the precise governance model — how to handle bug fixes, emergency patches, and rule changes — needs detailed specification.',
        status: 'open',
      },
      {
        id: 'open-08',
        question: 'How are naturalized citizens with incomplete USCIS records handled?',
        answer:
          'Legacy records from before digitization are inconsistent. The proposed path is <strong>sworn affidavit plus 3 supporting documents plus manual review</strong>, but this creates a slower, more burdensome path for a specific demographic — which raises equity concerns.',
        status: 'open',
      },
      {
        id: 'open-09',
        question: 'How do you keep the oversight board independent long-term?',
        answer:
          'The proposal includes staggered terms, supermajority removal requirements, and an inspector general with independent authority. But <strong>no institutional design is immune to political capture</strong> over decades. This is a governance challenge, not a technology problem.',
        status: 'open',
      },
      {
        id: 'open-10',
        question: 'How does VoteChain integrate with tribal nations?',
        answer:
          'Tribal IDs and governance structures are unique. The design calls for <strong>dedicated engagement with tribal governments</strong> and treating tribal enrollment authorities as first-class participants. But no specific integration model has been proposed — this requires direct tribal consultation.',
        status: 'open',
      },
      {
        id: 'open-11',
        question: 'Is coercion resistance actually achievable for remote voting?',
        answer:
          'Maybe not fully. Revoting and in-person override reduce coercion but do not eliminate it. The EWP itself states that <strong>"no protocol can fully solve this"</strong> for uncontrolled environments. Mode 3 has seven hard gate criteria, and coercion mitigation effectiveness is one of them.',
        status: 'open',
      },
      {
        id: 'open-12',
        question: 'Can federal data sources (SSA, USCIS) actually meet reliability targets?',
        answer:
          'This is a major integration risk. VoteChain depends on government APIs that may need <strong>significant modernization</strong> to meet uptime and latency targets. A formal API readiness audit is proposed but has not been conducted. The high-risk budget scenario accounts for this.',
        status: 'open',
      },
      {
        id: 'open-13',
        question: 'What is the acceptable trustee threshold for ballot decryption?',
        answer:
          'The threshold "t" and total "n" for trustee key holders affect both <strong>security</strong> (collusion resistance) and <strong>operational complexity</strong> (key ceremony logistics, availability during tally). The right numbers depend on the governance model for federal vs. state elections.',
        status: 'open',
      },
      {
        id: 'open-14',
        question: 'What conformance tests are needed for independent implementations?',
        answer:
          'Without a published <strong>conformance suite and test vectors</strong>, interoperability between different implementations is aspirational. This must be resolved before any multi-vendor deployment — otherwise each vendor\'s system may produce incompatible results.',
        status: 'open',
      },
      {
        id: 'open-15',
        question: 'What minimum staffing model supports 24/7 global voter operations?',
        answer:
          'VoteChain needs help desk coverage across <strong>all time zones</strong> and major languages, with surge capacity during elections. The baseline staffing model, partner surge contracts, and election-week multipliers have not been specified. This directly affects the cost model.',
        status: 'open',
      },
    ],
  },

  // ── 14. Comparison to Alternatives (8 questions, 1 open) ──────────────
  {
    slug: 'alternatives',
    title: 'Comparison to Alternatives',
    icon: 'git-branch',
    description: 'How VoteChain compares to paper IDs, centralized databases, and other systems.',
    items: [
      {
        id: 'alt-01',
        question: 'How does VoteChain compare to current paper ID checks?',
        answer:
          'Paper ID checks are simple but have weaknesses: <strong>fake IDs exist</strong>, fraud detection takes weeks, poll workers see your personal information, and 50 states have 50 different rules. VoteChain aims for faster fraud detection, stronger tamper resistance, and better privacy — but at higher cost and complexity.',
        status: 'answered',
      },
      {
        id: 'alt-02',
        question: 'Why not just build a centralized national voter database?',
        answer:
          'A central database creates a <strong>single point of failure</strong>. One hack, one compromised admin, or one corrupt official could alter records for millions of voters. VoteChain distributes the ledger across 74 independent nodes — compromising the system requires corrupting a majority across multiple categories.',
        status: 'answered',
      },
      {
        id: 'alt-03',
        question: 'How does VoteChain compare on privacy?',
        answer:
          'Paper ID checks: the poll worker sees your name and photo. Centralized database: the government sees everything. VoteChain: <strong>zero-knowledge proofs</strong> mean the poll worker sees only a green or red light, and no PII exists on the blockchain. VoteChain is architecturally the strongest on privacy.',
        status: 'answered',
      },
      {
        id: 'alt-04',
        question: 'How does VoteChain compare on cost?',
        answer:
          'Paper ID checks cost roughly $1–3 per vote. A centralized database would cost about $4. VoteChain costs about <strong>$5.60 per vote</strong> — the most expensive option. The justification is that the additional cost buys tamper-resistance, real-time fraud detection, and public auditability.',
        status: 'answered',
      },
      {
        id: 'alt-05',
        question: 'What about just improving post-election audits?',
        answer:
          'Better audits are valuable but <strong>catch fraud too late</strong>. By the time a post-election audit finds issues, invalid ballots may already be counted, results may already be certified, and remedies may be limited. VoteChain detects cryptographic conflicts in seconds, not weeks.',
        status: 'answered',
      },
      {
        id: 'alt-06',
        question: 'How does VoteChain compare to the SAVE Act approach?',
        answer:
          'The SAVE Act focuses on document-based citizenship verification at voting time. VoteChain\'s approach is "verify once with multiple databases, then use cryptographic credentials." The key difference: VoteChain aims to <strong>reduce voter burden</strong> rather than increase it, while still achieving stronger verification.',
        status: 'answered',
      },
      {
        id: 'alt-07',
        question: 'Could VoteChain ideas be combined with simpler approaches?',
        answer:
          'Yes. Some VoteChain components — like the <strong>real-time duplicate detection via nullifiers</strong> or the <strong>continuous death record monitoring</strong> — could be implemented without a full blockchain. The design is modular, and partial adoption of specific ideas is possible.',
        status: 'answered',
      },
      {
        id: 'alt-08',
        question: 'What system best handles the threat of a compromised insider?',
        answer:
          'Paper ID systems rely on the poll worker\'s judgment. A centralized database can be altered by its administrator. VoteChain\'s immutable multi-party ledger means a compromised official <strong>cannot alter records</strong> without detection. However, no system is immune to insider threats at the governance level — this remains an open challenge.',
        status: 'open',
      },
    ],
  },
];
