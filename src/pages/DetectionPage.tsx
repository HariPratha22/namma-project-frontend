import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Scan, CheckCircle2, Mail, Phone, CreditCard, MapPin, User, Hash, Shield, ArrowRight, Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProject, DetectedField } from "@/contexts/ProjectContext";
import { useNavigate, useLocation } from "react-router-dom";
import { startPiiScan, fetchScanResults, parseScanError } from "@/api/piiScan";
import { useSearch } from "@/contexts/SearchContext";
import { Input } from "@/components/ui/input";

// PII field types we can detect (showing only field names, never actual data)
const piiFieldTypes = [
  { type: "Email", icon: Mail, fields: ["email", "user_email", "contact_email"] },
  { type: "Phone", icon: Phone, fields: ["phone", "phone_number", "mobile", "contact_number"] },
  { type: "SSN", icon: Hash, fields: ["ssn", "social_security_number", "tax_id"] },
  { type: "Credit Card", icon: CreditCard, fields: ["credit_card", "card_number", "payment_card"] },
  { type: "Address", icon: MapPin, fields: ["address", "street_address", "home_address", "mailing_address"] },
  { type: "Name", icon: User, fields: ["name", "full_name", "first_name", "last_name", "customer_name"] },
  { type: "Aadhaar", icon: Hash, fields: ["aadhaar", "aadhaar_number", "uid"] },
  { type: "PAN", icon: Hash, fields: ["pan", "pan_number", "pan_card"] },
];

// Map backend PII types to display names
const PII_TYPE_DISPLAY: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  card: "Credit Card",
  ssn: "SSN",
  name: "Name",
  address: "Address",
  other: "Other",
};

const DetectionPage = () => {
  const { currentProject, isConnected, detectedFields, setDetectedFields, scanStats, setScanStats } = useProject();
  const { searchQuery } = useSearch(); // Use global search
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [hasScanned, setHasScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Filter detected fields based on search query
  const filteredFields = (detectedFields || []).filter(field => 
    (field?.field_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (field?.field_type || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (field?.table_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tableCount = new Set((detectedFields || []).map(f => f?.table_name)).size;

  // Load existing scan results on mount or from navigation state
  useEffect(() => {
    const state = location.state as any;

    // IF FILE UPLOAD DATA IS PASSED -> DO NOT USE DATABASE
    if (state?.isFileUpload && state?.detectedData) {
      console.log("[DetectionPage] Using uploaded file data, bypassing database fetch.");
      
      // Store the raw file data in localStorage for Masking/Export to use instead of DB
      if (state.filesData) {
        localStorage.setItem("uploadedFilesData", JSON.stringify(state.filesData));
      }

      const fields: DetectedField[] = state.detectedData.map((r: any) => ({
        id: String(r.id),
        field_name: r.field_name,
        field_type: PII_TYPE_DISPLAY[r.pii_type] || r.pii_type,
        confidence: Math.round(r.confidence * (r.confidence <= 1 ? 100 : 1)),
        table_name: r.table_name,
      }));
      
      setDetectedFields(fields);
      setHasScanned(fields.length > 0);
      
      const uniqueTables = new Set(fields.map(f => f.table_name)).size;
      setScanStats({
        totalScans: scanStats.totalScans + 1,
        piiFieldsFound: fields.length,
        tablesScanned: uniqueTables,
      });

      // Clear the state so refreshing the page doesn't keep using old state 
      // if they navigate away and come back without states
      window.history.replaceState({}, document.title);
      return;
    }

    // NORMAL DB FLOW
    if (currentProject?.id) {
      localStorage.removeItem("uploadedFilesData");
      localStorage.removeItem("maskedUploadedData");
      loadScanResults();
    }
  }, [currentProject?.id, location.state]);

  // Load scan results from backend database
  const loadScanResults = async () => {
    if (!currentProject?.id) return;
    
    setIsLoadingResults(true);
    setScanError(null);
    
    try {
      const response = await fetchScanResults(currentProject.id);
      
      // Map backend response to DetectedField format
      const fields: DetectedField[] = response.results.map((r: any) => ({
        id: String(r.id),
        field_name: r.field_name,
        field_type: PII_TYPE_DISPLAY[r.pii_type] || r.pii_type,
        confidence: Math.round(r.confidence * 100),
        table_name: r.table_name,
      }));
      
      setDetectedFields(fields);
      setHasScanned(fields.length > 0 || response.count >= 0);
      
      // Update scan stats
      const uniqueTables = new Set(fields.map(f => f.table_name)).size;
      setScanStats({
        totalScans: scanStats.totalScans,
        piiFieldsFound: fields.length,
        tablesScanned: uniqueTables,
      });
    } catch (err) {
      console.warn('[DetectionPage] Failed to load scan results:', err);
    } finally {
      setIsLoadingResults(false);
    }
  };

  // Auto-start scanning if navigated from Database page with table(s) to scan
  useEffect(() => {
    const state = location.state as { autoScanTable?: string; autoScanTables?: string[]; isFileUpload?: boolean } | null;
    const shouldAutoScan = (state?.autoScanTable || state?.autoScanTables) && currentProject?.id && !isScanning && !hasScanned && !state?.isFileUpload;
    
    if (shouldAutoScan) {
      handleScan();
      // Clear the state to prevent re-scanning on subsequent renders
      window.history.replaceState({}, document.title);
    }
  }, [location.state, currentProject?.id]);

  const handleScan = async () => {
    if (!currentProject?.id) {
      toast.error("Please select a project first");
      navigate('/');
      return;
    }

    setIsScanning(true);
    setScanProgress(0);
    setScanError(null);
    setDetectedFields([]);

    // Simulate progress for better UX (backend scan is fast)
    const progressInterval = setInterval(() => {
      setScanProgress((prev) => Math.min(prev + 10, 90));
    }, 100);

    try {
      // Call real backend scan API
      const result = await startPiiScan(currentProject.id);
      
      clearInterval(progressInterval);
      setScanProgress(100);
      
      // Load the scan results
      await loadScanResults();
      
      setHasScanned(true);
      
      // Update scan stats
      setScanStats({
        totalScans: scanStats.totalScans + 1,
        piiFieldsFound: result.detected_fields,
        tablesScanned: scanStats.tablesScanned + 1,
      });
      
      if (result.detected_fields > 0) {
        toast.warning(`Found ${result.detected_fields} PII fields!`);
      } else {
        toast.success("No PII fields detected");
      }
    } catch (err) {
      clearInterval(progressInterval);
      setScanProgress(0);
      const errorMessage = parseScanError(err);
      setScanError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsScanning(false);
    }
  };

  const handleMaskData = () => {
    navigate('/masking');
  };

  if (!currentProject) {
    return (
      <Layout>
        <div className="space-y-6 opacity-0 animate-scaleIn">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">PII Detection</h1>
            <p className="text-muted-foreground mt-1">
              Scan your database for personally identifiable information
            </p>
          </div>
          <Card className="glass-effect">
            <CardContent className="py-12 text-center">
              <Scan className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Project Selected</h3>
              <p className="text-muted-foreground mb-4">
                Please select or create a project first
              </p>
              <Button onClick={() => navigate('/')}>
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 opacity-0 animate-scaleIn">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PII Detection</h1>
          <p className="text-muted-foreground mt-1">
            Scan your database for personally identifiable information
          </p>
          <Badge variant="outline" className="mt-2">
            Project: {currentProject.name}
          </Badge>
        </div>

        {/* Scan Error Alert */}
        {scanError && (
          <Card className="glass-effect border-red-500/50 bg-red-500/5">
            <CardContent className="py-6">
              <div className="flex items-center gap-3">
                <Database className="h-8 w-8 text-red-500" />
                <div>
                  <h3 className="font-semibold text-red-700 dark:text-red-400">
                    Scan Failed
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {scanError}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scan Section */}
        <Card className="glass-effect">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scan className="h-5 w-5 text-primary" />
              Scan for PII Fields
            </CardTitle>
            <CardDescription>
              Analyze your database tables to detect personally identifiable information fields using rule-based detection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isScanning && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Scanning database fields...</span>
                  <span>{scanProgress}%</span>
                </div>
                <Progress value={scanProgress} />
              </div>
            )}

            {isLoadingResults && !isScanning && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading previous scan results...
              </div>
            )}

            {!isScanning && !isLoadingResults && (
              <Button
                onClick={handleScan}
                disabled={isScanning}
                className="gradient-primary"
              >
                <Scan className="mr-2 h-4 w-4" />
                {hasScanned ? "Rescan for PII" : "Scan for PII"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Detection Results - Shows only field names, never actual data */}
        {hasScanned && (
          <Card className="glass-effect">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Detected PII Fields</CardTitle>
                  <CardDescription>
                    Field names identified as potentially containing personal information
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  {detectedFields.length > 0 && (
                    <Badge variant="destructive" className="text-lg px-3 py-1">
                      {detectedFields.length} fields found
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {detectedFields.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <p className="font-medium">No PII fields detected</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your database appears to be free of sensitive personal information
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 max-h-[400px] overflow-auto mb-6">
                    {filteredFields.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No fields match your search "{searchQuery}"
                      </div>
                    ) : (
                      filteredFields.map((field) => {
                        const typeInfo = piiFieldTypes.find(t => t.type === field.field_type);
                        const IconComponent = typeInfo?.icon || Hash;
                        
                        return (
                          <div
                            key={field.id}
                            className="flex items-center gap-3 rounded-lg border bg-card/50 p-4 transition-all hover:bg-secondary/50"
                          >
                            <div className="rounded-lg bg-danger/10 p-2">
                              <IconComponent className="h-4 w-4 text-danger" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-medium">{field.field_name}</span>
                                <Badge variant="outline">{field.field_type}</Badge>
                              </div>
                              {field.table_name && (
                                <span className="text-xs text-muted-foreground">
                                  Table: {field.table_name}
                                </span>
                              )}
                            </div>
                            <Badge 
                              variant={field.confidence >= 90 ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {field.confidence}% confidence
                            </Badge>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <Button onClick={handleMaskData} className="w-full gradient-primary" size="lg">
                    <Shield className="mr-2 h-5 w-5" />
                    Mask Your Data
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dynamic Scan Summary - Replaces static legend */}
        <Card className="glass-effect border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground font-medium">
                <Shield className="h-4 w-4 text-primary" />
                <span>Scan Summary:</span>
                <span className="text-foreground">
                  {detectedFields.length} sensitive fields detected across {tableCount} tables
                </span>
              </div>
              {searchQuery && (
                <Badge variant="secondary" className="font-normal text-[10px]">
                  Filtered by: "{searchQuery}"
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default DetectionPage;
