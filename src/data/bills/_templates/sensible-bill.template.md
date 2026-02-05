---
# SENSIBLE BILL TEMPLATE
# Copy this file and rename it to your bill ID (e.g., hr-xxx.mdx)
# Required fields are marked with (REQUIRED)

# Core identification (REQUIRED)
title: "Your Bill Title Here"
subtitle: "A witty subtitle"
billNumber: "H.R. XXX"  # or "S. XXX" for Senate bills
billType: "sensible"
category: "Common Sense"  # Options: Common Sense, Education, Technology, Transportation, Food & Drink, Budget, Ethics, Government Reform
tags: ["tag1", "tag2", "tag3"]

# Sponsor (REQUIRED) - Use full name format
sponsor: "Rep. Firstname Lastname (D-ST)"
cosponsors:
  - "Rep. Cosponsor Name (R-ST)"
  - "Sen. Another Name (I-ST)"
committee: "Committee Name"

# Status (REQUIRED)
status: "Introduced"  # Options vary: Introduced, Signed Into Fantasy, Vetoed by Reality, etc.
dateIntroduced: 2025-01-01

# Votes (REQUIRED) - Use plural "votes" NOT "vote"
votes:
  yeas: 0
  nays: 0
  notVoting: 0
  passed: false

# Summary (REQUIRED)
summary: "A brief, satirical summary of what this bill does."
featured: false  # Set to true for featured bills

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
      - description: "Description of pork item"
        amount: 0
        addedBy: "Rep. Name (D-ST)"
        sponsor:
          name: "Rep Name"
          party: D
          state: "ST"
          chamber: house
        category: new-program  # Options: earmark, program-expansion, new-program, tax-expenditure, hidden-cost
        satiricalNote: "Witty comment about this spending."
---

## Section 1. Short Title

This Act may be cited as the **"Your Bill Name Act of 2025"**.

## Section 2. Main Content

Your bill content goes here in MDX format.

> **Committee Note:** Any committee notes or amendments.

---

*Amendment 1 (if applicable): Description of amendment.*
