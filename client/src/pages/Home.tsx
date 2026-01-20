import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Upload, FileText, Image, Sparkles, Copy, RefreshCw, ChevronRight, Loader2, X } from "lucide-react";

type Framework = "breakdown" | "time" | "hybrid";

export default function Home() {
  // Input states
  const [bossComments, setBossComments] = useState("");
  const [expertNotes, setExpertNotes] = useState("");
  const [otherMaterials, setOtherMaterials] = useState("");
  const [chartImage, setChartImage] = useState<File | null>(null);
  const [chartPreview, setChartPreview] = useState<string | null>(null);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [framework, setFramework] = useState<Framework>("breakdown");

  // Workflow states
  const [step, setStep] = useState<"input" | "output">("input");
  const [generatedWording, setGeneratedWording] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // tRPC mutation
  const generateWording = trpc.copilot.generateWording.useMutation();

  const handleChartUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setChartImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setChartPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  }, []);

  const handlePdfUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPdfFiles(prev => [...prev, ...files]);
  }, []);

  const removePdf = useCallback((index: number) => {
    setPdfFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleGenerate = async () => {
    if (!chartImage) {
      toast.error("Please upload a chart image first");
      return;
    }

    setIsGenerating(true);
    try {
      // Convert files to base64
      const chartBase64 = chartPreview || "";
      const pdfContents: string[] = [];
      
      for (const pdf of pdfFiles) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(pdf);
        });
        pdfContents.push(base64);
      }

      const result = await generateWording.mutateAsync({
        chartImage: chartBase64,
        pdfFiles: pdfContents,
        bossComments,
        expertNotes,
        otherMaterials,
        framework,
      });

      setGeneratedWording(result.wording);
      setStep("output");
      toast.success("Wording generated successfully!");
    } catch (error) {
      toast.error("Failed to generate wording. Please try again.");
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyWording = () => {
    navigator.clipboard.writeText(generatedWording);
    toast.success("Copied to clipboard!");
  };

  const handleRegenerate = async () => {
    setIsGenerating(true);
    try {
      const chartBase64 = chartPreview || "";
      const pdfContents: string[] = [];
      
      for (const pdf of pdfFiles) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(pdf);
        });
        pdfContents.push(base64);
      }

      const result = await generateWording.mutateAsync({
        chartImage: chartBase64,
        pdfFiles: pdfContents,
        bossComments,
        expertNotes,
        otherMaterials,
        framework,
      });

      setGeneratedWording(result.wording);
      toast.success("Wording regenerated!");
    } catch (error) {
      toast.error("Failed to regenerate. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartOver = () => {
    setStep("input");
    setGeneratedWording("");
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
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => { setChartImage(null); setChartPreview(null); }}
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

                <Separator className="my-6" />

                <div className="space-y-4">
                  <Label>Framework Selection</Label>
                  <Select value={framework} onValueChange={(v) => setFramework(v as Framework)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakdown">By Breakdown (Segment-based)</SelectItem>
                      <SelectItem value="time">By Time Period</SelectItem>
                      <SelectItem value="hybrid">Hybrid (Breakdown × Time)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {framework === "breakdown" && "Organize bullets by market segments (e.g., Mass, Mid, Premium)"}
                    {framework === "time" && "Organize bullets by time periods (e.g., '19-'24, '24-'29)"}
                    {framework === "hybrid" && "Combine segment analysis with time-based evolution"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Right Column: Text Inputs */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Research Materials
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="boss" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="boss">Boss</TabsTrigger>
                      <TabsTrigger value="pdf">PDFs</TabsTrigger>
                      <TabsTrigger value="expert">Expert</TabsTrigger>
                      <TabsTrigger value="other">Other</TabsTrigger>
                    </TabsList>

                    <TabsContent value="boss" className="mt-4">
                      <div className="space-y-2">
                        <Label>Boss Comments</Label>
                        <Textarea
                          placeholder="Enter your boss's comments about the market trends..."
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
                            <input
                              type="file"
                              accept=".pdf"
                              multiple
                              onChange={handlePdfUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {pdfFiles.length > 0 && (
                          <div className="space-y-2">
                            {pdfFiles.map((file, index) => (
                              <div 
                                key={index}
                                className="flex items-center justify-between p-2 bg-muted rounded-lg"
                              >
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-primary" />
                                  <span className="text-sm truncate max-w-[200px]">{file.name}</span>
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

              <Button 
                className="w-full" 
                size="lg"
                onClick={handleGenerate}
                disabled={!chartImage || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Wording...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Wording
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Output */}
        {step === "output" && (
          <div className="max-w-4xl mx-auto">
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

                <Separator className="my-6" />

                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Format:</span> {framework === "breakdown" ? "By Segment" : framework === "time" ? "By Time" : "Hybrid"}
                  </div>
                  <Button variant="ghost" onClick={handleStartOver}>
                    Start Over
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
