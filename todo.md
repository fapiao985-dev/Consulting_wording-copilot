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

- [ ] "By Time Period" framework output is incorrect - needs iteration

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
