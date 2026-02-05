---
# REAL BILL TEMPLATE
# Copy this file and rename it to your bill ID (e.g., real-hr-xxxx.mdx)
# Required fields are marked with (REQUIRED)

# Core identification (REQUIRED)
title: "Official Bill Title"
subtitle: "Editorial subtitle for the site"
billNumber: "H.R. XXXX"  # or "S. XXX", "H.Res. XXX", "S.Res. XXX"
billType: "real"
category: "Technology"  # Match actual Congress.gov category
tags: ["tag1", "tag2", "tag3"]

# Sponsor (REQUIRED for real bills - use separate fields)
sponsor: "Rep. Firstname Lastname"
sponsorParty: "D"  # R, D, or I
sponsorState: "CA"
cosponsorCount: 0
cosponsors:
  - name: "Rep Name"
    party: R
    state: "TX"
    chamber: house
    bioguideId: "XXXXXX"
    congressUrl: "https://www.congress.gov/member/name/XXXXXX"

# Committee (REQUIRED)
committee: "House Committee on Energy and Commerce"
committees:
  - name: "House Committee on Energy and Commerce"
    chamber: house

# Status & Timeline (REQUIRED)
status: "Referred to Committee"  # Use official status
dateIntroduced: 2025-01-01
dateUpdated: 2025-01-15

# Actions from Congress.gov
actions:
  - date: 2025-01-01
    text: "Introduced in House."
    chamber: house
  - date: 2025-01-01
    text: "Referred to Committee."
    chamber: house

# Titles (REQUIRED for real bills)
officialTitle: "To do something, and for other purposes."
shortTitles:
  - title: "Short Name Act"
    type: short

# Summaries (REQUIRED)
summary: "Editorial summary for the site."
crsSummary: "Official CRS summary if available."

# Amendments
amendmentCount: 0
amendments: []

# Related bills
relatedBills:
  - billNumber: "S. XXX"
    title: "Related Bill Name"
    relationship: "Companion"
    congress: 119

# Text versions
textVersions:
  - type: "Introduced in House"
    date: 2025-01-01

# Votes (if bill reached a vote)
votes:
  yeas: 0
  nays: 0
  notVoting: 0
  passed: false
  chamber: house
  rollCallNumber: 0
  rollCallUrl: "https://clerk.house.gov/Votes/2025XXX"

# Real bill metadata (REQUIRED)
absurdityIndex: 5  # 1-10 scale
congressDotGovUrl: "https://www.congress.gov/bill/119th-congress/house-bill/XXXX"
congressNumber: 119
excerpt: "Short excerpt for listings."
featured: false

# Pork tracking
totalPork: 0
porkPerCapita: 0.00

# Bill evolution stages
billEvolution:
  - stage: introduced
    date: 2025-01-01
    paraphrasedText: "Description of the bill at introduction."
    cumulativePork: 0
    porkAddedThisStage: 0
    keyChanges:
      - "First key point"
      - "Second key point"
    porkItems:
      - description: "Description of item"
        amount: 0
        addedBy: "Rep. Name (D-ST)"
        sponsor:
          name: "Rep Name"
          party: D
          state: "ST"
          chamber: house
          bioguideId: "XXXXXX"
          congressUrl: "https://www.congress.gov/member/name/XXXXXX"
        category: new-program
        satiricalNote: "Editorial comment."
        sourceUrl: "https://www.congress.gov/bill/119th-congress/house-bill/XXXX/text"
---

## What This Bill Actually Does

Description of the bill's provisions.

## Congressional Research Service Summary

CRS summary goes here.

## Bill Details

Additional details and context.

> **Source:** This is a real bill from the 119th Congress. [View on Congress.gov](https://www.congress.gov/bill/119th-congress/house-bill/XXXX).
>
> **Disclaimer:** The absurdity score and editorial commentary above represent this site's opinion. Bill details should be verified at Congress.gov.
