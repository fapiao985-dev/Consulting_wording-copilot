import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";

import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Upload, FileText, Image, Sparkles, Copy, RefreshCw, ChevronRight, Loader2, X, ChevronDown, BookOpen, CheckCircle, Globe, ExternalLink, Building2 } from "lucide-react";

type Framework = "breakdown" | "time" | "hybrid";

type Citation = {
  bullet: string;
  sources: Array<{
    type: string;
    detail: string;
    location: string;
    url?: string;
  }>;
};

type PdfFile = {
  file: File;
  name: string;
  content: string;
  status: "pending" | "extracting" | "done" | "error";
};

export default function Home() {
  // Input states
  const [bossComments, setBossComments] = useState("");
  const [expertNotes, setExpertNotes] = useState("");
  const [otherMaterials, setOtherMaterials] = useState("");
  const [chartImage, setChartImage] = useState<File | null>(null);
  const [chartPreview, setChartPreview] = useState<string | null>(null);
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  // Framework auto-detected by LLM based on chart structure (no manual selection)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [industry, setIndustry] = useState(""); // Industry input for source filtering

  // Chart title extraction states
  const [chartIndustry, setChartIndustry] = useState<string | null>(null);
  const [chartTitle, setChartTitle] = useState<string | null>(null);
  const [isExtractingTitle, setIsExtractingTitle] = useState(false);

  // Workflow states
  const [step, setStep] = useState<"input" | "output">("input");
  const [generatedWording, setGeneratedWording] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedCitations, setExpandedCitations] = useState<Set<number>>(new Set());
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [webSearchSource, setWebSearchSource] = useState<"database" | "llm" | null>(null); // Track source of web search results
  const [evidenceStatus, setEvidenceStatus] = useState<"sufficient" | "limited" | null>(null);
  const [riskTag, setRiskTag] = useState<string | null>(null);
  const [verificationUrls, setVerificationUrls] = useState<string[]>([]);

  // tRPC mutations
  const generateWording = trpc.copilot.generateWording.useMutation();
  const extractPdfContent = trpc.copilot.extractPdfContent.useMutation();
  const webSearch = trpc.copilot.webSearch.useMutation();
  const extractChartTitle = trpc.copilot.extractChartTitle.useMutation();

  const handleChartUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setChartImage(file);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setChartPreview(base64);
        
        // Extract chart title and auto-fill industry field
        setIsExtractingTitle(true);
        try {
          const result = await extractChartTitle.mutateAsync({ chartImage: base64 });
          if (result.industry) {
            setChartIndustry(result.industry);
            setChartTitle(result.title);
            // Always auto-fill industry field with detected value (user can still edit)
            setIndustry(result.industry);
            toast.success(`Detected industry: ${result.industry}`);
          }
        } catch (error) {
          console.error("Chart title extraction error:", error);
        } finally {
          setIsExtractingTitle(false);
        }
      };
      reader.readAsDataURL(file);
    }
  }, [extractChartTitle]);

  const handlePdfUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newPdfs: PdfFile[] = files.map(file => ({ 
      file, 
      name: file.name, 
      content: "",
      status: "pending" as const
    }));
    setPdfFiles(prev => [...prev, ...newPdfs]);

    // Extract content from each PDF using hybrid approach
    for (let i = 0; i < newPdfs.length; i++) {
      const pdf = newPdfs[i];
      
      // Update status to extracting
      setPdfFiles(prev => prev.map(p => 
        p.name === pdf.name ? { ...p, status: "extracting" as const } : p
      ));

      try {
        // Convert PDF to base64
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(pdf.file);
        });

        // Extract content using hybrid approach (text parsing first, Vision API fallback)
        const result = await extractPdfContent.mutateAsync({
          pdfBase64: base64,
          filename: pdf.name,
        });

        // Update with extracted content
        const methodLabel = result.method === 'text' ? 'text extraction' : 
                           result.method === 'vision' ? 'OCR' : 
                           result.method === 'text-partial' ? 'partial extraction' : 'extraction';
        
        setPdfFiles(prev => prev.map(p => 
          p.name === pdf.name ? { ...p, content: result.content, status: "done" as const } : p
        ));

        if (result.success) {
          toast.success(`Extracted ${result.numPages} pages from ${pdf.name} (${methodLabel})`);
        } else {
          toast.warning(`Partial extraction from ${pdf.name}`);
        }
      } catch (error) {
        console.error("PDF extraction error:", error);
        setPdfFiles(prev => prev.map(p => 
          p.name === pdf.name ? { ...p, status: "error" as const } : p
        ));
        toast.error(`Failed to extract ${pdf.name}`);
      }
    }
  }, [extractPdfContent]);

  const removePdf = useCallback((index: number) => {
    setPdfFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const toggleCitation = (index: number) => {
    setExpandedCitations(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!chartImage) {
      toast.error("Please upload a chart image first");
      return;
    }

    // Check if industry is provided when web search is enabled
    if (webSearchEnabled && !industry.trim()) {
      toast.error("Please enter the industry name for web search");
      return;
    }

    // Check if any PDFs are still extracting
    const extractingPdfs = pdfFiles.filter(p => p.status === "extracting");
    if (extractingPdfs.length > 0) {
      toast.error("Please wait for PDF extraction to complete");
      return;
    }

    await proceedWithGeneration();
  };

  const proceedWithGeneration = async () => {
    setIsGenerating(true);
    setExtractionProgress(0);
    setProgressMessage("Processing inputs...");

    try {
      const chartBase64 = chartPreview || "";
      
      // Use extracted PDF content
      const pdfContents = pdfFiles
        .filter(p => p.status === "done" && p.content)
        .map(p => ({ name: p.name, content: p.content }));

      setExtractionProgress(20);

      // Run web search if enabled
      let webSearchResults = "";
      if (webSearchEnabled && industry.trim()) {
        setProgressMessage(`Searching for ${industry} industry sources...`);
        setExtractionProgress(30);
        
        const marketContext = [
          bossComments,
          expertNotes,
          otherMaterials,
          ...pdfContents.map(p => p.content.substring(0, 500))
        ].filter(Boolean).join("\n\n");

        try {
          const searchResult = await webSearch.mutateAsync({
            marketContext,
            chartDescription: "Market chart with segment breakdown",
            industry: industry.trim(),
          });
          webSearchResults = searchResult.results;
          // Track the source of web search results
          if (searchResult.source === 'database') {
            setWebSearchSource('database');
            toast.success(`Found ${searchResult.reportCount} validated reports from database`);
          } else {
            setWebSearchSource('llm');
            toast.info('Using AI-synthesized insights (URLs may need verification)');
          }
          setExtractionProgress(50);
        } catch (error) {
          console.error("Web search error:", error);
          toast.error("Web search failed, continuing without it");
          setWebSearchSource(null);
        }
      }

      setProgressMessage("Generating Bain-style wording...");
      setExtractionProgress(60);

      const result = await generateWording.mutateAsync({
        chartImage: chartBase64,
        pdfFiles: pdfContents,
        bossComments,
        expertNotes,
        otherMaterials,
        webSearchEnabled,
        webSearchResults,
        industry: industry.trim() || undefined,
      });

      setExtractionProgress(100);
      setGeneratedWording(result.wording);
      setCitations(result.citations || []);
      setEvidenceStatus(result.evidenceStatus || 'sufficient');
      setRiskTag(result.riskTag || null);
      setVerificationUrls(result.verificationUrls || []);
      setStep("output");
      
      // Evidence status check removed due to type mismatch
      toast.success("Wording generated with source citations!");
    } catch (error) {
      toast.error("Failed to generate wording. Please try again.");
      console.error(error);
    } finally {
      setIsGenerating(false);
      setExtractionProgress(0);
      setProgressMessage("");
    }
  };

  const handleCopyWording = () => {
    navigator.clipboard.writeText(generatedWording);
    toast.success("Copied to clipboard!");
  };

  const handleCopyWithSources = () => {
    let fullText = generatedWording + "\n\n---\nSOURCES:\n";
    citations.forEach((citation, i) => {
      fullText += `\n[${i + 1}] ${citation.bullet.substring(0, 50)}...\n`;
      citation.sources.forEach(source => {
        fullText += `    - ${source.type}: ${source.location}\n`;
        if (source.url) {
          fullText += `      URL: ${source.url}\n`;
        }
        if (source.detail) {
          fullText += `      "${source.detail}"\n`;
        }
      });
    });
    navigator.clipboard.writeText(fullText);
    toast.success("Copied wording with sources!");
  };

  const handleRegenerate = async () => {
    setIsGenerating(true);
    setProgressMessage("Regenerating...");
    try {
      const chartBase64 = chartPreview || "";
      const pdfContents = pdfFiles
        .filter(p => p.status === "done" && p.content)
        .map(p => ({ name: p.name, content: p.content }));

      // Run web search if enabled
      let webSearchResults = "";
      if (webSearchEnabled && industry.trim()) {
        const marketContext = [
          bossComments,
          expertNotes,
          otherMaterials,
          ...pdfContents.map(p => p.content.substring(0, 500))
        ].filter(Boolean).join("\n\n");

        try {
          const searchResult = await webSearch.mutateAsync({
            marketContext,
            chartDescription: "Market chart with segment breakdown",
            industry: industry.trim(),
          });
          webSearchResults = searchResult.results;
        } catch (error) {
          console.error("Web search error:", error);
        }
      }

      const result = await generateWording.mutateAsync({
        chartImage: chartBase64,
        pdfFiles: pdfContents,
        bossComments,
        expertNotes,
        otherMaterials,
        webSearchEnabled,
        webSearchResults,
        industry: industry.trim() || undefined,
      });

      setGeneratedWording(result.wording);
      setCitations(result.citations || []);
      toast.success("Wording regenerated!");
    } catch (error) {
      toast.error("Failed to regenerate. Please try again.");
    } finally {
      setIsGenerating(false);
      setProgressMessage("");
    }
  };

  const handleStartOver = () => {
    setStep("input");
    setGeneratedWording("");
    setCitations([]);
    setExpandedCitations(new Set());
  };

  const getSourceBadgeColor = (type: string) => {
    switch (type) {
      case "LT comments": return "bg-blue-100 text-blue-800 border-blue-200";
      case "Expert": return "bg-green-100 text-green-800 border-green-200";
      case "PDF": return "bg-purple-100 text-purple-800 border-purple-200";
      case "Report": return "bg-indigo-100 text-indigo-800 border-indigo-200"; // 券商研报/咨询报告
      case "Web": return "bg-cyan-100 text-cyan-800 border-cyan-200";
      case "WeChat": return "bg-emerald-100 text-emerald-800 border-emerald-200"; // 微信公众号
      case "Other": return "bg-orange-100 text-orange-800 border-orange-200";
      case "Chart": return "bg-gray-100 text-gray-800 border-gray-200";
      default: return "bg-yellow-100 text-yellow-800 border-yellow-200";
    }
  };

  const getPdfStatusIcon = (status: PdfFile["status"]) => {
    switch (status) {
      case "extracting": return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case "done": return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "error": return <X className="w-4 h-4 text-red-600" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Helper to check if a string looks like a URL
  const isValidUrl = (str: string | undefined): boolean => {
    if (!str) return false;
    try {
      new URL(str);
      return true;
    } catch {
      return str.startsWith("http://") || str.startsWith("https://");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Market Wording Copilot</h1>
                <p className="text-sm text-muted-foreground">Generate Bain-style slide wording</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={step === "input" ? "default" : "secondary"}>1. Input</Badge>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <Badge variant={step === "output" ? "default" : "secondary"}>2. Output</Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Step 1: Input */}
        {step === "input" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Chart Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="w-5 h-5" />
                  Chart Image
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Please include chart title
                </p>
              </CardHeader>
              <CardContent>
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    chartPreview ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  {chartPreview ? (
                    <div className="space-y-4">
                      <img 
                        src={chartPreview} 
                        alt="Chart preview" 
                        className="max-h-64 mx-auto rounded-lg shadow-sm"
                      />
                      {isExtractingTitle && (
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Detecting industry...
                        </div>
                      )}
                      {chartIndustry && !isExtractingTitle && (
                        <div className="text-xs text-muted-foreground">
                          Detected: {chartIndustry}
                        </div>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => { 
                          setChartImage(null); 
                          setChartPreview(null); 
                          setChartIndustry(null);
                          setChartTitle(null);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground mb-1">
                        Drop your chart image here or click to upload
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PNG, JPG up to 10MB
                      </p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleChartUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                
                {/* Chart example */}
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">Example:</p>
                  <img 
                    src="/chart-example.png" 
                    alt="Chart example with title" 
                    className="rounded-lg border border-border shadow-sm max-w-xs"
                  />
                </div>

                <Separator className="my-6" />

                {/* Industry Input */}
                <div className="space-y-3 mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="industry">Industry Name</Label>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Auto-generated from chart, editable
                    </p>
                  </div>
                  <Input
                    id="industry"
                    placeholder="e.g., fresh-made coffee, EV, etc."
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  />
                </div>

                <Separator className="my-6" />

                {/* Web Search Toggle */}
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="web-search" className="text-sm font-medium">Web Search</Label>
                      <p className="text-xs text-muted-foreground">
                        Search online for sources (analyst reports, 3rd-party reports, etc.)
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="web-search"
                    checked={webSearchEnabled}
                    onCheckedChange={setWebSearchEnabled}
                  />
                </div>
                {webSearchEnabled && !industry.trim() && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    Please enter the industry name above to enable web search
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right Column: Text Inputs */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Case Materials
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Please upload supporting materials (optional)
                  </p>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="boss" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="boss">LT comments</TabsTrigger>
                      <TabsTrigger value="pdf">PDFs</TabsTrigger>
                      <TabsTrigger value="expert">Expert</TabsTrigger>
                      <TabsTrigger value="other">Other</TabsTrigger>
                    </TabsList>

                    <TabsContent value="boss" className="mt-4">
                      <div className="space-y-2">
                        <Label>LT Comments</Label>
                        <Textarea
                          placeholder="Enter leadership team's comments about the market trends..."
                          value={bossComments}
                          onChange={(e) => setBossComments(e.target.value)}
                          rows={6}
                        />
                        <p className="text-xs text-muted-foreground">
                          Key insights or direction from leadership
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="pdf" className="mt-4">
                      <div className="space-y-4">
                        <Label>Research PDFs</Label>
                        <div 
                          className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors"
                        >
                          <label className="cursor-pointer block">
                            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                              Upload research reports (PDF)
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Content will be automatically extracted
                            </p>
                            <input
                              type="file"
                              accept=".pdf,image/*"
                              multiple
                              onChange={handlePdfUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {pdfFiles.length > 0 && (
                          <div className="space-y-2">
                            {pdfFiles.map((pdf, index) => (
                              <div 
                                key={index}
                                className="flex items-center justify-between p-3 bg-muted rounded-lg"
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  {getPdfStatusIcon(pdf.status)}
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm truncate block">{pdf.name}</span>
                                    {pdf.status === "extracting" && (
                                      <span className="text-xs text-muted-foreground">Extracting content...</span>
                                    )}
                                    {pdf.status === "done" && (
                                      <span className="text-xs text-green-600">Content extracted</span>
                                    )}
                                    {pdf.status === "error" && (
                                      <span className="text-xs text-red-600">Extraction failed</span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removePdf(index)}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="expert" className="mt-4">
                      <div className="space-y-2">
                        <Label>Expert Call Notes</Label>
                        <Textarea
                          placeholder="Paste notes from expert interviews..."
                          value={expertNotes}
                          onChange={(e) => setExpertNotes(e.target.value)}
                          rows={6}
                        />
                        <p className="text-xs text-muted-foreground">
                          Insights from industry expert calls
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="other" className="mt-4">
                      <div className="space-y-2">
                        <Label>Other Materials</Label>
                        <Textarea
                          placeholder="Any additional context or materials..."
                          value={otherMaterials}
                          onChange={(e) => setOtherMaterials(e.target.value)}
                          rows={6}
                        />
                        <p className="text-xs text-muted-foreground">
                          News articles, internal data, etc.
                        </p>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {isGenerating && extractionProgress > 0 && (
                <div className="space-y-2">
                  <Progress value={extractionProgress} />
                  <p className="text-xs text-muted-foreground text-center">
                    {progressMessage || "Processing..."}
                  </p>
                </div>
              )}

              <Button 
                className="w-full" 
                size="lg"
                onClick={handleGenerate}
                disabled={!chartImage || isGenerating || pdfFiles.some(p => p.status === "extracting") || (webSearchEnabled && !industry.trim())}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {progressMessage || "Generating Wording..."}
                  </>
                ) : pdfFiles.some(p => p.status === "extracting") ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extracting PDFs...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Wording
                    {webSearchEnabled && <Globe className="w-4 h-4 ml-2" />}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Output with Citations */}
        {step === "output" && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Wording Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Generated Wording
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopyWording}>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCopyWithSources}>
                      <BookOpen className="w-4 h-4 mr-2" />
                      Copy with Sources
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={isGenerating}>
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Regenerate
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted p-6 rounded-lg font-mono text-sm whitespace-pre-wrap">
                  {generatedWording}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  <span>Format: No periods, no bold markers, Bain time format ('19, '24, '19-'24E)</span>
                </div>
              </CardContent>
            </Card>

            {/* Evidence Metadata Card - Only show if evidence is limited */}
            {evidenceStatus === 'limited' && (riskTag || verificationUrls.length > 0) && (
              <Card className="border-yellow-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-yellow-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Internal Risk Note
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {riskTag && (
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                      <p className="text-sm text-yellow-800">{riskTag}</p>
                    </div>
                  )}
                  {verificationUrls.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Verification URLs (for consultant use only):</h4>
                      <ul className="space-y-2">
                        {verificationUrls.map((url, idx) => (
                          <li key={idx}>
                            <a 
                              href={url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted-foreground mt-2">
                        These URLs provide general context for the inferred drivers. They are NOT cited sources.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Citations Card - Only show if evidence is sufficient */}
            {evidenceStatus === 'sufficient' && citations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    Source Citations
                    <Badge variant="outline" className="ml-2">{citations.length} bullets</Badge>
                    {webSearchSource && (
                      <Badge 
                        variant={webSearchSource === 'database' ? 'default' : 'secondary'}
                        className={`ml-2 ${webSearchSource === 'database' ? 'bg-green-600' : 'bg-yellow-600'}`}
                      >
                        {webSearchSource === 'database' ? '✓ Validated URLs' : '⚠ AI-Generated URLs'}
                      </Badge>
                    )}
                  </CardTitle>
                  {webSearchSource === 'llm' && (
                    <p className="text-xs text-yellow-600 mt-1">
                      Note: Web search URLs are AI-generated and may not be valid. Ask Manus to populate real URLs for this industry.
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {citations.map((citation, index) => (
                    <Collapsible 
                      key={index}
                      open={expandedCitations.has(index)}
                      onOpenChange={() => toggleCitation(index)}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                          <ChevronDown 
                            className={`w-4 h-4 mt-1 transition-transform ${
                              expandedCitations.has(index) ? "rotate-180" : ""
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{citation.bullet}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {citation.sources.map((source, sIdx) => (
                                <span 
                                  key={sIdx}
                                  className={`text-xs px-2 py-0.5 rounded-full border ${getSourceBadgeColor(source.type)}`}
                                >
                                  {source.type}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-7 mt-2 space-y-2">
                          {citation.sources.map((source, sIdx) => (
                            <div key={sIdx} className="p-3 bg-background border rounded-lg">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${getSourceBadgeColor(source.type)}`}>
                                  {source.type}
                                </span>
                                <span className="text-xs text-muted-foreground">{source.location}</span>
                              </div>
                              {source.url && isValidUrl(source.url) && (
                                <div className="mb-2">
                                  <a 
                                    href={source.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-cyan-600 hover:text-cyan-800 hover:underline flex items-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    {source.url.length > 60 ? source.url.substring(0, 60) + "..." : source.url}
                                  </a>
                                </div>
                              )}
                              <p className="text-sm text-muted-foreground italic">"{source.detail}"</p>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Format:</span> Auto-detected from chart
                {industry && (
                  <span className="ml-2">
                    <Building2 className="w-3 h-3 inline mr-1" />
                    {industry}
                  </span>
                )}
                {webSearchEnabled && (
                  <span className="ml-2">
                    <Globe className="w-3 h-3 inline mr-1" />
                    Web Search
                  </span>
                )}
              </div>
              <Button variant="ghost" onClick={handleStartOver}>
                Start Over
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
