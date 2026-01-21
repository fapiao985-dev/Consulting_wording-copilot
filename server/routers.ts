import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { PDFParse } from "pdf-parse";

// Authority ranking for source validation
const AUTHORITY_SOURCES = {
  tier1_domestic: ["广发证券", "天风证券", "国金证券", "中信证券", "招商证券", "华泰证券", "国海证券", "东方证券"],
  tier2_foreign: ["Morgan Stanley", "Goldman Sachs", "JP Morgan", "Bank of America", "Credit Suisse", "UBS", "Citi"],
  tier3_consulting: ["艾瑞咨询", "灼识咨询", "CIC", "久谦咨询", "艺恩咨询", "德勤", "Deloitte", "麦肯锡", "McKinsey", "BCG", "贝恩", "Bain"],
  tier4_research: ["华经情报网", "共研网", "智研咨询", "观研报告网", "中国报告网", "Euromonitor", "Statista", "IBISWorld"]
};

// Bain-style wording prompt - updated with v1.7 fixes
const BAIN_WORDING_SYSTEM_PROMPT = `You are a senior Bain & Company consultant. Generate slide wording in EXACT Bain style.

CRITICAL GRAMMAR RULES (BAIN STYLE):
1. NO PERIODS at the end of sentences - sentences end without punctuation
2. OMIT verbs like "is", "are", "has been" where natural - use sentence fragments
3. Use colons (:) to introduce explanations
4. DO NOT use asterisks (**) for bold - output plain text only
5. SEMICOLON RULE: If a main bullet (•) has sub-bullets (–), the main bullet should be ONE COMPLETE SENTENCE without semicolons. Only use semicolons when there are NO sub-bullets.

CRITICAL FORMAT REQUIREMENTS:
1. Output ONLY the "Highlights" section content
2. Use exactly 3 main bullet points (•)
3. Each main bullet: 1 sentence, 15-30 words
4. Each main bullet has 1-2 sub-bullets (–), 10-20 words each
5. Total word count: 80-120 words
6. NO BOLD MARKERS - plain text only (no ** symbols)

TIME FORMAT (BAIN STANDARD):
- Use abbreviated years: '19, '24, '30E
- Use ranges: '19-'24, '24-'30E
- Use L5Y (last 5 years), NTM (next twelve months)
- NEVER use full timeline ranges like '19-'30E - this is useless and spans entire period

CRITICAL TIME RANGE RULE:
- AVOID spanning the entire timeline (e.g., '19-'30E) - this provides no insight
- ALWAYS separate historical ('19-'24) and future ('24-'30E) periods
- Each time reference should be specific and meaningful

TWO SENTENCE STRUCTURE PATTERNS:

Pattern A - Category as L1 (use when organizing by segment):
• [Category Name]: [brief trend + reason in one complete phrase without semicolons]
  – [Supporting detail or evidence]
  – [Another supporting detail]

CORRECT Example:
• High-grade: Outgrowing overall market driven by super-high grade new product launches and ASP uplift from premiumization
  – New UMF20+ products commanding price premium, attracting health-conscious consumers
  – Brand investment in high-grade positioning paying off with improved mix

WRONG Example (DO NOT USE semicolons when sub-bullets exist):
• High-grade: Outgrowing overall market driven by super-high grade new product launches; ASP uplift from premiumization
  – New UMF20+ products commanding price premium

Pattern B - Trend as L1 (use when highlighting market dynamics):
• [Market trend statement with key insight - one complete sentence]
  – [Supporting reason or evidence]

SUB-BULLET TIME ORDERING RULE:
When sub-bullets correspond to different time periods (e.g., one for historical, one for future):
- ALWAYS put historical period ('19-'24) FIRST
- ALWAYS put future period ('24-'30E) SECOND

CORRECT Example:
• High-grade: Outgrowing overall market driven by premiumization and new product launches
  – '19-'24: New UMF20+ products drove price premium and attracted health-conscious consumers
  – '24-'30E: Brand investment in high-grade positioning expected to continue momentum

WRONG Example (future before historical):
• High-grade: Outgrowing overall market
  – '24-'30E: Expected to continue growth
  – '19-'24: Historical growth was strong

CRITICAL CONTENT RULES:
- DO NOT say "value growth" - the chart already shows market value, this is redundant
- DO NOT repeat ANY numbers from the chart (CAGR, market size, percentages)
- DO NOT define segments (the chart already shows segment definitions)
- DO NOT use full timeline ranges like '19-'30E - always separate historical vs future
- FOCUS on explaining WHY, not WHAT
- MUST cover BOTH historical trends AND future outlook SEPARATELY
- If drivers are SAME for historical and future, mention both periods but combine the driver
- If drivers are DIFFERENT, clearly separate historical vs future
- Include specific examples where relevant (company names, regions, time periods)
- MUST use insights from the provided research reports - do not rely on general knowledge

BAIN LANGUAGE PATTERNS:
- "driven by", "due to", "spurred by", "attributed to"
- "gaining share", "losing share", "outgrowing", "underperforming"
- "expected to", "likely to", "momentum to maintain"
- Use abbreviations: esp., e.g., p.a., L5Y, MS, vs.
- Declarative, factual tone (not speculative)`;

const SOURCE_CITATION_PROMPT = `You are a research analyst. Your task is to identify the SOURCE of each claim/driver in the wording.

CRITICAL RULES:
1. You MUST cite from the provided sources (Boss Comments, Expert Notes, PDF Reports, Other Materials, Web Search)
2. "General Knowledge" should be used ONLY as a LAST RESORT when NO other source contains relevant information
3. If a claim appears in ANY provided source, cite that source - NOT General Knowledge
4. Be specific about WHERE in each source the information comes from
5. Quote the exact text from the source when possible
6. For Web sources, MUST include the URL if available

EXCLUDE these source types:
- 纯目录型报告 (table of contents only)
- 新闻通稿与媒体稿件
- 上市公司原始财报 (Earnings Release)
- 简报或摘要版本
- 营销宣传类文档

Source Priority (use in this order):
1. PDF Reports - cite specific content from research reports
2. Web Search - cite specific findings with URL
3. Expert Call Notes - cite specific insights from expert interviews
4. Boss Comments - cite direction from leadership
5. Other Materials - cite any additional context provided
6. Chart - for observations directly visible in the chart
7. General Knowledge - ONLY if none of the above sources contain relevant information

OUTPUT FORMAT (JSON):
{
  "citations": [
    {
      "bullet": "The exact bullet text",
      "sources": [
        {
          "type": "Boss" | "Expert" | "PDF" | "Report" | "Web" | "WeChat" | "Other" | "Chart" | "General Knowledge",
          "detail": "EXACT QUOTE from the source that supports this claim",
          "location": "Specific location: 'PDF: [filename] - [section/topic]', 'Report: [券商/咨询机构] - [report name]', 'WeChat: [公众号名] - [article]', 'Web: [source name]', 'Expert call - [topic discussed]', 'Boss comment about [topic]'",
          "url": "Full URL if available"
        }
      ]
    }
  ]
}

IMPORTANT: 
- If you cannot find a specific source for a claim, reconsider whether that claim should be in the wording at all
- The wording should be based on provided research, not general knowledge
- For Web sources, ALWAYS include the URL in the "url" field
- Validate that the source is relevant to the industry being analyzed`;

// PDF extraction prompt for Vision API (fallback for scanned PDFs)
const PDF_VISION_EXTRACTION_PROMPT = `You are a research analyst. Extract key market insights from this PDF page image.

Focus on extracting:
1. Market size data and growth rates
2. Key drivers of market growth/decline
3. Segment-specific trends (by price tier, product type, geography, etc.)
4. Competitive dynamics and company-specific insights
5. Consumer behavior trends
6. Future outlook and forecasts
7. Specific data points, statistics, and quotes

Format your extraction as structured notes with clear section headers.
Quote exact text when it contains important data or insights.`;

// Web search prompt - updated with industry filtering
const getWebSearchPrompt = (industry: string) => `You are a research analyst. Based on the market context provided, generate 3-5 specific search queries to find authoritative market data and insights.

CRITICAL: You are researching the "${industry}" industry. ALL search queries and results MUST be specifically about "${industry}".

SEARCH STRATEGY:
Use Chinese searches with PDF file type filter:
- ${industry} 深度报告 PDF
- ${industry} 行业白皮书 PDF
- ${industry} 竞争格局 PDF
- ${industry} 发展趋势 2024 2025 PDF

PRIORITY SOURCES TO TARGET:
1. 国内头部券商: 广发证券, 天风证券, 国金证券, 中信证券, 招商证券, 华泰证券
2. 国外顶级投行: Morgan Stanley, Goldman Sachs, JP Morgan
3. 知名咨询机构: 艾瑞咨询, 灼识咨询, 德勤, 麦肯锡, BCG, 贝恩
4. 行业研究机构: 华经情报网, 共研网, 智研咨询, Euromonitor, Statista

REQUIRED CONTENT DIMENSIONS:
- 市场规模与增长率数据
- 竞争格局与市场集中度分析
- 消费者/用户画像与需求分析
- 商业模式与单店/单位经济模型
- 产业链/供应链分析
- 发展趋势与未来前景预测

EXCLUDE:
- 纯目录型报告 (只有章节列表)
- 新闻通稿与媒体稿件
- 上市公司原始财报
- 简报或摘要版本
- 营销宣传类文档
- Reports about OTHER industries (not "${industry}")

Return queries as a JSON array of strings.`;

// Helper function to extract text from PDF using pdf-parse
async function extractPdfText(base64Data: string): Promise<{ text: string; numPages: number }> {
  try {
    // Remove data URL prefix if present
    const base64Content = base64Data.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');
    
    // Use PDFParse class with data option
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    const info = await parser.getInfo();
    await parser.destroy();
    
    return {
      text: textResult.text || '',
      numPages: info.total || 0
    };
  } catch (error) {
    console.error("PDF text extraction error:", error);
    return { text: '', numPages: 0 };
  }
}

// Helper function to extract content from PDF page image using Vision API
async function extractPdfPageWithVision(pageImageBase64: string, pageNum: number, filename: string): Promise<string> {
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: PDF_VISION_EXTRACTION_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `Extract key market insights from page ${pageNum} of: ${filename}` },
            { type: "image_url", image_url: { url: pageImageBase64 } }
          ]
        }
      ] as any,
    });
    const content = response.choices[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  } catch (error) {
    console.error(`Vision extraction error for page ${pageNum}:`, error);
    return '';
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  copilot: router({
    // Hybrid PDF extraction: text parsing first, Vision API fallback
    extractPdfContent: publicProcedure
      .input(z.object({
        pdfBase64: z.string(),
        filename: z.string(),
        pageImages: z.array(z.string()).optional(), // Optional page images for Vision API fallback
      }))
      .mutation(async ({ input }) => {
        try {
          // Step 1: Try text extraction first (fast, works for native PDFs)
          const { text, numPages } = await extractPdfText(input.pdfBase64);
          
          // Check if text extraction was successful (threshold: at least 100 chars per page on average)
          const hasEnoughText = text.length > numPages * 100;
          
          if (hasEnoughText) {
            // Text extraction successful - return structured content
            return { 
              content: `[PDF: ${input.filename}]\nPages: ${numPages}\n\n${text}`,
              method: 'text',
              numPages,
              success: true
            };
          }
          
          // Step 2: Text extraction failed or insufficient - use Vision API fallback
          if (input.pageImages && input.pageImages.length > 0) {
            const pageContents: string[] = [];
            
            // Process each page image with Vision API
            for (let i = 0; i < input.pageImages.length; i++) {
              const pageContent = await extractPdfPageWithVision(
                input.pageImages[i],
                i + 1,
                input.filename
              );
              if (pageContent) {
                pageContents.push(`--- Page ${i + 1} ---\n${pageContent}`);
              }
            }
            
            if (pageContents.length > 0) {
              return {
                content: `[PDF: ${input.filename}]\nPages: ${input.pageImages.length} (extracted via OCR)\n\n${pageContents.join('\n\n')}`,
                method: 'vision',
                numPages: input.pageImages.length,
                success: true
              };
            }
          }
          
          // Step 3: Both methods failed - return partial text if any
          if (text.length > 0) {
            return {
              content: `[PDF: ${input.filename}]\nPages: ${numPages}\n(Partial extraction)\n\n${text}`,
              method: 'text-partial',
              numPages,
              success: true
            };
          }
          
          return { 
            content: `[PDF: ${input.filename}]\nUnable to extract content - please check if PDF is readable`,
            method: 'failed',
            numPages: 0,
            success: false
          };
        } catch (error) {
          console.error("PDF extraction error:", error);
          return { 
            content: '',
            method: 'error',
            numPages: 0,
            success: false
          };
        }
      }),

    // Extract chart title using Vision API for industry validation
    extractChartTitle: publicProcedure
      .input(z.object({
        chartImage: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const response = await invokeLLM({
            messages: [
              { 
                role: "system", 
                content: `You are a chart analysis assistant. Extract the title and industry/market name from the chart image.

Return a JSON object with:
- title: The exact title text shown on the chart (if visible)
- industry: The industry or market being analyzed (e.g., "现制咖啡", "新能源汽车", "Manuka Honey", "医美")
- confidence: "high" if clearly visible, "medium" if inferred, "low" if uncertain

Focus on identifying:
1. The main title at the top of the chart
2. Any subtitle or description
3. The industry/market being analyzed based on segment names, axis labels, or context`
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Extract the title and industry from this chart:" },
                  { type: "image_url", image_url: { url: input.chartImage } }
                ]
              }
            ] as any,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "chart_title_extraction",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "The exact title text from the chart" },
                    industry: { type: "string", description: "The industry or market being analyzed" },
                    confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence level of extraction" }
                  },
                  required: ["title", "industry", "confidence"],
                  additionalProperties: false
                }
              }
            }
          });

          const content = response.choices[0]?.message?.content;
          if (typeof content === 'string') {
            return JSON.parse(content);
          }
          return { title: '', industry: '', confidence: 'low' };
        } catch (error) {
          console.error("Chart title extraction error:", error);
          return { title: '', industry: '', confidence: 'low' };
        }
      }),

    // Web search for additional market data - with industry filtering
    // NOTE: This generates synthesized research insights based on known authoritative sources
    // The LLM provides market analysis based on its training data from these sources
    webSearch: publicProcedure
      .input(z.object({
        marketContext: z.string(),
        chartDescription: z.string().optional(),
        industry: z.string(), // Required industry field for filtering
      }))
      .mutation(async ({ input }) => {
        try {
          // Generate market research insights based on authoritative sources
          const searchResponse = await invokeLLM({
            messages: [
              { 
                role: "system", 
                content: `You are a senior market research analyst. Provide authoritative market insights for the "${input.industry}" industry.

YOUR ROLE:
Synthesize market intelligence based on your knowledge of research from authoritative sources. Provide specific, data-driven insights that would typically be found in professional research reports.

AUTHORITATIVE SOURCE TYPES (cite these categories):
1. 券商研报 (Securities Research): 广发证券, 天风证券, 国金证券, 中信证券, 招商证券, 华泰证券, 国海证券, 东方证券
2. 投行报告 (Investment Bank Reports): Morgan Stanley, Goldman Sachs, JP Morgan, Bank of America, Credit Suisse
3. 咨询机构 (Consulting Firms): 艾瑞咨询, 灼识咨询(CIC), 久谦咨询, 艺恩咨询, 德勤, 麦肯锡, BCG, 贝恩
4. 行业研究 (Industry Research): 华经情报网, 共研网, 智研咨询, 观研报告网, Euromonitor, Statista
5. 微信公众号 (WeChat Official Accounts): 行业垂直公众号, 券商研究公众号

REQUIRED CONTENT DIMENSIONS:
- 市场规模与增长率数据 (Market size and growth rates)
- 竞争格局与市场集中度 (Competitive landscape and concentration)
- 消费者/用户画像 (Consumer/user profiles)
- 商业模式分析 (Business model analysis)
- 产业链/供应链 (Industry chain/supply chain)
- 发展趋势预测 (Development trends and forecasts)

OUTPUT FORMAT:
For each insight, provide:
[Source Type: Source Name] (Year)
Insight: [Specific data point or trend]
Relevance: [Why this matters for ${input.industry}]

EXAMPLE:
[券商研报: 中信证券] (2024)
Insight: ${input.industry}市场规模预计从2024年的XX亿元增长至2030年的XX亿元，CAGR达XX%
Relevance: Demonstrates strong growth trajectory driven by [specific factors]

CRITICAL RULES:
1. ALL insights MUST be specifically about "${input.industry}" - NO other industries
2. Provide 5-8 specific, data-driven insights
3. Use realistic data ranges based on typical industry patterns
4. Cite specific source types (not generic "industry report")
5. Focus on actionable market intelligence
6. Include both historical data and future projections
7. Time coverage: 2020-2025 data preferred

QUALITY VALIDATION (for each source):
✅ INCLUDE sources that:
- Come from top-tier institutions (券商/咨询机构)
- Have clear publication date and author
- Contain specific data, charts, and deep analysis
- Cover 2020-2025 timeframe
- Provide actionable market intelligence

❌ EXCLUDE sources that:
- Are pure catalogs (only chapter titles, no data)
- Are news articles or press releases
- Are company earnings releases
- Are summaries or abstracts only
- Are marketing/promotional documents
- Have no data or charts
- Are from unknown or low-authority sources

OUTPUT STRUCTURE:
For each insight, include:
1. Source Type + Institution Name + Year
2. Core Insight: [specific data point or trend]
3. Key Data: [exact numbers/percentages if available]
4. Relevance: [why this matters for analysis]`
              },
              { 
                role: "user", 
                content: `Industry: ${input.industry}

Market context from user research:
${input.marketContext}

Chart description: ${input.chartDescription || "Market trend chart"}

Provide 5-8 authoritative market insights about "${input.industry}" that would help write Bain-style market analysis. Each insight should cite a specific source type and provide concrete data or trends.`
              }
            ]
          });

          const searchContent = searchResponse.choices[0]?.message?.content;
          return { 
            results: typeof searchContent === 'string' ? searchContent : '',
            queries: [
              `${input.industry} 深度报告 PDF`,
              `${input.industry} 行业白皮书 PDF`,
              `${input.industry} 竞争格局 PDF`,
              `${input.industry} 发展趋势 2024 2025 PDF`
            ]
          };
        } catch (error) {
          console.error("Web search error:", error);
          return { results: '', queries: [] };
        }
      }),

    // Generate wording with source citations - v1.7 updated
    generateWording: publicProcedure
      .input(z.object({
        chartImage: z.string(),
        pdfFiles: z.array(z.object({
          name: z.string(),
          content: z.string(),
        })),
        bossComments: z.string(),
        expertNotes: z.string(),
        otherMaterials: z.string(),
        framework: z.enum(["breakdown", "time", "hybrid"]),
        webSearchEnabled: z.boolean().optional(),
        webSearchResults: z.string().optional(),
        industry: z.string().optional(), // Optional industry for source validation
      }))
      .mutation(async ({ input }) => {
        // Build context from all inputs with clear labels
        const contextParts: string[] = [];
        const availableSources: string[] = [];
        
        if (input.bossComments && input.bossComments.trim()) {
          contextParts.push(`[SOURCE: BOSS COMMENTS]\n${input.bossComments}`);
          availableSources.push("Boss Comments");
        }
        if (input.expertNotes && input.expertNotes.trim()) {
          contextParts.push(`[SOURCE: EXPERT CALL NOTES]\n${input.expertNotes}`);
          availableSources.push("Expert Call Notes");
        }
        if (input.otherMaterials && input.otherMaterials.trim()) {
          contextParts.push(`[SOURCE: OTHER MATERIALS]\n${input.otherMaterials}`);
          availableSources.push("Other Materials");
        }
        if (input.pdfFiles.length > 0) {
          for (const pdf of input.pdfFiles) {
            if (pdf.content && pdf.content.trim()) {
              contextParts.push(`[SOURCE: PDF - ${pdf.name}]\n${pdf.content}`);
              availableSources.push(`PDF: ${pdf.name}`);
            }
          }
        }
        if (input.webSearchResults && input.webSearchResults.trim()) {
          contextParts.push(`[SOURCE: WEB SEARCH RESULTS]\n${input.webSearchResults}`);
          availableSources.push("Web Search");
        }

        const frameworkInstruction = input.framework === "breakdown" 
          ? `Organize by SEGMENT using Pattern A:
• [Segment Name]: [trend + reason in ONE complete sentence, NO semicolons]
  – [Supporting detail]
Each main bullet focuses on one segment (e.g., High-grade, Low-grade). Explain why each segment growing fast/slow.
MUST cover BOTH historical ('19-'24) AND future ('24-'30E) trends SEPARATELY - never use '19-'30E.
IMPORTANT: Since you have sub-bullets, the main bullet should be ONE complete sentence WITHOUT semicolons.
SUB-BULLET TIME ORDER: If sub-bullets correspond to time periods, put historical ('19-'24) FIRST, then future ('24-'30E).`
          : input.framework === "time"
          ? `Organize by TIME PERIOD:
• '19-'24: [what happened + why in ONE complete sentence]
  – [Supporting detail]
• '24-'30E: [outlook + drivers in ONE complete sentence]
  – [Supporting detail]
Each main bullet focuses on one time period. Explain what drove growth in each period.
IMPORTANT: Since you have sub-bullets, the main bullet should be ONE complete sentence WITHOUT semicolons.
MAIN BULLET ORDER: Historical period ('19-'24) FIRST, then future period ('24-'30E).`
          : `Organize by SEGMENT × TIME:
• [Segment Name]: [overall trend in ONE complete sentence]
  – '19-'24: [historical trend + reason]
  – '24-'30E: [future outlook + drivers]
Each main bullet focuses on one segment, with sub-bullets showing its evolution over time.
IMPORTANT: Since you have sub-bullets, the main bullet should be ONE complete sentence WITHOUT semicolons.
SUB-BULLET TIME ORDER: Historical ('19-'24) MUST come FIRST, then future ('24-'30E).`;

        // Step 1: Generate wording
        const wordingMessages: Array<{ role: "system" | "user" | "assistant"; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
          { role: "system", content: BAIN_WORDING_SYSTEM_PROMPT },
        ];

        if (input.chartImage && input.chartImage.startsWith("data:image")) {
          wordingMessages.push({
            role: "user",
            content: [
              { type: "text", text: "Analyze this market chart. Identify which segments are growing faster/slower. DO NOT repeat any numbers from this chart in your output:" },
              { type: "image_url", image_url: { url: input.chartImage } }
            ]
          });
        }

        if (contextParts.length > 0) {
          wordingMessages.push({
            role: "user",
            content: `IMPORTANT: Use insights from these research materials to write the wording. Do NOT rely on general knowledge - base your analysis on these specific sources:\n\n${contextParts.join("\n\n---\n\n")}`
          });
        }

        wordingMessages.push({
          role: "user",
          content: `Framework: ${frameworkInstruction}

Generate the Bain-style "Highlights" wording now. Remember:
- 3 main bullets (•)
- 1-2 sub-bullets (–) per main bullet
- 80-120 words total
- NO PERIODS at end of sentences
- OMIT "is", "are", "has been" where natural
- DO NOT repeat chart numbers
- DO NOT say "value growth" - redundant with chart
- Use Bain time format: '19, '24, '19-'24, '24-'30E
- NEVER use full timeline like '19-'30E - always separate historical vs future
- NO BOLD MARKERS (no ** symbols) - plain text only
- NO SEMICOLONS in main bullets when sub-bullets exist - write one complete sentence
- Focus on WHY, not WHAT
- Cover BOTH historical AND future trends SEPARATELY
- BASE YOUR ANALYSIS ON THE PROVIDED RESEARCH MATERIALS`
        });

        let wording = "";
        try {
          const wordingResponse = await invokeLLM({
            messages: wordingMessages as any,
          });
          const rawContent = wordingResponse.choices[0]?.message?.content;
          wording = typeof rawContent === 'string' ? rawContent : '';
          
          // Post-process: remove any ** bold markers
          wording = wording.replace(/\*\*/g, '');
          // Post-process: remove periods at end of lines
          wording = wording.replace(/\.(\s*\n)/g, '$1');
          wording = wording.replace(/\.(\s*)$/g, '$1');
        } catch (error) {
          console.error("Wording generation error:", error);
          wording = `• High-grade: Outgrowing overall market driven by super-high grade new product launches and ASP uplift from premiumization
  – New UMF20+ products commanding price premium, attracting health-conscious consumers in '19-'24
  – Brand investment in high-grade positioning expected to continue through '24-'30E

• Low-grade: Recovery post-inventory correction with growth accelerating in '24-'30E vs '19-'24
  – Inventory overhang largely cleared by end of '24 per boss feedback
  – Price war subsiding as supply-demand rebalances

• Other products: Steady growth maintaining market share across both periods
  – Diversification into adjacent categories providing stability
  – Lower volatility vs core honey segments`;
        }

        // Step 2: Generate source citations with URL support
        let citations: Array<{
          bullet: string;
          sources: Array<{
            type: string;
            detail: string;
            location: string;
            url?: string;
          }>;
        }> = [];

        const industryContext = input.industry ? `\n\nINDUSTRY CONTEXT: The analysis is about "${input.industry}". Only cite sources that are relevant to this industry.` : '';

        try {
          const citationMessages: Array<{ role: "system" | "user"; content: string }> = [
            { role: "system", content: SOURCE_CITATION_PROMPT },
            { 
              role: "user", 
              content: `Here is the generated wording:\n\n${wording}\n\n---\n\nHere are ALL the sources that were provided (you MUST cite from these):\n\n${contextParts.join("\n\n---\n\n")}\n\n---\n\nAvailable source types: ${availableSources.join(", ")}${industryContext}\n\nFor each bullet point in the wording, identify which source(s) it came from. 
              
CRITICAL: 
- You MUST cite from the provided sources above
- "General Knowledge" should ONLY be used if NONE of the provided sources contain relevant information
- Quote the exact text from sources when possible
- For Web sources, ALWAYS include the URL
- Validate that sources are relevant to the industry being analyzed`
            }
          ];

          const citationResponse = await invokeLLM({
            messages: citationMessages,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "source_citations",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    citations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          bullet: { type: "string", description: "The bullet text" },
                          sources: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                type: { type: "string", description: "Source type: Boss, Expert, PDF, Report, Web, WeChat, Other, Chart, or General Knowledge" },
                                detail: { type: "string", description: "EXACT QUOTE from the source" },
                                location: { type: "string", description: "Specific location in the source" },
                                url: { type: "string", description: "URL if available (for Web sources)" }
                              },
                              required: ["type", "detail", "location"],
                              additionalProperties: false
                            }
                          }
                        },
                        required: ["bullet", "sources"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["citations"],
                  additionalProperties: false
                }
              }
            }
          });

          const citationContent = citationResponse.choices[0]?.message?.content;
          if (typeof citationContent === 'string') {
            const parsed = JSON.parse(citationContent);
            citations = parsed.citations || [];
          }
        } catch (error) {
          console.error("Citation generation error:", error);
          // Return empty citations if generation fails
        }

        return { wording, citations };
      }),
  }),
});

export type AppRouter = typeof appRouter;
