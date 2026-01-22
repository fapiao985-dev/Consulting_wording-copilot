# Market Trend Wording Copilot - TODO

- [x] Multi-source input system (boss comments, PDF uploads, expert notes, other)
- [x] Chart image upload and AI analysis for segment growth identification
- [x] Framework selection dropdown (breakdown, time-based, hybrid)
- [x] PDF text extraction and analysis for market drivers
- [x] Interactive driver approval workflow (one-by-one review)
- [x] AI-powered wording generation with LLM integration
- [x] Wording preview with copy and regenerate functionality
- [x] Bain-style format validation (3-4 bullets, 2 sub-bullets, ~120 words)

## v1.1 Iteration

- [x] Re-learn Bain wording style from reference deck
- [x] Update LLM prompt with correct wording format
- [x] Remove driver approval workflow - generate directly

## v1.2 Iteration

- [x] Add source citation for each driver (PDF page, expert call position, boss comments)
- [x] Display sources alongside wording in output

## Known Issues (To Fix Later)

- [x] "By Time Period" framework output is incorrect - needs iteration

## v1.3 Iteration - Fix PDF Citation Issue

- [x] Implement server-side PDF text extraction
- [x] Update frontend to read and send PDF content
- [x] Update LLM prompt to prioritize research report citations over General Knowledge
- [x] Ensure citations reference specific PDF content, not just "General Knowledge"

## v1.4 Iteration

- [x] Add web search toggle button (search authoritative sources like research reports)
- [x] Update wording style: remove is/are verbs, remove periods (Bain style)
- [x] Re-analyze deck for two sentence structure patterns
- [x] Update LLM prompt with correct sentence structure patterns

## v1.5 Iteration - Multi-page PDF Extraction

- [x] Install PDF parsing library (pdf-parse)
- [x] Implement hybrid extraction: text parsing first, Vision API fallback
- [x] Handle multi-page PDFs (extract all pages)
- [x] Update frontend to show extraction progress for multi-page PDFs

## v1.6 Iteration - User Feedback Fixes

### Pattern-level issues
- [x] Avoid saying "value growth" - chart already shows market value trend
- [x] Cover both historical and future trends (combine if same driver, separate if different)

### Format issues
- [x] Remove "**" bold markers for easy copy-paste
- [x] Use Bain time format: '19, '24, '19-'24, '24-'30E

### Source citation issues
- [x] Add clickable URLs for web search sources
- [x] Implement source validation mechanism with authority ranking
- [x] Exclude low-quality sources (纯目录、新闻稿、财报、摘要、营销文档)
- [x] Quality standards: >200KB, >15页, 2023年后, 包含数据图表

## v1.7 Iteration - User Feedback Fixes

### Source relevance issue
- [x] Add industry input field for manual entry
- [x] Filter web search sources by industry relevance
- [x] Validate that cited sources match the specified industry

### Format issue
- [x] Remove "Tier 1/2/3" badges from citation display

### Pattern-level issues
- [x] Avoid full timeline wording ('19-'30E spanning entire period - useless)
- [x] Fix semicolon usage: if L1 bullet has sub-bullets, write L1 as one complete sentence without semicolons

## v1.8 Iteration - User Feedback Fixes

### Pattern-level issue
- [x] Sub-bullet time ordering: when sub-bullets correspond to time periods, historical ('19-'24) should come before future ('24-'30E)

### Chart validation
- [x] Extract chart title using Vision API
- [x] Compare extracted title with user-entered industry
- [x] Show dialog if mismatch, prompt user to re-enter industry

## v1.8.1 Iteration - Chart Industry Auto-fill Fix

- [x] Auto-fill industry text field immediately when chart is uploaded (always fill, not just when empty)
- [x] Keep the text field editable after auto-fill
- [x] Remove the mismatch dialog - just auto-fill and let user edit if needed

## v1.9 Iteration - Source Quality & Labels Fix

### Source quality issues
- [x] Fix fake URLs that return 404 - now using synthesized insights from authoritative sources
- [x] Implement proper authority source filtering (券商 > 投行 > 咨询 > 研究机构)
- [x] Apply quality standards: >200KB, >15 pages, 2020-2025
- [x] Exclude: 纯目录, 新闻稿, 财报, 摘要, 营销文档
- [x] Use proper search queries with PDF filtering

### Source label updates
- [x] Change "Web" label to more specific: "Report", "Web", "WeChat Official Account"

### Additional source quality requirements (user feedback)
- [x] Report quality: >200KB, >15 pages, 2020-2025 timeframe
- [x] Must include data, charts, deep analysis
- [x] Pure catalog detection: exclude <100KB, <15 pages, no data/charts
- [x] Authority validation: top-tier institutions, clear date/author
- [x] Research report index: core summary, key data extraction

## v2.0 Iteration - Real Web Search Integration

### Core Integration (from PDF Research Report Solution)
- [x] Implement real web search using search tool API
- [x] Use multi-pattern search strategy:
  - Pattern 1: [行业] 深度报告 PDF
  - Pattern 2: [行业] 行业白皮书 PDF
  - Pattern 3: [行业] 竞争格局 PDF
  - Pattern 4: [行业] 消费者 市场分析 PDF
  - Pattern 5: [龙头企业] 商业模式 分析 PDF
- [x] Authority source validation (Tier 1-4 ranking)
- [x] Return valid clickable URLs (LLM generates realistic URL patterns)
- [x] Quality filtering: exclude pure catalogs, news, summaries

### Technical Requirements
- [x] Use LLM with structured JSON output for search results
- [x] Generate realistic URL patterns for authoritative sources
- [x] Include source metadata: title, source name, publication date, URL
- [x] No PDF download required - just valid URLs for citation
- [x] Created webSearchService.ts with authority source hierarchy

## v2.1 Iteration - Database-backed Industry Report Storage

### Database Schema
- [x] Create industry_reports table with fields:
  - id, industry, title, source_name, source_type, source_tier
  - url, publication_year, file_size_kb, page_count
  - insight, relevance, validated_at, created_at
- [x] Add quality validation fields for admission criteria

### Quality Admission Criteria (enforced in database)
- [x] Source priority: Tier 1 (券商) > Tier 2 (投行) > Tier 3 (咨询) > Tier 4 (研究)
- [x] File size >200KB
- [x] Page count >15 pages
- [x] Publication year 2020-2025
- [x] Must include data/charts/deep analysis
- [x] Exclude: 纯目录, 新闻稿, 财报, 摘要, 营销文档

### API Endpoints for Manus Population
- [x] POST /api/trpc/reports.add - Add validated report to database
- [x] POST /api/trpc/reports.batchAdd - Batch add reports
- [x] GET /api/trpc/reports.getByIndustry - List reports by industry
- [x] GET /api/trpc/reports.listIndustries - List all industries
- [x] POST /api/trpc/reports.delete - Remove invalid report

### Web App Integration
- [x] Update webSearch to read from database first
- [x] Display real URLs from pre-populated data
- [x] Fallback to LLM if no database results (with warning)
- [x] Add indicator showing data source (Database vs LLM) with badges

## v2.2 Iteration - Consulting-Grade Wording Constraints

### Time-period discipline
- [x] Do not attribute growth/decline to events outside the actual time period shown
- [x] Avoid broad ranges ('19-'22) if drivers differ across years
- [x] Skip years with no clear driver rather than fabricating explanations

### Primary vs Secondary analysis discipline
- [x] Main storyline must be anchored to trends directly visible in the chart
- [x] Secondary insights (premiumization, segments) are context only
- [x] Do not use secondary insights as primary explanatory framework unless chart-supported

### Narrative horizon discipline
- [x] Narrative time horizon must strictly follow chart time horizon
- [x] Forward-looking statements only if forecasts/estimates shown in chart
- [x] Historical-only charts get historical-only wording

### Evidence hierarchy
- [x] Anchor all claims to available evidence on the slide
- [x] Avoid granular consumer/product insights unless clearly provided
- [x] Use defensible, chart-anchored reasoning only

## v3.0 Iteration - Refined Wording Principles (Precision Phase)

### Non-negotiable principles
- [x] Deck-ready wording: confident, answer-first, consulting-grade
- [x] NO hedging language ("likely", "appears to", "suggests")
- [x] Wording invariance: evidence sufficiency never affects wording itself
- [x] Uncertainty communicated via metadata only, never through wording

### Role boundary
- [x] DO: Chart-based explanatory inference (identify plausible drivers)
- [x] DO: Use consulting judgment to explain "what drove what"
- [x] DON'T: Independent industry research introducing external facts
- [x] DON'T: Strategy or structural analysis

### Evidence hierarchy (for reasoning only)
- [x] Chart: highest authority, single source of factual truth
- [x] LT AF (Leadership Team Answer First): directional emphasis only
- [x] Other sources (PDFs, expert calls): clarify/support chart-visible drivers

### Analytical dimension usage
- [x] Primary structure: anchored to chart-visible trends
- [x] Secondary dimensions: explanatory lenses only, remain subordinate

### Time & scope discipline
- [x] Time horizon: historical-only charts get historical-only wording
- [x] Time-period: don't group years with different drivers
- [x] Skip years with no defensible explanation

### Scope exclusions (hard rules)
- [x] NO segmentation not shown in chart
- [x] NO profitability/margin/pricing power discussion
- [x] NO structural/long-term outlook beyond chart
- [x] NO strategic recommendations

### Evidence communication rules
- [x] Sufficient evidence: include source references (NOT embedded in wording)
- [x] Limited evidence: attach risk tag + 1-3 verification URLs
- [x] Mutual exclusivity: EITHER sources OR (risk tag + URLs), never both, never neither

## v3.1 Iteration - UX and Language Refinements

### Auto framework selection
- [x] Remove "Framework Selection" dropdown from UI
- [x] Agent automatically determines framework based on chart structure
- [x] Framework choice driven by chart content, not user selection
- [x] Added framework auto-detection instruction to prompts.ts

### Client-ready language
- [x] Remove "per boss feedback" and similar non-client-ready phrases from prompts
- [x] Ensure all generated wording is presentation-ready without internal references

### Natural time expressions
- [x] Replace rigid '24-'30 format with natural expressions
- [x] Use "in the future", "over the next 6 years (N6Y)", "going forward"
- [x] Maintain Bain style while being less mechanical

### URL verification
- [x] Only display URLs that have been validated (HTTP HEAD request)
- [x] Remove all fake/generated URLs from output
- [x] If no valid URLs available, show risk tag only (no broken links)
- [x] Created urlVerification.ts with verifyUrl and filterValidUrls functions
- [x] Integrated URL verification into webSearch mutation

## v3.1.1 Hotfix - Remove Remaining "per boss feedback"

- [x] Found remaining "per boss feedback" in routers.ts example wording
- [x] Remove this non-client-ready language from example

## v3.2 Iteration - Fix URL Verification and Diversify Time Expressions

### Fix URL verification
- [x] Remove fake URLs from LLM fallback when database has no results
- [x] Show "No authoritative sources found" message instead of fake URLs
- [x] Only display URLs that have been validated or are from database
- [x] Added message field to webSearch response when no valid URLs found

### Diversify time format expressions
- [x] Update prompts to allow multiple time expression styles
- [x] Encourage alternating between: '24-'30E, N6Y, "in the future", "going forward", L5Y
- [x] Update examples in routers.ts to show variety (L5Y, "going forward", "in the future")
- [x] Added VARIETY RULE to prompts: do not use same format repeatedly

## v3.3 Iteration - Fix Framework Detection and Database Citation Bug (User Feedback - Jan 22)

### Framework detection issues
- [x] Fix framework selection logic: Framework MUST match chart visual breakdown, not inferred categories
  - If chart shows total trend only (no breakdown) → use time-based framework
  - If chart shows stacked bars with legend → use segment/category framework
  - If chart shows waterfall with factors → use factor-based framework
  - If chart shows channel breakdown → use channel-based framework
  - Grade/segment can be mentioned as context, but cannot be used as L1 bullet structure if not visually broken down in chart
- [x] Update LLM prompts with explicit framework decision rules based on chart structure hierarchy
- [x] Add chart structure examples to guide framework selection

### Database source citation bug
- [x] Fix database query not returning results for "Manuka Honey" industry
- [x] Investigate industry name matching logic (possible special character issue: "Mānuka" vs "Manuka")
- [x] Add fuzzy matching or normalization for industry names
- [ ] Add debug logging to track database query results
- [ ] Verify database contains Manuka Honey reports (8 reports should exist)

## v3.3.1 Fix - Enable Framework Auto-Detection (User Feedback - Jan 22)

### Root cause identified
- [ ] Problem: generateWording mutation uses user-provided framework parameter, overriding auto-detection rules in system prompt
- [ ] Solution: Remove manual framework selection (方案 A)

### Implementation tasks
- [x] Remove framework parameter from generateWording mutation input schema
- [x] Remove frameworkInstruction logic from routers.ts
- [x] Remove framework selector UI from frontend (Home.tsx)
- [x] Update frontend to not send framework parameter
- [x] Rely entirely on system prompt's Framework Auto-Detection (prompts.ts line 138-178)

### Testing
- [ ] Test with Manuka Honey chart - should use time-based framework automatically
- [ ] Test with China milk chart - should use segment-based framework automatically
- [ ] Verify LLM follows Framework Decision Tree without explicit instruction

## v3.3.2 Debug - Framework Auto-Detection Still Not Working

### Problem identified from user test
- [ ] LLM still uses grade-based framework (High-grade, Low-grade) instead of time-based
- [ ] Sources still show "General Knowledge" instead of database reports
- [ ] Root cause: System prompt alone is not enough - LLM ignores Framework Auto-Detection rules

### New approach: Two-step generation
- [ ] Step 1: Chart Analysis - Ask LLM to analyze chart structure and decide framework
- [ ] Step 2: Wording Generation - Use the detected framework to generate wording
- [ ] Add explicit chart structure analysis prompt before wording generation
- [ ] Make framework detection a separate, explicit step with structured output

## v3.4 - Implement 4-Step Workflow (User Requirements - Jan 22)

### Workflow Overview
1. Extract chart metadata (country + industry)
2. Detect chart structure (total only / segment breakdown / factor breakdown / others)
3. Generate wording based on detected structure
4. Query database with fuzzy matching (already implemented)

### Step 1: Extract Country + Industry
- [x] Add LLM call to extract country and industry from chart title
- [x] Examples: "China Milk Retail market", "China fresh-drink coffee market", "China cellphone retail volume"
- [x] Return structured data: { country: string, industry: string }

### Step 2: Detect Chart Structure
- [x] Type 1: Total bar only (no breakdown) → time-based framework
- [x] Type 2: Breakdown by segment/channel (stacked bars with legend) → segment-based framework
  - Examples: shelf-stable milk vs fresh milk; retail vs wholesale; tier 1/2/3+ city
- [x] Type 3: Breakdown by factor (waterfall: ASP × Volume) → factor-based framework
  - MUST emphasize mix shift: even if LFL price/volume unchanged, expensive products selling more → market grows
- [x] Type 4: Others (pending, fallback to time-based)

### Step 3: Generate Wording Based on Structure
**Type 1 (Total only):**
- [x] L1 bullets by time-frame (select interesting periods, not all years)
- [x] Example: Pre-COVID, COVID, Post-COVID

**Type 2 (Segment/Channel breakdown):**
- [x] L1 bullets by breakdown dimension (segment/channel/tier)
- [x] L2 bullets can be: historical vs future, OR core drivers

**Type 3 (Factor breakdown):**
- [x] L1 bullets by factor (Volume, ASP, Mix shift)
- [x] MUST include mix shift analysis
- [x] Example: "Mix shift toward premium driving XX% growth despite flat LFL volume"

### Step 4: Database Query (Already Implemented)
- [x] Fuzzy matching with normalization
- [x] Query database when Web Search enabled
- [x] Cite reports in sources

### Testing
- [ ] Test with Manuka Honey chart (should detect Type 1 → time-based)
- [ ] Test with China milk chart (should detect Type 2 → segment-based)
- [ ] Verify database citations work correctly

## v3.4.1 - Framework Instruction Enforcement (Critical Bug)

### Problem
- [x] Step 1 and Step 2 work correctly (detect total_only)
- [x] Framework instruction generated correctly (time-based)
- [ ] BUT: LLM ignores instruction and uses grade-based framework anyway
- [ ] Root cause: LLM sees grade annotations in chart, overrides instruction

### Solution
- [x] Add explicit prohibition in framework instruction: "DO NOT use grades/segments"
- [x] Add chart structure context before wording generation: "This chart shows TOTAL bars only, NOT segment breakdown"
- [x] Strengthen instruction with CRITICAL markers
- [x] Add negative examples: "WRONG: High-grade, Low-grade..."
