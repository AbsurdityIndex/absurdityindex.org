# Absurdity Index -- Civic Organization Outreach Playbook

Last updated: 2026-02-11

This document contains email templates and customized pitch variants for reaching out to civic tech organizations, government reform groups, nonprofits, media bias reviewers, and civic engagement directories about [absurdityindex.org](https://absurdityindex.org).

---

## Table of Contents

1. [Master Email Template](#master-email-template)
2. [Key Talking Points](#key-talking-points)
3. [Civic Tech Organizations](#civic-tech-organizations)
4. [Government Reform and Watchdog Organizations](#government-reform-and-watchdog-organizations)
5. [Voter Education and Engagement](#voter-education-and-engagement)
6. [Media Bias and Fact Check](#media-bias-and-fact-check)
7. [Civic Engagement Directories](#civic-engagement-directories)

---

## Master Email Template

Use this as the baseline template. Customize the bracketed sections for each organization using the pitch variants below.

```
Subject: [CUSTOMIZED SUBJECT LINE]

Hi [NAME / Team],

I'm reaching out to introduce the Absurdity Index (absurdityindex.org) -- a non-partisan
civic engagement platform that uses satire to make federal legislation accessible and
engaging to everyday Americans.

[CUSTOMIZED OPENING -- 1-2 sentences explaining why this org specifically]

Here's what we do:

- Score real federal bills on a 1-10 Absurdity Index based on wasteful spending,
  tortured acronyms, time-vs-importance, actual-vs-stated impact, and unintended
  consequences
- Publish satirical "Not Bills" -- legislation so reasonable that no actual Congress
  would pass it -- to highlight gaps in common-sense policy
- Link every factual claim to authoritative proof sources (congress.gov,
  law.cornell.edu, clerk.house.gov roll calls)

What makes us different:

- Strictly non-partisan: we score legislation, not legislators, and target absurdity
  on both sides of the aisle
- Source-verified: every real bill links directly to Congress.gov so readers can
  verify claims themselves
- Interactive civic tools: a "Real or Satire?" quiz, a constituent cost calculator,
  a bill generator, congressional bingo, a Tinder-style bill swiper, and more
- Open data: public JSON APIs for all bills, real bills, satirical bills, individual
  bill detail, and site-wide statistics (see absurdityindex.org/llms.txt for full
  API documentation)
- Built on open web standards: Astro 5, static site generation, RSS feed, full-text
  search, and sitemap

[CUSTOMIZED ASK -- what specifically you want from this org]

I'd love to [discuss a partnership / get listed in your directory / explore
collaboration]. Happy to provide any additional information, a demo, or API access
details.

[CUSTOMIZED CLOSING]

Best,
[YOUR NAME]
Absurdity Index
https://absurdityindex.org
```

---

## Key Talking Points

Reference these when customizing pitches:

| Feature | Detail |
|---------|--------|
| **Non-partisan approach** | Scores legislation, not legislators. Targets absurdity regardless of party. Editorial scores are clearly labeled as opinion. |
| **Source verification** | Every real bill links to Congress.gov. Factual claims require authoritative proof links (congress.gov, law.cornell.edu, .gov press releases, clerk.house.gov roll calls). |
| **Interactive tools** | Quiz (real vs. satire), Bill Generator, Constituent Cost Calculator, Pork Index, Congressional Bingo, Bill Swipe (Tinder-style), Filibuster Simulator, Bill Bracket Tournament, Legislative Calendar, ASMR Bill Readings, Bill Reading Marathon. |
| **Public JSON API** | `/api/bills.json` (all, paginated), `/api/real-bills.json`, `/api/not-bills.json`, `/api/stats.json`, `/api/bills/{id}.json` (individual detail). |
| **Data formats** | RSS feed (`/feed.xml`), sitemap, LLM-readable documentation (`/llms.txt`, `/llms-full.txt`). |
| **Bill comparison** | Side-by-side views pairing real legislation with satirical alternatives at `/compare/`. |
| **Scoring methodology** | Transparent, published at `/how-we-score/`. Tiers: 1-3 "Suspiciously Reasonable," 4-6 "Pork-Adjacent," 7-8 "Hold My Gavel," 9-10 "Fish on Meth." |
| **Community participation** | Public bill submission form at `/submit/`. |
| **Under Consideration tracker** | Bills currently in committee, linked to Congress.gov, at `/under-consideration/`. |
| **Omnibus tracker** | Tracks omnibus spending bills at `/omnibus/`. |
| **Sponsor pages** | Browse real bills by congressional sponsor at `/sponsors/`. |
| **Browser extension** | Chrome/Firefox extension for Congress.gov (separate repo). |
| **VoteChain** | Open-source blueprint for cryptographic voter verification. |
| **Tech stack** | Astro 5 + MDX + Tailwind CSS v4, hosted on Cloudflare Pages. Fully static, fast, accessible. |

---

## Civic Tech Organizations

### 1. Civic Tech Field Guide

- **URL:** https://civictech.guide
- **Contact/Submission:** https://civictech.guide/submit/ (project submission form)
- **Customized Pitch Angle:** The Civic Tech Field Guide catalogs civic technology projects worldwide. Absurdity Index is a civic tech project that uses satirical framing and interactive tools to make federal legislation accessible. It fits squarely in their "Government" and "Civic Engagement" categories, and the open JSON API and RSS feed demonstrate a commitment to open data standards.
- **What to Ask For:** Directory listing as a civic technology project. Categorize under government transparency, civic engagement, and open data.
- **Customized Subject:** Submission: Absurdity Index -- Satirical Civic Tech for Legislative Transparency
- **Customized Opening:** The Civic Tech Field Guide is the most comprehensive directory of civic technology projects in the world, and we think Absurdity Index belongs in it. We've built an open-source, non-partisan platform that uses humor to pull people into reading actual federal legislation -- and backs every claim with Congress.gov proof links.
- **Customized Ask:** We'd love to be listed in the Civic Tech Field Guide. We believe we fit under government transparency and civic engagement categories. Our public APIs, RSS feed, and open approach to legislative data align with the field guide's mission of cataloging tools that strengthen civic life.
- **Customized Closing:** Thank you for maintaining such an invaluable resource for the civic tech community. We look forward to being part of it.

---

### 2. Congressional Data Coalition

- **URL:** https://congressionaldata.org
- **Contact/Submission:** https://congressionaldata.org/contact/ (contact form); also active on GitHub
- **Customized Pitch Angle:** The Congressional Data Coalition advocates for making congressional information more accessible and open. Absurdity Index consumes Congress.gov data and re-presents it in a format that non-experts can understand, complete with absurdity scoring and plain-language summaries. Our public JSON API contributes structured legislative data back to the ecosystem.
- **What to Ask For:** Coalition membership or affiliate listing. Potential collaboration on congressional data accessibility initiatives.
- **Customized Subject:** Absurdity Index: Making Congressional Data Accessible Through Satire
- **Customized Opening:** As advocates for open congressional data, you know the challenge: the data exists, but most Americans never engage with it. Absurdity Index takes real data from the Congress.gov API and transforms it into something people actually want to read -- scored, summarized, and linked back to primary sources.
- **Customized Ask:** We'd like to explore becoming a coalition member or affiliate. We also publish public JSON APIs that repackage congressional data in accessible formats, and we'd welcome feedback on how to make our data outputs more useful to the broader civic data community.
- **Customized Closing:** We share your mission of making congressional information accessible to everyone, and we'd be glad to contribute to coalition initiatives in any way we can.

---

### 3. Code for America

- **URL:** https://codeforamerica.org
- **Contact/Submission:** https://codeforamerica.org/contact/ (general contact); Brigade network for local chapters
- **Customized Pitch Angle:** Code for America focuses on using technology to improve government services and civic participation. Absurdity Index demonstrates how modern web technology (static site generation, public APIs, interactive tools) can make government more understandable. The project could serve as a case study or community resource for CfA brigades focused on legislative transparency.
- **What to Ask For:** Feature in their community resources or blog. Potential presentation at a Brigade meetup or CfA summit. Listing in their network of civic tech projects.
- **Customized Subject:** Civic Tech Project: Making Legislation Readable with Satire and Open Data
- **Customized Opening:** Code for America has shown that technology can bridge the gap between government and the people it serves. We've taken that ethos and applied it to federal legislation -- building a platform that translates dense congressional bills into plain language, scores them for absurdity, and gives citizens interactive tools to engage with the legislative process.
- **Customized Ask:** We'd love to be featured in Code for America's community resources, or present the Absurdity Index at a Brigade meetup or CfA event. We think our approach -- combining humor, open data, and modern web development -- could inspire other civic tech builders.
- **Customized Closing:** We admire the work CfA does to make government work for the people, and we'd be honored to contribute to that mission.

---

### 4. Open States / Plural Policy

- **URL:** https://open.pluralpolicy.com (formerly OpenStates.org)
- **Contact/Submission:** https://open.pluralpolicy.com/about/ (about page with contact info); GitHub: openstates
- **Customized Pitch Angle:** Open States / Plural Policy provides open data on state legislatures. While Absurdity Index focuses on federal legislation, we share the same foundational goal: making legislative data accessible. Our public API endpoints and structured bill data could complement their federal coverage, and our satirical lens demonstrates an alternative approach to civic engagement.
- **What to Ask For:** Cross-listing or resource link. Potential data collaboration on legislative accessibility tools.
- **Customized Subject:** Federal Legislation Meets Accessible Data: Absurdity Index
- **Customized Opening:** Your work making state legislative data open and accessible is something we deeply admire. We've built a complementary tool for the federal side -- Absurdity Index scores and summarizes real congressional bills, backs every claim with Congress.gov links, and exposes all data through public JSON APIs.
- **Customized Ask:** We'd be interested in being listed as a complementary federal resource on your site, and we're open to discussing how our APIs and data structures could support broader legislative accessibility efforts.
- **Customized Closing:** We believe accessible legislative data -- at every level of government -- strengthens democracy. Happy to explore how we can support each other's work.

---

### 5. GovTrack.us

- **URL:** https://www.govtrack.us
- **Contact/Submission:** https://www.govtrack.us/contact (contact form); also on GitHub (govtrack/govtrack.us)
- **Customized Pitch Angle:** GovTrack is one of the original civic tech platforms for tracking federal legislation. Absurdity Index serves a different audience -- people who would never visit GovTrack on their own -- by using humor as an entry point. We link extensively to authoritative sources, driving traffic toward primary legislative data. A partnership could introduce GovTrack to a new demographic.
- **What to Ask For:** Resource page listing or blogroll link. Mutual cross-linking where relevant (we already link to Congress.gov sources).
- **Customized Subject:** Reaching New Audiences for Legislative Tracking: Absurdity Index
- **Customized Opening:** GovTrack has been an essential tool for tracking federal legislation since 2004. We've built something intentionally different -- a satirical lens on the same legislation, designed to reach people who would never otherwise engage with congressional data. Every real bill on our site links back to authoritative sources, including GovTrack and Congress.gov.
- **Customized Ask:** We'd be grateful for a mention on your resources page or blogroll as a complementary approach to legislative engagement. We're also happy to add GovTrack links alongside our existing Congress.gov source citations if that would be useful.
- **Customized Closing:** Your two decades of making legislation accessible have paved the way for projects like ours. We'd welcome any opportunity to collaborate.

---

### 6. LegiScan

- **URL:** https://legiscan.com
- **Contact/Submission:** https://legiscan.com/about (about page with contact); API partnership inquiries via their contact form
- **Customized Pitch Angle:** LegiScan provides comprehensive legislative tracking and API services. Absurdity Index presents federal legislation through an editorial and satirical lens that drives public engagement. Our audience tends to be younger and less politically engaged -- exactly the demographic that needs to discover tools like LegiScan. Cross-promotion could benefit both platforms.
- **What to Ask For:** Partner listing or resource link. Potential API data collaboration.
- **Customized Subject:** Legislative Engagement Through Satire: Partnership Opportunity
- **Customized Opening:** LegiScan's comprehensive legislative tracking tools serve researchers, advocates, and policy professionals. Absurdity Index serves the other 300 million Americans -- the ones who don't track legislation professionally but should still understand what Congress is doing. We use humor to get them reading, and source links to get them verifying.
- **Customized Ask:** We'd like to explore a resource listing or partnership link on your site, and we're interested in discussing whether a data collaboration could help both platforms reach wider audiences.
- **Customized Closing:** Your API infrastructure is impressive, and we'd value the chance to explore how our platforms could complement each other.

---

### 7. BillTrack50

- **URL:** https://www.billtrack50.com
- **Contact/Submission:** https://www.billtrack50.com/contact (contact form)
- **Customized Pitch Angle:** BillTrack50 lets users track legislation at both federal and state levels. Absurdity Index offers an editorial overlay on federal bills that drives engagement from audiences who aren't traditional policy watchers. Our interactive tools (quiz, swipe, bingo) demonstrate creative approaches to legislative engagement that could inspire BillTrack50's own user experience.
- **What to Ask For:** Resource page listing. Blog feature or guest post opportunity on creative civic engagement.
- **Customized Subject:** Creative Legislative Engagement: Absurdity Index + BillTrack50
- **Customized Opening:** BillTrack50 makes it possible for anyone to follow legislation that matters to them. We've taken that same goal and wrapped it in humor -- because sometimes the best way to get someone to read a bill is to tell them it's absurd. And then prove it with a Congress.gov link.
- **Customized Ask:** We'd appreciate a listing on your resources page, and we'd love the opportunity to write a guest post about how interactive tools and satire can drive legislative engagement.
- **Customized Closing:** Keep up the important work of making legislation trackable for everyone.

---

### 8. Civic Tech DC

- **URL:** https://civictechdc.org (meetup group; also active on Meetup.com)
- **Contact/Submission:** https://www.meetup.com/civic-tech-dc/ (Meetup page); contact via organizers on Meetup or their Slack
- **Customized Pitch Angle:** Civic Tech DC is a local meetup group for civic technologists in the DC area. Absurdity Index would make a compelling lightning talk or project demo -- the tech stack (Astro 5, Cloudflare Workers, public APIs), the editorial approach, and the challenge of making legislation accessible through satire are all topics that resonate with civic tech builders.
- **What to Ask For:** Lightning talk or project demo slot at a meetup. Listing in their project showcase.
- **Customized Subject:** Lightning Talk Proposal: Building a Satirical Lens on Federal Legislation
- **Customized Opening:** I'd love to present Absurdity Index at a Civic Tech DC meetup. It's a non-partisan platform that scores real federal legislation on an absurdity scale, publishes satirical "Not Bills," and exposes everything through public JSON APIs -- built with Astro 5, Cloudflare Pages, and a commitment to verifiable sourcing.
- **Customized Ask:** Would there be space for a lightning talk or project demo at an upcoming meetup? I'd cover the tech stack, the editorial methodology, the public API design, and lessons learned in making federal legislation engaging through satire.
- **Customized Closing:** Civic Tech DC is exactly the kind of community we'd love to be part of. Looking forward to hearing from you.

---

## Government Reform and Watchdog Organizations

### 9. Common Cause

- **URL:** https://www.commoncause.org
- **Contact/Submission:** https://www.commoncause.org/contact-us/ (general contact); media inquiries via press page
- **Customized Pitch Angle:** Common Cause fights for government accountability and democratic reform. Absurdity Index supports these goals by making legislative activity visible and understandable to ordinary citizens. Our absurdity scoring highlights wasteful or misguided legislation in a way that's shareable and engaging -- turning transparency into something people actually talk about.
- **What to Ask For:** Resource page listing under transparency or civic engagement tools. Social media co-promotion. Newsletter mention.
- **Customized Subject:** Making Legislative Transparency Shareable: Absurdity Index
- **Customized Opening:** Common Cause has been at the forefront of government accountability for over 50 years. We share that commitment to transparency -- and we've found that humor is one of the most effective ways to get people to actually look at what Congress is doing. Every real bill on Absurdity Index links to Congress.gov, and our absurdity scores are clearly labeled as editorial opinion.
- **Customized Ask:** We'd be grateful for a listing on your resources page as a civic engagement tool, or a mention in your newsletter or social channels. We think your audience would find our interactive tools -- especially the "Real or Satire?" quiz -- both entertaining and informative.
- **Customized Closing:** Thank you for decades of fighting for accountable government. We're trying to get more people to care about it too.

---

### 10. RepresentUs

- **URL:** https://represent.us
- **Contact/Submission:** https://represent.us/contact/ (contact form); also active volunteer/chapter network
- **Customized Pitch Angle:** RepresentUs works to pass anti-corruption laws and fix broken government systems. Absurdity Index's scoring methodology highlights exactly the kind of legislative dysfunction RepresentUs fights against -- pork barrel spending, bills with no real impact, legislation that serves special interests over constituents. Our Pork Index and Omnibus Tracker align directly with anti-corruption messaging.
- **What to Ask For:** Resource listing. Co-promotion to volunteer network. Potential collaboration on anti-corruption content.
- **Customized Subject:** Exposing Legislative Absurdity: A Tool for the Anti-Corruption Movement
- **Customized Opening:** RepresentUs has built a powerful movement against political corruption. Absurdity Index gives that movement a new tool: we score real federal legislation on an absurdity scale that flags wasteful spending, ineffective policy, and the gap between what bills promise and what they deliver. Our Pork Index and Omnibus Tracker let citizens follow the money.
- **Customized Ask:** We'd love to be listed as a resource for RepresentUs volunteers and supporters. We're also interested in collaborating on content that highlights the most absurd examples of the legislative dysfunction your movement works to fix.
- **Customized Closing:** The fight against corruption needs every tool available. We hope Absurdity Index can be one of them.

---

### 11. Issue One

- **URL:** https://issueone.org
- **Contact/Submission:** https://issueone.org/contact/ (contact form); press inquiries via media page
- **Customized Pitch Angle:** Issue One brings together former members of Congress from both parties to fix broken government. Absurdity Index's non-partisan approach mirrors this bipartisan philosophy -- we score legislation, not legislators, and we target absurdity regardless of which party introduced a bill. Our data could support Issue One's research on legislative dysfunction.
- **What to Ask For:** Resource listing. Data partnership for research on legislative quality metrics.
- **Customized Subject:** Non-Partisan Legislative Scoring: Absurdity Index
- **Customized Opening:** Issue One's bipartisan approach to fixing government resonates deeply with our work. Absurdity Index takes a strictly non-partisan view of federal legislation -- scoring bills on their merits (or lack thereof), not on who introduced them. Our absurdity scores, published methodology, and public APIs provide data points on legislative quality that could support your reform advocacy.
- **Customized Ask:** We'd appreciate a listing among your recommended resources, and we're open to discussing how our legislative scoring data could support Issue One's research on government dysfunction and reform.
- **Customized Closing:** Bipartisan reform is essential, and we're committed to supporting it through transparent, non-partisan analysis.

---

### 12. Bridge Alliance

- **URL:** https://www.bridgealliance.us
- **Contact/Submission:** https://www.bridgealliance.us/contact (contact form); member organization application process
- **Customized Pitch Angle:** The Bridge Alliance is a coalition of organizations working to bridge political divides. Absurdity Index is inherently bridge-building: our satire targets legislative absurdity itself, not any party or ideology. Our interactive tools (quiz, bill generator, cost calculator) create shared experiences that transcend partisan lines. People from across the political spectrum can agree that a $47 million cheese blockchain is absurd.
- **What to Ask For:** Member organization listing. Inclusion in their coalition network.
- **Customized Subject:** Bridging Divides Through Shared Laughter at Legislative Absurdity
- **Customized Opening:** The Bridge Alliance's work connecting organizations across the political spectrum is vital. Absurdity Index contributes to that mission in an unexpected way: through humor. When people from different political backgrounds take our "Real or Satire?" quiz together, they discover they agree on more than they thought -- starting with the fact that some legislation is genuinely absurd regardless of who wrote it.
- **Customized Ask:** We'd be interested in joining the Bridge Alliance as a member organization. Our non-partisan approach, transparent methodology, and focus on legislative quality over partisan scoring align with your coalition's values.
- **Customized Closing:** Bridging divides starts with finding common ground, and shared laughter at genuine absurdity is as good a starting point as any.

---

### 13. Coalition for Integrity

- **URL:** https://www.coalitionforintegrity.org
- **Contact/Submission:** https://www.coalitionforintegrity.org/contact/ (contact form)
- **Customized Pitch Angle:** The Coalition for Integrity combats corruption and promotes integrity in government and business. Absurdity Index highlights legislative integrity failures -- bills with misleading titles, hidden riders, wasteful appropriations, and the gap between stated goals and actual outcomes. Our transparent scoring methodology and source-linked claims model the kind of integrity the coalition promotes.
- **What to Ask For:** Resource listing on their website. Newsletter mention.
- **Customized Subject:** Legislative Integrity Through Transparency and Satire
- **Customized Opening:** The Coalition for Integrity's mission to combat corruption aligns with a core function of Absurdity Index: shining a light on legislation that doesn't do what it claims. We score bills partly on the gap between their stated impact and actual outcomes, and our Pork Index tracks spending that benefits specific districts over the public interest. Every claim we make is verifiable through linked primary sources.
- **Customized Ask:** A listing on your website's resources section would help us reach audiences who care about government integrity. We'd also welcome a newsletter mention introducing our platform to your supporters.
- **Customized Closing:** Integrity in governance requires transparency, and we're committed to providing it -- with a smile.

---

### 14. Transparency International US

- **URL:** https://us.transparency.org
- **Contact/Submission:** https://us.transparency.org/contact/ (contact form); media inquiries via press page
- **Customized Pitch Angle:** Transparency International US fights corruption through advocacy, research, and public education. Absurdity Index makes legislative transparency accessible to a mass audience through satire and interactive tools. Our insistence on source-linked factual claims and our transparent scoring methodology demonstrate the kind of accountability TI advocates for.
- **What to Ask For:** Resource listing. Potential collaboration on public education about legislative transparency.
- **Customized Subject:** Making Legislative Transparency Engaging for Everyone
- **Customized Opening:** Transparency International's global fight against corruption depends on an informed public. Absurdity Index tackles a specific piece of that puzzle: making federal legislation transparent and understandable to people who don't read congressional records for a living. We source-link every factual claim to congress.gov and publish our scoring methodology openly.
- **Customized Ask:** We'd value a listing on your resources page, and we'd be interested in discussing collaboration on public education efforts around legislative transparency. Our interactive tools have proven effective at engaging audiences who don't typically follow politics.
- **Customized Closing:** Transparency is only powerful when people pay attention. We're working to make sure they do.

---

### 15. Project On Government Oversight (POGO)

- **URL:** https://www.pogo.org
- **Contact/Submission:** https://www.pogo.org/about/contact (contact page); press inquiries via media contact
- **Customized Pitch Angle:** POGO investigates waste, corruption, and abuse in the federal government. Absurdity Index's scoring criteria directly overlap with POGO's areas of concern: our absurdity scores factor in wasteful spending, time spent vs. importance, and the gap between stated goals and actual impact. Our Pork Index and Omnibus Tracker are specifically designed to surface the kinds of spending issues POGO investigates.
- **What to Ask For:** Resource listing. Mutual cross-referencing on relevant legislation. Guest blog or co-authored analysis.
- **Customized Subject:** Complementary Tools for Government Oversight: Absurdity Index
- **Customized Opening:** POGO's investigative work exposing government waste and abuse is essential. Absurdity Index amplifies that mission by making wasteful legislation visible and shareable for a mass audience. Our scoring criteria flag the same things POGO investigates -- wasteful appropriations, bills with no real impact, and the disconnect between stated and actual outcomes -- and present them in a format that spreads on social media.
- **Customized Ask:** We'd welcome a resource page listing on pogo.org, and we'd love to explore mutual cross-referencing on specific bills. When POGO publishes an investigation into a piece of legislation, we can score and summarize it for a broader audience. We'd also be interested in co-authoring analysis pieces.
- **Customized Closing:** Government oversight works best when findings reach the widest possible audience. We can help with that.

---

### 16. Citizens for Responsibility and Ethics in Washington (CREW)

- **URL:** https://www.citizensforethics.org
- **Contact/Submission:** https://www.citizensforethics.org/contact/ (contact form); press inquiries via media page
- **Customized Pitch Angle:** CREW uses legal action, research, and public advocacy to hold government officials accountable. Absurdity Index provides a complementary public-facing tool: while CREW works through legal and regulatory channels, our platform makes legislative ethics issues accessible and engaging through satirical framing. Our sponsor pages let users browse legislation by specific members of Congress, providing a citizen-friendly accountability lens.
- **What to Ask For:** Resource listing. Social media co-promotion on relevant legislation. Newsletter feature.
- **Customized Subject:** Public-Facing Legislative Accountability: Absurdity Index
- **Customized Opening:** CREW's work holding government officials accountable through legal and advocacy channels is critical. Absurdity Index works the public-facing side of that equation -- making legislative activity visible, understandable, and shareable for everyday citizens. Our sponsor pages let users browse real bills by specific members of Congress, our absurdity scores highlight legislation that deserves scrutiny, and every claim links to primary sources.
- **Customized Ask:** We'd appreciate a listing on CREW's resources page and would welcome co-promotion on social media when we score legislation that overlaps with CREW's investigations. A newsletter mention introducing Absurdity Index to your supporters would also be valuable.
- **Customized Closing:** Accountability requires both legal action and public awareness. We're working on the awareness side.

---

## Voter Education and Engagement

### 17. Rock the Vote

- **URL:** https://www.rockthevote.org
- **Contact/Submission:** https://www.rockthevote.org/about-us/contact-us/ (contact form); partnership inquiries via partnerships page
- **Customized Pitch Angle:** Rock the Vote engages young voters through pop culture and creative campaigns. Absurdity Index speaks the same language: our Tinder-style bill swiper, congressional bingo card, meme-ready absurdity scores, and "Real or Satire?" quiz are designed for the social-media-native generation that Rock the Vote reaches. We make legislation feel relevant and shareable rather than dusty and inaccessible.
- **What to Ask For:** Partnership listing. Social media co-promotion. Tool embed on Rock the Vote's platform.
- **Customized Subject:** Making Legislation Go Viral: Absurdity Index + Rock the Vote
- **Customized Opening:** Rock the Vote knows that reaching young voters means meeting them where they are -- on social media, in pop culture, through experiences that feel relevant. Absurdity Index does the same thing with federal legislation. Our Tinder-style bill swiper, congressional bingo, and shareable absurdity scores turn dense legislative text into content that young people actually engage with.
- **Customized Ask:** We'd love to explore a partnership where Rock the Vote promotes our interactive tools -- especially the "Real or Satire?" quiz and the bill swiper -- to your audience. We can also provide embeddable versions of our tools for your platform. Getting young people to read even one real bill is a win for everyone.
- **Customized Closing:** Young voters are the future. Let's make sure they understand what they're voting for.

---

### 18. Vote.org

- **URL:** https://www.vote.org
- **Contact/Submission:** https://www.vote.org/about/ (about page with contact options); partnership inquiries via their contact form
- **Customized Pitch Angle:** Vote.org simplifies voter registration and election participation. Absurdity Index addresses the "why" behind voting: understanding what legislators actually do once elected. Our platform gives voters a reason to care about legislation by making it accessible, entertaining, and verifiable. Pairing Vote.org's "how to vote" with our "what they're voting on" creates a complete civic engagement pipeline.
- **What to Ask For:** Resource listing on their site. Co-promotion during legislative sessions. Content partnership.
- **Customized Subject:** The "Why Vote" Side of Civic Engagement: Absurdity Index
- **Customized Opening:** Vote.org makes it easy for Americans to register and vote. Absurdity Index gives them a reason to care. We make federal legislation understandable and engaging through satire, interactive tools, and verifiable sourcing -- turning "I don't follow politics" into "Wait, that's a real bill?"
- **Customized Ask:** Listing Absurdity Index as a resource on Vote.org would help your users bridge the gap between registering to vote and understanding what they're voting for. We'd also love to co-promote during major legislative sessions, when public interest in Congress peaks.
- **Customized Closing:** Registration is the first step. Understanding legislation is the next. Let's connect the two.

---

### 19. Nonprofit VOTE

- **URL:** https://www.nonprofitvote.org
- **Contact/Submission:** https://www.nonprofitvote.org/contact/ (contact form)
- **Customized Pitch Angle:** Nonprofit VOTE helps nonprofits integrate voter engagement into their missions. Absurdity Index is a ready-made tool for nonprofits that want to educate their communities about federal legislation without taking partisan positions. Our non-partisan approach, source-verified content, and interactive tools make it safe and effective for nonprofits to share.
- **What to Ask For:** Resource listing in their toolkit for nonprofits. Inclusion in their voter engagement resources.
- **Customized Subject:** A Non-Partisan Legislative Tool for Nonprofit Voter Engagement
- **Customized Opening:** Nonprofit VOTE empowers nonprofits to engage voters without crossing partisan lines. Absurdity Index is designed for exactly that context: our content is strictly non-partisan, every factual claim links to primary sources, and our scoring methodology is transparent and published. Nonprofits can share our tools with confidence that they won't be perceived as partisan advocacy.
- **Customized Ask:** We'd love to be included in Nonprofit VOTE's resource toolkit as a non-partisan tool for legislative education. Our interactive tools -- especially the quiz and cost calculator -- work well for community events and educational programming.
- **Customized Closing:** Nonprofits are trusted voices in their communities. We want to give them trusted tools for civic education.

---

### 20. Democracy Works

- **URL:** https://www.democracy.works
- **Contact/Submission:** https://www.democracy.works/contact (contact form); partnership inquiries via their partnerships page
- **Customized Pitch Angle:** Democracy Works builds tools (like TurboVote) that make democratic participation easier. Absurdity Index complements their voter-facing tools by providing ongoing legislative engagement between elections. Our API and embeddable tools could integrate with Democracy Works' platforms to give voters a window into what Congress is doing right now.
- **What to Ask For:** API integration discussion. Resource listing. Technology partnership.
- **Customized Subject:** Legislative Engagement Between Elections: API Partnership Opportunity
- **Customized Opening:** Democracy Works builds infrastructure for democratic participation. Absurdity Index provides the content layer: engaging, non-partisan summaries of federal legislation backed by source links and accessible through public APIs. Together, we could give voters not just the tools to vote, but ongoing visibility into what their representatives are doing between elections.
- **Customized Ask:** We'd like to discuss API integration possibilities -- our public JSON endpoints could feed legislative content into Democracy Works' platforms, giving your users real-time engagement with congressional activity. We're also interested in a resource listing or technology partnership.
- **Customized Closing:** Democracy doesn't end on Election Day. Let's build the tools that keep citizens engaged year-round.

---

### 21. Civic Nation

- **URL:** https://www.civicnation.org
- **Contact/Submission:** https://www.civicnation.org/contact/ (contact page)
- **Customized Pitch Angle:** Civic Nation runs campaigns (including When We All Vote and It's On Us) that activate communities around civic participation. Absurdity Index's interactive tools and shareable content are designed for exactly this kind of activation. Our "Real or Satire?" quiz, congressional bingo, and bill swiper work as social media campaigns and community event activities.
- **What to Ask For:** Campaign integration. Tool promotion through their initiative networks. Partnership for civic activation events.
- **Customized Subject:** Interactive Legislative Tools for Civic Activation Campaigns
- **Customized Opening:** Civic Nation's campaign-driven approach to civic participation is powerful. Absurdity Index offers ready-made interactive tools that can plug into your campaigns: a "Real or Satire?" quiz that goes viral, congressional bingo that works at community events, a Tinder-style bill swiper that younger audiences love, and a cost calculator that makes federal spending personal.
- **Customized Ask:** We'd like to explore integrating our tools into Civic Nation campaigns. Our quiz and interactive features work as standalone social media activations, and our content is non-partisan enough to fit any civic engagement initiative. We can provide customized embeds and branding if needed.
- **Customized Closing:** Civic activation needs creative tools. We've built them and they're ready to use.

---

### 22. National Conference on Citizenship (NCoC)

- **URL:** https://ncoc.org
- **Contact/Submission:** https://ncoc.org/contact/ (contact form); program inquiries via their programs page
- **Customized Pitch Angle:** NCoC measures and promotes civic health in America. Absurdity Index contributes to civic health by making legislative knowledge accessible. Our platform's engagement data (quiz completion rates, tool usage, API consumption) could provide data points for NCoC's civic health research. Our tools themselves serve as civic health interventions.
- **What to Ask For:** Research collaboration on civic engagement metrics. Resource listing. Speaking opportunity at NCoC events.
- **Customized Subject:** Civic Health Through Legislative Literacy: Absurdity Index
- **Customized Opening:** NCoC's work measuring and strengthening civic health is foundational to American democracy. Absurdity Index contributes to that health in a specific way: legislative literacy. We've found that satire and interactive tools dramatically increase the time people spend engaging with actual federal legislation. Our approach turns passive news consumers into active, source-checking citizens.
- **Customized Ask:** We'd value a conversation about research collaboration -- our engagement data could provide useful metrics for civic health measurement. We'd also appreciate a resource listing and would welcome the opportunity to present at NCoC events on using humor as a civic engagement tool.
- **Customized Closing:** Civic health depends on informed citizens. We're working to inform them in a way that doesn't feel like homework.

---

### 23. League of Women Voters

- **URL:** https://www.lwv.org
- **Contact/Submission:** https://www.lwv.org/about-us/contact-us (contact form); local league chapters for grassroots outreach
- **Customized Pitch Angle:** The League of Women Voters has been educating and engaging voters for over a century. Absurdity Index provides a modern complement to their educational mission: interactive, web-based tools that make federal legislation accessible to digital-native audiences. Our non-partisan approach and commitment to source verification align with LWV's longstanding editorial standards.
- **What to Ask For:** Resource listing on lwv.org. Promotion through local leagues as a legislative education tool. Partnership on voter education content.
- **Customized Subject:** Modern Legislative Education Tools for the League's Mission
- **Customized Opening:** The League of Women Voters' century-long commitment to voter education and civic engagement is unmatched. Absurdity Index brings that same commitment to the digital age with interactive tools that make federal legislation accessible, engaging, and verifiable. Our non-partisan approach and insistence on source-linked claims align with the League's standards of accuracy and fairness.
- **Customized Ask:** We'd be honored to be listed as a resource on lwv.org and shared through local leagues as a tool for legislative education. Our cost calculator, quiz, and bill comparison tools work particularly well for educational events and community programming. We're happy to collaborate on voter education content that combines our platforms' strengths.
- **Customized Closing:** The League's legacy of civic education inspires our work. We hope to be a worthy complement to it.

---

## Media Bias and Fact Check

### 24. AllSides

- **URL:** https://www.allsides.com
- **Contact/Submission:** https://www.allsides.com/media-bias/media-bias-rating-methods (rating methodology page); submit for review at https://www.allsides.com/media-bias/suggest-a-source
- **Customized Pitch Angle:** AllSides rates media sources for political bias. Absurdity Index's non-partisan approach should result in a "Center" or "Lean Center" rating, which would signal credibility to users who check AllSides before engaging with a new source. Our transparent scoring methodology, published editorial policy, and source-linked claims provide the kind of evidence AllSides reviewers look for.
- **What to Ask For:** Media bias rating and source listing.
- **Customized Subject:** Submission for Media Bias Rating: Absurdity Index (absurdityindex.org)
- **Customized Opening:** I'd like to submit Absurdity Index (absurdityindex.org) for a media bias rating on AllSides. We are a satirical commentary site covering federal legislation with a strictly non-partisan approach. We score legislation on its merits, not on the party of its sponsor, and we clearly label our absurdity scores as editorial opinion while linking every factual claim to authoritative sources.
- **Customized Ask:** Please consider rating Absurdity Index on your media bias spectrum. Relevant materials for your review: our editorial policy (absurdityindex.org/about/), our scoring methodology (absurdityindex.org/how-we-score/), our full bill catalog with source links (absurdityindex.org/bills/), and our sponsor pages that demonstrate non-partisan coverage (absurdityindex.org/sponsors/).
- **Customized Closing:** We believe transparent methodology and verifiable sourcing should be the standard for all media. We welcome your evaluation.

---

### 25. Media Bias/Fact Check (MBFC)

- **URL:** https://mediabiasfactcheck.com
- **Contact/Submission:** https://mediabiasfactcheck.com/submit-a-source/ (source submission form)
- **Customized Pitch Angle:** MBFC is one of the most widely referenced media bias and factual accuracy databases. Getting a favorable rating (likely "Least Biased" / "Satire" with "High" factual reporting) would lend credibility when pitching to other organizations. Our source-linking practice and transparent editorial methodology are exactly what MBFC evaluates.
- **What to Ask For:** Source review and listing in their database.
- **Customized Subject:** Source Submission: Absurdity Index (absurdityindex.org)
- **Customized Opening:** I'd like to submit Absurdity Index (absurdityindex.org) for review and inclusion in the Media Bias/Fact Check database. We are a satirical commentary site focused on federal legislation. While our tone is satirical, our underlying factual claims about real legislation are source-verified and linked to authoritative sources (congress.gov, law.cornell.edu, clerk.house.gov).
- **Customized Ask:** Please review and list Absurdity Index in your database. For your evaluation: our content includes clearly labeled satire ("Not Bills") alongside factual analysis of real legislation ("Real Bills"), with every factual claim linked to primary sources. Our editorial policy is published at absurdityindex.org/about/ and our scoring methodology at absurdityindex.org/how-we-score/. We believe we fit the "Satire" category with high factual accuracy for our non-satirical claims.
- **Customized Closing:** We appreciate the important work MBFC does in helping the public evaluate media sources. We welcome your thorough review.

---

### 26. Ground News

- **URL:** https://ground.news
- **Contact/Submission:** https://ground.news/about (about page); contact via their support/feedback channels; source suggestions through their platform
- **Customized Pitch Angle:** Ground News helps users see how news stories are covered across the political spectrum. Absurdity Index offers a unique data point: how legislation looks when scored purely on merit rather than partisan framing. Our non-partisan absurdity scores could complement Ground News's bias detection by providing a "beyond left and right" perspective on legislation in the news.
- **What to Ask For:** Source listing in their news aggregation. Partnership discussion on legislative coverage.
- **Customized Subject:** A Non-Partisan Lens on Legislation: Absurdity Index + Ground News
- **Customized Opening:** Ground News gives readers the tools to see past partisan framing. Absurdity Index does the same thing specifically for federal legislation -- we score bills on their actual content rather than their political positioning. When a bill makes headlines, our absurdity score and plain-language summary provide a perspective that transcends the left-right framing Ground News surfaces.
- **Customized Ask:** We'd like to be included as a source in Ground News's aggregation, and we're interested in discussing how our legislative scoring data could complement your bias-detection approach. Our public APIs make integration straightforward.
- **Customized Closing:** Helping people see beyond partisan framing is a mission we share. Let's explore how we can do it together.

---

## Civic Engagement Directories

### 27. Citizen Connect

- **URL:** https://citizenconnect.us
- **Contact/Submission:** Check site for submission form or contact page; may require direct email outreach
- **Customized Pitch Angle:** Citizen Connect helps citizens find civic engagement resources and tools. Absurdity Index is a free, non-partisan tool that makes federal legislation accessible through interactive features and verifiable content. It fits naturally in a directory of civic engagement resources.
- **What to Ask For:** Directory listing as a civic engagement / legislative education tool.
- **Customized Subject:** Directory Listing Request: Absurdity Index -- Legislative Engagement Platform
- **Customized Opening:** I'd like to suggest Absurdity Index (absurdityindex.org) for inclusion in the Citizen Connect directory. We're a free, non-partisan platform that makes federal legislation accessible through plain-language summaries, interactive tools, and source-verified content. Our goal is to turn disengaged citizens into informed ones.
- **Customized Ask:** Please consider adding Absurdity Index to your directory. Key details: non-partisan, free to use, no account required, source-linked to Congress.gov, interactive tools include a legislative quiz, cost calculator, and bill comparison feature. Public API available for developers at /api/bills.json.
- **Customized Closing:** Thank you for helping citizens find the tools they need to participate in democracy.

---

### 28. Fix Democracy First

- **URL:** https://fixdemocracyfirst.org
- **Contact/Submission:** Check site for contact form; may be accessible through their main navigation or about page
- **Customized Pitch Angle:** Fix Democracy First advocates for democratic reforms. Absurdity Index contributes to the reform conversation by making the case for change through specific examples: real bills scored for absurdity, with transparent methodology and source links. Our data shows concrete examples of why reform is needed.
- **What to Ask For:** Resource listing. Link from relevant content pages.
- **Customized Subject:** Concrete Examples of Why Democracy Needs Fixing: Absurdity Index
- **Customized Opening:** Fix Democracy First makes the case for democratic reform. Absurdity Index provides the evidence: real federal legislation scored on an absurdity scale, with every claim linked to Congress.gov. When you need to show someone why reform matters, pointing them to a bill that scores a 9 out of 10 on the absurdity index -- with proof -- is more persuasive than any abstract argument.
- **Customized Ask:** We'd appreciate a resource listing on your site. Our platform provides specific, source-verified examples of legislative dysfunction that support the case for democratic reform. We think your audience would find our content both useful and motivating.
- **Customized Closing:** Democratic reform needs both advocates and evidence. We're here to provide the evidence.

---

### 29. Reform Elections Now

- **URL:** https://reformelectionsnow.org
- **Contact/Submission:** Check site for contact or submission information
- **Customized Pitch Angle:** Reform Elections Now focuses on electoral reform. Absurdity Index's non-partisan approach to legislative scoring demonstrates what issue-based (rather than party-based) analysis looks like in practice. Our platform shows citizens that legislation can be evaluated on merit, which reinforces the case for electoral reforms that prioritize substance over party loyalty.
- **What to Ask For:** Resource listing. Link from relevant content pages.
- **Customized Subject:** Issue-Based Legislative Analysis: Absurdity Index
- **Customized Opening:** Electoral reform depends on citizens evaluating legislation on merit rather than party label. Absurdity Index models that behavior: we score bills on what they actually do, not who introduced them. Our non-partisan approach, transparent methodology, and source-verified content demonstrate what issue-based political engagement looks like in practice.
- **Customized Ask:** We'd like to be listed as a resource on your site. Our approach to non-partisan legislative analysis aligns with the values electoral reform advocates promote, and our interactive tools engage citizens in the kind of issue-based thinking that reformed elections would reward.
- **Customized Closing:** Better elections require better-informed voters. We're working on the information side.

---

### 30. The Fulcrum

- **URL:** https://thefulcrum.us
- **Contact/Submission:** https://thefulcrum.us/about (about page with editorial contact); may accept op-eds or contributed content
- **Customized Pitch Angle:** The Fulcrum covers democracy reform, civic engagement, and the state of American politics. Absurdity Index is a natural fit for their editorial coverage: a non-partisan civic tech project that uses satire to drive legislative engagement. A feature story or contributed piece about our approach could resonate with The Fulcrum's audience of reform-minded readers.
- **What to Ask For:** Feature article or contributed op-ed about using satire for civic engagement. Resource listing. Regular coverage of high-scoring bills.
- **Customized Subject:** Op-Ed Pitch: How Satire Is Making Federal Legislation Go Viral
- **Customized Opening:** The Fulcrum's coverage of democracy reform and civic engagement consistently asks: how do we get more people to participate? Absurdity Index has found one answer: humor. By scoring real federal legislation on an absurdity scale and pairing it with satirical alternatives, we've built a platform that gets people reading actual bills -- and sharing them with friends. Every claim links to Congress.gov.
- **Customized Ask:** We'd love to contribute an op-ed to The Fulcrum about using satire as a civic engagement tool, drawing on our experience building Absurdity Index. We're also happy to serve as a source for future stories on legislative transparency or civic tech. And if you maintain a resources section, we'd appreciate a listing there as well.
- **Customized Closing:** The Fulcrum's readers care about fixing democracy. We think they'd be interested in a new tool that's working on it from an unexpected angle.

---

## Outreach Tracking

Use the table below to track outreach progress:

| # | Organization | Category | Date Sent | Contact Method | Response | Follow-Up | Status |
|---|-------------|----------|-----------|---------------|----------|-----------|--------|
| 1 | Civic Tech Field Guide | Civic Tech | | | | | Not Started |
| 2 | Congressional Data Coalition | Civic Tech | | | | | Not Started |
| 3 | Code for America | Civic Tech | | | | | Not Started |
| 4 | Open States / Plural Policy | Civic Tech | | | | | Not Started |
| 5 | GovTrack.us | Civic Tech | | | | | Not Started |
| 6 | LegiScan | Civic Tech | | | | | Not Started |
| 7 | BillTrack50 | Civic Tech | | | | | Not Started |
| 8 | Civic Tech DC | Civic Tech | | | | | Not Started |
| 9 | Common Cause | Reform/Watchdog | | | | | Not Started |
| 10 | RepresentUs | Reform/Watchdog | | | | | Not Started |
| 11 | Issue One | Reform/Watchdog | | | | | Not Started |
| 12 | Bridge Alliance | Reform/Watchdog | | | | | Not Started |
| 13 | Coalition for Integrity | Reform/Watchdog | | | | | Not Started |
| 14 | Transparency International US | Reform/Watchdog | | | | | Not Started |
| 15 | POGO | Reform/Watchdog | | | | | Not Started |
| 16 | CREW | Reform/Watchdog | | | | | Not Started |
| 17 | Rock the Vote | Voter Ed | | | | | Not Started |
| 18 | Vote.org | Voter Ed | | | | | Not Started |
| 19 | Nonprofit VOTE | Voter Ed | | | | | Not Started |
| 20 | Democracy Works | Voter Ed | | | | | Not Started |
| 21 | Civic Nation | Voter Ed | | | | | Not Started |
| 22 | NCoC | Voter Ed | | | | | Not Started |
| 23 | League of Women Voters | Voter Ed | | | | | Not Started |
| 24 | AllSides | Media Bias | | | | | Not Started |
| 25 | Media Bias/Fact Check | Media Bias | | | | | Not Started |
| 26 | Ground News | Media Bias | | | | | Not Started |
| 27 | Citizen Connect | Directory | | | | | Not Started |
| 28 | Fix Democracy First | Directory | | | | | Not Started |
| 29 | Reform Elections Now | Directory | | | | | Not Started |
| 30 | The Fulcrum | Directory | | | | | Not Started |

---

## Quick Reference: Key URLs to Include in All Pitches

| Resource | URL |
|----------|-----|
| Homepage | https://absurdityindex.org |
| About / Editorial Policy | https://absurdityindex.org/about/ |
| How We Score | https://absurdityindex.org/how-we-score/ |
| Real Bills | https://absurdityindex.org/bills/ |
| Not Bills (Satirical) | https://absurdityindex.org/not-bills/ |
| Bill Comparisons | https://absurdityindex.org/compare/ |
| Quiz: Real or Satire? | https://absurdityindex.org/quiz/ |
| Cost Calculator | https://absurdityindex.org/cost-calculator/ |
| Bill Generator | https://absurdityindex.org/generator/ |
| Congressional Bingo | https://absurdityindex.org/bingo/ |
| Bill Swipe | https://absurdityindex.org/swipe/ |
| Pork Index | https://absurdityindex.org/pork-index/ |
| Sponsors | https://absurdityindex.org/sponsors/ |
| Under Consideration | https://absurdityindex.org/under-consideration/ |
| Omnibus Tracker | https://absurdityindex.org/omnibus/ |
| Submit a Bill | https://absurdityindex.org/submit/ |
| RSS Feed | https://absurdityindex.org/feed.xml |
| API: All Bills | https://absurdityindex.org/api/bills.json |
| API: Real Bills | https://absurdityindex.org/api/real-bills.json |
| API: Not Bills | https://absurdityindex.org/api/not-bills.json |
| API: Stats | https://absurdityindex.org/api/stats.json |
| API: Bill Detail | https://absurdityindex.org/api/bills/{id}.json |
| LLM Documentation | https://absurdityindex.org/llms.txt |
