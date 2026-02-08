export interface BillUnderConsideration {
  billNumber: string;
  title: string;
  sponsor: string;
  status: string;
  congress: number;
  url: string;
  description: string;
  category: string;
  absurdityIndex: number; // 1-10
}

export const billsUnderConsideration: BillUnderConsideration[] = [
  // ── Territorial Expansion ───────────────────────────────
  {
    billNumber: 'H.R. 1161',
    title: 'Red, White, and Blueland Act of 2025',
    sponsor: "Rep. Anthony D'Esposito (R-NY)",
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/1161',
    description:
      'Authorizes negotiations to purchase Greenland from Denmark and rename it "Red, White, and Blueland."',
    category: 'Territorial Expansion',
    absurdityIndex: 9,
  },
  {
    billNumber: 'H.R. 361',
    title: 'Make Greenland Great Again Act',
    sponsor: 'Rep. Andy Ogles (R-TN)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/361',
    description: 'Authorizes the President to negotiate with Denmark to acquire Greenland.',
    category: 'Territorial Expansion',
    absurdityIndex: 9,
  },
  {
    billNumber: 'H.R. 283',
    title: 'Panama Canal Repurchase Act of 2025',
    sponsor: 'Rep. Dusty Johnson (R-SD)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/283',
    description:
      'Authorizes the President to negotiate the repurchase of the Panama Canal from Panama.',
    category: 'Territorial Expansion',
    absurdityIndex: 8,
  },

  // ── Geographic Renaming ─────────────────────────────────
  {
    billNumber: 'H.R. 276',
    title: 'Gulf of America Act',
    sponsor: 'Rep. Marjorie Taylor Greene (R-GA)',
    status: 'Passed House 211-206',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/276',
    description:
      'Renames the Gulf of Mexico as the "Gulf of America" on all federal maps and documents.',
    category: 'Geographic Renaming',
    absurdityIndex: 8,
  },

  // ── Agency Abolition ────────────────────────────────────
  {
    billNumber: 'H.R. 25',
    title: 'FairTax Act of 2025',
    sponsor: 'Rep. Buddy Carter (R-GA)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/25',
    description:
      'Abolishes the IRS and replaces the entire federal tax code with a 23% national sales tax. Introduced every Congress since 1999.',
    category: 'Agency Abolition',
    absurdityIndex: 8,
  },
  {
    billNumber: 'H.R. 129',
    title: 'Abolish the ATF Act',
    sponsor: 'Rep. Lauren Boebert (R-CO)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/129',
    description: 'Abolishes the Bureau of Alcohol, Tobacco, Firearms and Explosives entirely.',
    category: 'Agency Abolition',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.R. 221',
    title: 'Abolish the ATF Act (duplicate)',
    sponsor: 'Rep. Eric Burlison (R-MO)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/221',
    description: 'A second bill to abolish the ATF, introduced in the same Congress as H.R. 129.',
    category: 'Agency Abolition',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.R. 899',
    title: 'Terminate the Department of Education',
    sponsor: 'Rep. Thomas Massie (R-KY)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/899',
    description:
      'One-sentence bill: "The Department of Education shall terminate on December 31, 2026."',
    category: 'Agency Abolition',
    absurdityIndex: 7,
  },
  {
    billNumber: 'S. 1180',
    title: 'Abolish TSA Act of 2025',
    sponsor: 'Sen. Rand Paul (R-KY)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/senate-bill/1180',
    description: 'Abolishes the Transportation Security Administration.',
    category: 'Agency Abolition',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.R. 1846',
    title: 'Federal Reserve Board Abolition Act',
    sponsor: 'Rep. Thomas Massie (R-KY)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/1846',
    description:
      'Abolishes the Federal Reserve System and repeals the Federal Reserve Act of 1913.',
    category: 'Agency Abolition',
    absurdityIndex: 8,
  },
  {
    billNumber: 'H.R. 1029',
    title: 'Abolish USAID Act',
    sponsor: 'Rep. Andy Biggs (R-AZ)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/1029',
    description: 'Abolishes the U.S. Agency for International Development.',
    category: 'Agency Abolition',
    absurdityIndex: 6,
  },

  // ── Culture War / "Woke" Legislation ────────────────────
  {
    billNumber: 'H.R. 800',
    title: 'DEI to DIE Act',
    sponsor: 'Rep. Jeff Duncan (R-SC)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/800',
    description:
      'Enacts executive order ending DEI programs in the federal government. The acronym reversal is the point.',
    category: 'Culture War',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.R. 925',
    title: 'Dismantle DEI Act of 2025',
    sponsor: 'Rep. Michael Cloud (R-TX)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/925',
    description:
      'Terminates the Office of Diversity, Equity, Inclusion, and Accessibility across the federal government.',
    category: 'Culture War',
    absurdityIndex: 5,
  },
  {
    billNumber: 'H.R. 93',
    title: 'Stop Imposing Woke Ideology Abroad Act',
    sponsor: 'Rep. Greg Steube (R-FL)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/93',
    description:
      "Prohibits funding for State Department's Special Representative for Racial Equity and Justice.",
    category: 'Culture War',
    absurdityIndex: 5,
  },
  {
    billNumber: 'H.R. 52',
    title: 'Stop Woke Investing Act',
    sponsor: 'Rep. Andy Barr (R-KY)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/52',
    description: 'Requires SEC to amend rules relating to ESG shareholder proposals.',
    category: 'Culture War',
    absurdityIndex: 5,
  },
  {
    billNumber: 'H.R. 4873',
    title: 'Preventing Woke AI in Federal Government',
    sponsor: 'Rep. Nancy Mace (R-SC)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/4873',
    description: 'Codifies Executive Order preventing "woke AI" in federal government systems.',
    category: 'Culture War',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.R. 5047',
    title: 'No Woke Indoctrination of Military Kids Act',
    sponsor: 'Rep. Jim Banks (R-IN)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/5047',
    description: 'Prohibits critical race theory and DEI at Department of Defense schools.',
    category: 'Culture War',
    absurdityIndex: 5,
  },
  {
    billNumber: 'H.R. 3406',
    title: 'Readiness Over Wokeness Act',
    sponsor: 'Rep. Matt Gaetz (R-FL)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/3406',
    description: 'Prohibits individuals with gender dysphoria from serving in the Armed Forces.',
    category: 'Culture War',
    absurdityIndex: 6,
  },
  {
    billNumber: 'H.R. 1282',
    title: 'Eliminate DEI in Colleges Act',
    sponsor: 'Rep. Burgess Owens (R-UT)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/1282',
    description:
      'Prohibits federal funding for colleges with diversity, equity, and inclusion initiatives.',
    category: 'Culture War',
    absurdityIndex: 5,
  },
  {
    billNumber: 'H.R. 461',
    title: 'Eliminate DEI in the Military Act',
    sponsor: 'Rep. Dan Crenshaw (R-TX)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/461',
    description: 'Prohibits federal funds for diversity programs in the Armed Forces.',
    category: 'Culture War',
    absurdityIndex: 5,
  },

  // ── Cryptocurrency ──────────────────────────────────────
  {
    billNumber: 'S. 954',
    title: 'BITCOIN Act of 2025',
    sponsor: 'Sen. Cynthia Lummis (R-WY)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/senate-bill/954',
    description:
      'Creates a Strategic Bitcoin Reserve and directs the Treasury to acquire 1 million Bitcoin over 5 years.',
    category: 'Cryptocurrency',
    absurdityIndex: 8,
  },
  {
    billNumber: 'H.R. 2112',
    title: 'Strategic Bitcoin Reserve Codification Act',
    sponsor: 'Rep. Nick Begich (R-AK)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/2112',
    description: 'Codifies the Strategic Bitcoin Reserve executive order into permanent law.',
    category: 'Cryptocurrency',
    absurdityIndex: 7,
  },

  // ── Foreign Policy / UN ─────────────────────────────────
  {
    billNumber: 'S. 669',
    title: 'DEFUND Act of 2025',
    sponsor: 'Sen. Mike Lee (R-UT)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/senate-bill/669',
    description:
      'Terminates U.S. membership in the United Nations and all affiliated bodies. Introduced periodically since 1997.',
    category: 'Foreign Policy',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.R. 6395',
    title: 'Relocate UN Headquarters Act',
    sponsor: 'Rep. Ronny Jackson (R-TX)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/6395',
    description:
      'Implements a strategy to move the United Nations headquarters out of the United States.',
    category: 'Foreign Policy',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.R. 54',
    title: 'WHO Withdrawal Act',
    sponsor: 'Rep. Tom Tiffany (R-WI)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/54',
    description: 'Withdraws the United States from the World Health Organization.',
    category: 'Foreign Policy',
    absurdityIndex: 6,
  },

  // ── Immigration / Border ────────────────────────────────
  {
    billNumber: 'H.R. 569',
    title: 'Birthright Citizenship Act of 2025',
    sponsor: 'Rep. Brian Babin (R-TX)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/569',
    description:
      'Limits birthright citizenship to children of citizens, permanent residents, or active military — challenging the 14th Amendment.',
    category: 'Immigration',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.R. 76',
    title: 'Fund and Complete the Border Wall Act',
    sponsor: 'Rep. Mike Rogers (R-AL)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/76',
    description: 'Establishes a 5% fee on foreign remittances to fund border wall construction.',
    category: 'Immigration',
    absurdityIndex: 6,
  },
  {
    billNumber: 'S. 293',
    title: 'WALL Act of 2025',
    sponsor: 'Sen. Ted Cruz (R-TX)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/senate-bill/293',
    description:
      'Appropriates $25 billion for border wall construction, funded by restricting tax credits.',
    category: 'Immigration',
    absurdityIndex: 6,
  },

  // ── Technology ──────────────────────────────────────────
  {
    billNumber: 'H.R. 564',
    title: 'Repeal the TikTok Ban Act',
    sponsor: 'Rep. Robert Garcia (D-CA)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/564',
    description:
      'Repeals the TikTok ban that was signed into law in 2024, just months after Congress banned it.',
    category: 'Technology',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.R. 1907',
    title: 'Defense Against Drones Act of 2025',
    sponsor: 'Rep. Jeff Duncan (R-SC)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/1907',
    description:
      'Authorizes property owners to shoot down drones over their property with shotguns.',
    category: 'Technology',
    absurdityIndex: 8,
  },
  {
    billNumber: 'H.R. 1058',
    title: 'DRONE Act of 2025',
    sponsor: 'Rep. Tim Burchett (R-TN)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/1058',
    description:
      '"Directing Resources for Officers Navigating Emergencies" — another tortured acronym for law enforcement drone policy.',
    category: 'Acronym Abuse',
    absurdityIndex: 5,
  },

  // ── Daylight Saving / Time ──────────────────────────────
  {
    billNumber: 'H.R. 139',
    title: 'Sunshine Protection Act of 2025',
    sponsor: 'Rep. Vern Buchanan (R-FL)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/139',
    description:
      'Makes daylight saving time permanent. Senate passed a version unanimously in 2022 but the House never voted on it.',
    category: 'Time Zone',
    absurdityIndex: 4,
  },
  {
    billNumber: 'H.R. 300',
    title: 'Daylight Act',
    sponsor: 'Rep. Don Beyer (D-VA)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/300',
    description:
      'Allows states to observe year-round daylight saving time — a different approach to the same decades-old problem.',
    category: 'Time Zone',
    absurdityIndex: 4,
  },

  // ── Zombie Bills / Constitutional Amendments ────────────
  {
    billNumber: 'H.J.Res. 12',
    title: 'Congressional Term Limits Amendment',
    sponsor: 'Rep. Ralph Norman (R-SC)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-joint-resolution/12',
    description:
      "Constitutional amendment limiting House to 6 terms and Senate to 2. Introduced every Congress; never passes because members won't limit themselves.",
    category: 'Constitutional',
    absurdityIndex: 5,
  },
  {
    billNumber: 'H.J.Res. 101',
    title: 'Flag Desecration Amendment',
    sponsor: 'Rep. Steve Womack (R-AR)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-joint-resolution/101',
    description:
      'Constitutional amendment to prohibit flag desecration. Introduced repeatedly since the 1990s despite Supreme Court rulings.',
    category: 'Constitutional',
    absurdityIndex: 5,
  },
  {
    billNumber: 'H.R. 1313',
    title: 'One Flag for All Act',
    sponsor: 'Rep. Jeff Duncan (R-SC)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/1313',
    description: 'Prohibits flying any flag except the U.S. flag at federal buildings.',
    category: 'Symbolic',
    absurdityIndex: 5,
  },

  // ── Acronym Abuse ───────────────────────────────────────
  {
    billNumber: 'S. 117',
    title: 'AMERICANS Act',
    sponsor: 'Sen. Ted Cruz (R-TX)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/senate-bill/117',
    description:
      '"Allowing Military Exemptions, Recognizing Individual Concerns About New Shots Act" — a tortured backronym about vaccine mandates.',
    category: 'Acronym Abuse',
    absurdityIndex: 6,
  },

  // ── Impeachment / Expungement ───────────────────────────
  {
    billNumber: 'H.Res. 24',
    title: 'Expunging First Impeachment of Donald Trump',
    sponsor: 'Rep. Elise Stefanik (R-NY)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-resolution/24',
    description:
      'Retroactively expunges the December 2019 impeachment of President Trump from the Congressional Record.',
    category: 'Impeachment',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.Res. 25',
    title: 'Expunging Second Impeachment of Donald Trump',
    sponsor: 'Rep. Elise Stefanik (R-NY)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-resolution/25',
    description:
      'Retroactively expunges the January 2021 impeachment of President Trump from the Congressional Record.',
    category: 'Impeachment',
    absurdityIndex: 7,
  },

  // ── Commemorative / Meme ────────────────────────────────
  {
    billNumber: 'S.Res. 420',
    title: 'National Concussion Awareness Day',
    sponsor: 'Sen. Richard Blumenthal (D-CT)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/senate-resolution/420',
    description:
      'Designates September 19, 2025 as "National Concussion Awareness Day." The resolution number (420) is an unintentional internet culture crossover.',
    category: 'Commemorative',
    absurdityIndex: 4,
  },
  {
    billNumber: 'S.Res. 56',
    title: 'Congratulating Vermont Green FC',
    sponsor: 'Sen. Peter Welch (D-VT)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/senate-resolution/56',
    description:
      'Senate resolution congratulating a semi-professional soccer team on winning the USL Two championship.',
    category: 'Commemorative',
    absurdityIndex: 5,
  },

  // ── Other Notable Bills ─────────────────────────────────
  {
    billNumber: 'S. 2079',
    title: 'Enhanced Penalties for Criminal Flag Burners Act',
    sponsor: 'Sen. Jim Banks (R-IN)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/senate-bill/2079',
    description:
      'Enhances criminal penalties for flag burning despite multiple Supreme Court rulings protecting it as free speech.',
    category: 'Constitutional',
    absurdityIndex: 6,
  },
  {
    billNumber: 'H.R. 79',
    title: 'Freedom from Mandates Act',
    sponsor: 'Rep. Chip Roy (R-TX)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/79',
    description:
      'Nullifies COVID-19 vaccine mandate executive orders — which already expired years ago.',
    category: 'Public Health',
    absurdityIndex: 6,
  },
  {
    billNumber: 'H.R. 5388',
    title: 'American AI Leadership and Uniformity Act',
    sponsor: 'Rep. Jay Obernolte (R-CA)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/5388',
    description:
      'Temporary moratorium preempting all state AI laws to create uniform federal regulation.',
    category: 'Technology',
    absurdityIndex: 5,
  },
  {
    billNumber: 'S. 1845',
    title: 'No Loan Forgiveness for Terrorists Act of 2025',
    sponsor: 'Sen. Bill Cassidy (R-LA)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/senate-bill/1845',
    description:
      'Prohibits student loan forgiveness for individuals designated as terrorists — solving a problem that does not exist.',
    category: 'Education',
    absurdityIndex: 7,
  },
  {
    billNumber: 'H.R. 485',
    title: 'Muhammad Ali Congressional Gold Medal Act',
    sponsor: 'Rep. John Yarmuth (D-KY)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/485',
    description:
      'Posthumously awards Congressional Gold Medal to Muhammad Ali — who already received the Presidential Medal of Freedom.',
    category: 'Commemorative',
    absurdityIndex: 3,
  },
  {
    billNumber: 'H.R. 4444',
    title: 'Student Loan Bankruptcy Improvement Act of 2025',
    sponsor: 'Rep. Hank Johnson (D-GA)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/4444',
    description:
      'Makes student loans dischargeable in bankruptcy — a reasonable idea stuck in committee purgatory since the 1970s.',
    category: 'Education',
    absurdityIndex: 4,
  },
  {
    billNumber: 'H.R. 1074',
    title: 'Supreme Court Term Limits and Regular Appointments Act',
    sponsor: 'Rep. Hank Johnson (D-GA)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/1074',
    description:
      'Establishes 18-year term limits for Supreme Court justices with regular appointments every two years.',
    category: 'Constitutional',
    absurdityIndex: 5,
  },
  {
    billNumber: 'S. 42',
    title: 'Build the Wall Act of 2025',
    sponsor: 'Sen. James Lankford (R-OK)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/senate-bill/42',
    description:
      'Creates a Southern Border Wall Construction Fund. Senate Bill number 42 — the answer to everything, apparently.',
    category: 'Immigration',
    absurdityIndex: 6,
  },
  {
    billNumber: 'H.R. 3368',
    title: 'Born in the USA Act of 2025',
    sponsor: 'Rep. Pramila Jayapal (D-WA)',
    status: 'Referred to Committee',
    congress: 119,
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/3368',
    description:
      'Prohibits federal funds to carry out the executive order restricting birthright citizenship. Named after a Bruce Springsteen song.',
    category: 'Immigration',
    absurdityIndex: 5,
  },
];

// Derived categories for filtering
export const categories = [...new Set(billsUnderConsideration.map((b) => b.category))].sort();
