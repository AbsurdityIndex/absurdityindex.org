export type VoteChainNavItem = {
  href: string;
  label: string;
  icon: string;
};

export type VoteChainSubpageItem = {
  href: string;
  label: string;
  description: string;
  icon: string;
};

export type VoteChainAssuranceDoc = VoteChainSubpageItem;

export const VOTECHAIN_PRIMARY_NAV: VoteChainNavItem[] = [
  { href: '/votechain', label: 'Overview', icon: 'home' },
  { href: '/votechain/architecture', label: 'Architecture', icon: 'git-branch' },
  { href: '/votechain/credential-integrity', label: 'Credential Integrity', icon: 'shield' },
  { href: '/votechain/prd', label: 'VoteChain PRD', icon: 'scroll' },
  { href: '/votechain/ewp', label: 'EWP PRD', icon: 'file-text' },
  { href: '/votechain/poc', label: 'POC', icon: 'vote' },
  { href: '/votechain/assurance', label: 'Assurance', icon: 'clipboard-list' },
];

export const VOTECHAIN_POC_MODULES: VoteChainSubpageItem[] = [
  {
    href: '/votechain/poc',
    label: 'Home',
    description: 'POC overview with links to all modules.',
    icon: 'home',
  },
  {
    href: '/votechain/poc/vote',
    label: 'Voting Client',
    description: 'Cast an encrypted ballot with credential issuance and ZK proof.',
    icon: 'vote',
  },
  {
    href: '/votechain/poc/verify',
    label: 'Verify Receipt',
    description: 'Independently verify a cast receipt with Merkle inclusion.',
    icon: 'shield',
  },
  {
    href: '/votechain/poc/lookup',
    label: 'Ballot Lookup',
    description: 'Look up a ballot by hash on the bulletin board.',
    icon: 'search',
  },
  {
    href: '/votechain/poc/dashboard',
    label: 'Dashboard',
    description: 'Oversight view of all VCL events, BB entries, fraud flags, and tally.',
    icon: 'bar-chart',
  },
  {
    href: '/votechain/poc/trust',
    label: 'Trust Portal',
    description: 'Verify every cryptographic signature and Merkle root in the election.',
    icon: 'check-circle',
  },
  {
    href: '/votechain/poc/monitor',
    label: 'Node Monitor',
    description: 'Real-time monitoring of the 3 distributed VoteChain ledger nodes.',
    icon: 'activity',
  },
];

export const VOTECHAIN_ASSURANCE_DOCS: VoteChainAssuranceDoc[] = [
  {
    href: '/votechain/assurance/attack-case-library',
    label: 'Attack Case Library',
    description: 'Public adversarial test cases (safe negative tests) with expected defenses and patch patterns.',
    icon: 'flame',
  },
  {
    href: '/votechain/assurance/threat-modeling',
    label: 'Threat Modeling',
    description: 'Turn claims into assumptions, failure modes, and a test-driven risk register.',
    icon: 'alert-triangle',
  },
  {
    href: '/votechain/assurance/ewp-conformance-testing',
    label: 'EWP Conformance Testing',
    description: 'Define a conformance surface, vectors, and invariant tests for interoperability.',
    icon: 'file-check',
  },
  {
    href: '/votechain/assurance/crypto-protocol-review',
    label: 'Crypto + Protocol Review',
    description: 'Audit-readiness checklist: bindings, privacy leakage, non-equivocation, ceremonies.',
    icon: 'shield',
  },
  {
    href: '/votechain/assurance/secure-code-review',
    label: 'Secure Code Review',
    description: 'Implementation review checklist for protocol correctness, parsing, keys, logs, privacy.',
    icon: 'git-commit',
  },
  {
    href: '/votechain/assurance/penetration-testing',
    label: 'Penetration Testing',
    description: 'Internal staging pentest plan focused on invariants, configs, and safe failure behavior.',
    icon: 'cpu',
  },
  {
    href: '/votechain/assurance/red-team-exercises',
    label: 'Red Team Exercises',
    description: 'End-to-end scenario library (technical + human + ops) with measurable outcomes.',
    icon: 'users',
  },
  {
    href: '/votechain/assurance/bug-bounty-vdp',
    label: 'VDP / Bug Bounty Readiness',
    description: 'Intake, triage, SLAs, safe harbor, and internal dry runs before going public.',
    icon: 'gift',
  },
  {
    href: '/votechain/assurance/operational-audit',
    label: 'Operational Audit',
    description: 'Keys, ceremonies, change control, incident response, and evidence handling requirements.',
    icon: 'clipboard',
  },
  {
    href: '/votechain/assurance/privacy-audit',
    label: 'Privacy Audit',
    description: 'Validate privacy claims, inventory fields, and identify correlation channels early.',
    icon: 'eye-off',
  },
  {
    href: '/votechain/assurance/usability-phishing-defense',
    label: 'Usability: Phishing Defense',
    description: 'User testing plan for gateway authenticity signals and manifest verification UX.',
    icon: 'help-circle',
  },
  {
    href: '/votechain/assurance/equity-access-testing',
    label: 'Equity and Access Testing',
    description: 'Measure failure/latency parity across cohorts; validate alternate paths are first-class.',
    icon: 'scale',
  },
  {
    href: '/votechain/assurance/monitoring-non-equivocation',
    label: 'Monitoring + Non-Equivocation',
    description: 'Monitor operations and controlled equivocation simulations with evidence capture.',
    icon: 'bar-chart',
  },
  {
    href: '/votechain/assurance/load-failover-drills',
    label: 'Load + Failover Drills',
    description: 'Stress test degraded mode, safe rate limiting, and continuity objectives under failure.',
    icon: 'trending-up',
  },
];
