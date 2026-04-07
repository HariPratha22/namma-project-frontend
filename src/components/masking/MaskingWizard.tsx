import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ProcessingVisualization } from "./ProcessingVisualization";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon } from "lucide-react";
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  EyeOff,
  CheckCircle2,
  Download,
  Database,
  Loader2,
  Settings
} from "lucide-react";
import { useProject, DetectedField } from "@/contexts/ProjectContext";

import { toast } from "sonner";
import { useSearch } from "@/contexts/SearchContext";
import { exportMaskedData, resolveBackendTechnique, parseMaskingError, applyProtection, pushToSourceDatabase } from "@/api/masking";

type WizardStep = 1 | 2 | 3;

type ProtectionMethod = "masking" | "anonymization" | "";

interface FieldConfig {
  method: ProtectionMethod;
  technique: string;
  parameters: {
    masking_character?: string;
    replacement_character?: string;
    keep_last_digits?: string;
    visible_prefix?: string;
    visible_suffix?: string;
    tokenFormat?: string;
    mask_day?: boolean;
    mask_month?: boolean;
    noise_percentage?: string;
  };
}

interface SelectedField extends DetectedField {
  selected: boolean;
  config: FieldConfig;
}

interface ProcessingField {
  field: SelectedField;
  status: "pending" | "processing" | "complete";
  progress: number;
}

const maskingTechniques = [
  { value: "partial_masking", label: "Partial Masking" },
  { value: "redaction", label: "Redaction" },
  { value: "character_replacement", label: "Character Replacement" },
  { value: "tokenization", label: "Tokenization" },
  { value: "shuffling", label: "Shuffling" },
  { value: "nulling", label: "Nulling" },
  { value: "date_masking", label: "Date Masking" },
  { value: "data_perturbation", label: "Data Perturbation" },
];

const anonymizationTechniques = [
  { value: "data_generalization", label: "Data Generalization" },
  { value: "randomization", label: "Randomization" },
  { value: "hashing", label: "Hashing (SHA256)" },
  { value: "swapping", label: "Swapping" },
  { value: "noise_addition", label: "Noise Addition" },
  { value: "k_anonymity", label: "K-Anonymity" },
  { value: "l_diversity", label: "L-Diversity" },
  { value: "pseudonymization", label: "Pseudonymization" },
];

const maskingCharacters = [
  { value: "*", label: "Asterisk (*)" },
  { value: "#", label: "Hash (#)" },
  { value: "X", label: "X Character" },
  { value: "•", label: "Bullet (•)" },
];

const tokenFormats = [
  { value: "uuid", label: "UUID Format" },
  { value: "alphanumeric", label: "Alphanumeric" },
  { value: "numeric", label: "Numeric Only" },
  { value: "prefix", label: "Prefixed Token" },
];

const generalizationLevels = [
  { value: "low", label: "Low (Keep most detail)" },
  { value: "medium", label: "Medium (Moderate generalization)" },
  { value: "high", label: "High (Maximum generalization)" },
];

const suppressionBehaviors = [
  { value: "null", label: "Replace with NULL" },
  { value: "empty", label: "Replace with Empty" },
  { value: "placeholder", label: "Replace with [REDACTED]" },
];

export const MaskingWizard = () => {
  const { detectedFields, currentProject } = useProject();
  const { searchQuery } = useSearch(); // Use global search
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const isDatabaseSource = !localStorage.getItem("uploadedFilesData");
  const [selectedFields, setSelectedFields] = useState<SelectedField[]>(
    detectedFields.map(f => ({
      ...f,
      selected: false,
      config: {
        method: "",
        technique: "",
        parameters: {}
      }
    }))
  );
  // Remove redundant local search query

  // PASTE THIS ENTIRE BLOCK RIGHT HERE:
  const handlePushToDatabase = async () => {
    if (!isDatabaseSource) {
      toast.error("Push to database is only available for database-connected projects.");
      return;
    }

    try {
      // This now sends the request with your token!
      const result = await pushToSourceDatabase(currentProject.id.toString());
      toast.success(result.message || "Successfully pushed masked data to the database!");
    } catch (error: any) {
      console.error(error);
      const errorMsg = error?.message || "Failed to push to database. Please check your connection.";
      toast.error(errorMsg);
    }
  };
  const [progress, setProgress] = useState(0);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [processingFields, setProcessingFields] = useState<ProcessingField[]>([]);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(0);
  const processingRef = useRef<boolean>(false);
  const [backendLogs, setBackendLogs] = useState<string[]>([]);

  // Global Progress managed by ProcessingVisualization component

  const getSelectedFields = () => selectedFields.filter(f => f.selected);
  const selectedCount = getSelectedFields().length;

  const filteredFields = (selectedFields || []).filter(field =>
    (field?.field_name || "").toLowerCase().includes((searchQuery || "").toLowerCase()) ||
    (field?.field_type || "").toLowerCase().includes((searchQuery || "").toLowerCase()) ||
    (field?.table_name || "").toLowerCase().includes((searchQuery || "").toLowerCase())
  );

  const handleFieldToggle = (fieldId: string) => {
    setSelectedFields(prev =>
      prev.map(f => f.id === fieldId ? { ...f, selected: !f.selected } : f)
    );
  };

  const handleSelectAll = () => {
    const allSelected = selectedFields.every(f => f.selected);
    setSelectedFields(prev => prev.map(f => ({ ...f, selected: !allSelected })));
  };

  const updateFieldMethod = (fieldId: string, method: ProtectionMethod) => {
    setSelectedFields(prev =>
      prev.map(f => f.id === fieldId
        ? { ...f, config: { method, technique: "", parameters: {} } }
        : f
      )
    );
  };

  const updateFieldTechnique = (fieldId: string, technique: string) => {
    setSelectedFields(prev =>
      prev.map(f => f.id === fieldId
        ? {
          ...f,
          config: {
            ...f.config,
            technique,
            parameters: getInitialParameters(technique)
          }
        }
        : f
      )
    );
  };

  const getInitialParameters = (technique: string) => {
    switch (technique) {
      case 'character_replacement':
        return { replacement_character: 'X', keep_last_digits: '4' };
      case 'partial_masking':
        return { masking_character: '*', visible_prefix: '2', visible_suffix: '2' };
      case 'tokenization':
        return { tokenFormat: 'UUID' };
      case 'date_masking':
        return { mask_day: true, mask_month: true };
      case 'data_perturbation':
        return { noise_percentage: '5' };
      default:
        return {};
    }
  };

  const updateFieldParameter = (fieldId: string, paramKey: string, value: string) => {
    setSelectedFields(prev =>
      prev.map(f => f.id === fieldId
        ? {
          ...f,
          config: {
            ...f.config,
            parameters: { ...f.config.parameters, [paramKey]: value }
          }
        }
        : f
      )
    );
  };

  // Check if a field needs a parameter based on its technique
  const fieldNeedsParameter = (field: SelectedField): boolean => {
    const { technique } = field.config;
    if (technique === "character_replacement") return true;
    if (technique === "partial_masking") return true;
    if (technique === "tokenization") return true;
    if (technique === "date_masking") return true;
    if (technique === "data_perturbation") return true;
    return false;
  };

  // Check if a field has its required parameter set
  const fieldHasRequiredParameter = (field: SelectedField): boolean => {
    const { technique, parameters } = field.config;

    if (technique === "character_replacement") {
      return !!parameters.replacement_character;
    }
    if (technique === "partial_masking") {
      return !!parameters.masking_character;
    }
    if (technique === "tokenization") {
      return !!parameters.tokenFormat; // Using tokenFormat as requested
    }
    if (technique === "data_perturbation") {
      return !!parameters.noise_percentage;
    }
    return true;
  };

  // Check if current field is fully configured
  const isCurrentFieldConfigured = (): boolean => {
    const fieldsToConfig = getSelectedFields();
    if (fieldsToConfig.length === 0 || currentFieldIndex >= fieldsToConfig.length) return false;
    const currentField = fieldsToConfig[currentFieldIndex];
    return (
      currentField.config.method !== "" &&
      currentField.config.technique !== "" &&
      fieldHasRequiredParameter(currentField)
    );
  };

  // Check if all fields are configured
  const allFieldsConfigured = (): boolean => {
    return getSelectedFields().every(f =>
      f.config.method !== "" &&
      f.config.technique !== "" &&
      fieldHasRequiredParameter(f)
    );
  };

  // Validation for each step
  const canProceedStep1 = selectedCount > 0;

  const handleNextField = () => {
    const fieldsToConfig = getSelectedFields();
    if (currentFieldIndex < fieldsToConfig.length - 1) {
      setCurrentFieldIndex(prev => prev + 1);
    } else {
      // All fields configured, proceed to step 3
      setCurrentStep(3);
    }
  };

  const handlePrevField = () => {
    if (currentFieldIndex > 0) {
      setCurrentFieldIndex(prev => prev - 1);
    } else {
      // Go back to step 1
      setCurrentStep(1);
    }
  };

  // Called by ProcessingVisualization when a single field simulation completes
  const handleSingleFieldComplete = (fieldId: string) => {
    setProcessingFields(prev => prev.map(pf =>
      pf.field.id === fieldId
        ? { ...pf, status: "complete" as const, progress: 100 }
        : pf
    ));
  };

  // Called by ProcessingVisualization when ALL field simulations complete
  const handleAllFieldsComplete = () => {
    setProcessingFields(prev => prev.map(pf => ({
      ...pf,
      status: "complete" as const,
      progress: 100
    })));

    setIsProcessing(false);
    setIsComplete(true);

    toast.success("Data protection applied successfully!");
    // 🔥 THIS IS THE ACTUAL FIX
    window.dispatchEvent(new Event("dashboardRefresh"));
  };

  const handleProtect = async () => {
    if (!currentProject) return;

    setIsProcessing(true);
    processingRef.current = true;
    setBackendLogs([]);

    try {
      const fields = getSelectedFields();
      const collectedLogs: string[] = [];
      const collectedMaskedData: any[] = [];

      // CALL REAL BACKEND PROTECTION
      // We process each field to ensure they use their specific techniques
      for (const field of fields) {
        let source: "file" | "database" = "database";
        let tableData = null;

        const uploadedStr = localStorage.getItem("uploadedFilesData");
        if (uploadedStr) {
          const uploadedArr = JSON.parse(uploadedStr);
          const fileData = uploadedArr.find((f: any) => f.tableName === field.table_name);
          if (fileData) {
            source = "file";
            tableData = {
               fields: fileData.columns,
               records: fileData.rows
            };
          }
        }

        const result = await applyProtection(
          currentProject.id.toString(),
          field.config.method as "masking" | "anonymization",
          field.config.technique,
          field.table_name,
          [field.field_name], // Send as array per Bug 1 requirements
          field.config.parameters,
          source,
          tableData
        );

        // Capture algorithm-level logs from backend response
        if (result.logs && Array.isArray(result.logs)) {
          collectedLogs.push(...result.logs);
        }

        // Capture in-memory masked data if it exists
        if (result.masked_data && Array.isArray(result.masked_data)) {
           collectedMaskedData.push(...result.masked_data);
        }
      }

      setBackendLogs(collectedLogs);

      // Save to localStorage if we used the upload flow
      const uploadedStr = localStorage.getItem("uploadedFilesData");
      if (uploadedStr && collectedMaskedData.length > 0) {
        localStorage.setItem("maskedUploadedData", JSON.stringify(collectedMaskedData));
      }

      const fieldsToProcess = fields.map(f => ({
        field: f,
        status: "processing" as const,
        progress: 0
      }));

      setProcessingFields(fieldsToProcess);
      setCurrentProcessingIndex(0);
    } catch (err) {
      console.error(err);
      toast.error(parseMaskingError(err));
      setIsProcessing(false);
      processingRef.current = false;
    }
  };

  const handleExport = async (format: 'csv' | 'json' | 'excel') => {
    if (!currentProject) return;
    console.log("CURRENT PROJECT:", currentProject);
    console.log("PROJECT ID:", currentProject?.id);

    try {
      setIsExporting(true);
      const fields = selectedFields.filter(f => f.selected);
      const fieldTechniques: Record<string, string> = {};
      fields.forEach(f => {
        fieldTechniques[f.field_name] = f.config.technique;
      });

      await exportMaskedData(currentProject.id.toString(), format);
      setShowExportDialog(false);
      toast.success(`${format.toUpperCase()} export started`);
    } catch (err) {
      console.error(err);
      toast.error(parseMaskingError(err));
    } finally {
      setIsExporting(false);
    }
  };

  if (detectedFields.length === 0) {
    return (
      <Card className="glass-effect">
        <CardContent className="py-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No PII Fields Detected</h3>
          <p className="text-muted-foreground">
            Please scan your database for PII fields first
          </p>
          <Button className="mt-4" onClick={() => window.location.href = '/detection'}>
            Go to PII Detection
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stepLabels = ["Select Fields", "Configure Protection", "Protect Data"];
  const fieldsToConfig = getSelectedFields();
  const currentField = fieldsToConfig[currentFieldIndex];

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <Card className="glass-effect">
        <CardContent className="py-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium">Step {currentStep} of 3</span>
            <span className="text-sm text-muted-foreground">
              {stepLabels[currentStep - 1]}
            </span>
          </div>
          <Progress value={(currentStep / 3) * 100} className="h-2" />
          <div className="flex justify-between mt-4">
            {[1, 2, 3].map(step => (
              <div
                key={step}
                className={`flex flex-col items-center gap-1 ${currentStep >= step ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= step ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'}`}>
                  {step}
                </div>
                <span className="text-xs hidden sm:block">
                  {step === 1 && "Select"}
                  {step === 2 && "Configure"}
                  {step === 3 && "Protect"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Select Fields */}
      {currentStep === 1 && (
        <Card className="glass-effect">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold">
              <EyeOff className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              Select PII Fields to Protect
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-300">
              Choose which fields you want to mask or anonymize
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedFields.every(f => f.selected) ? 'Deselect All' : 'Select All'}
              </Button>
              <Badge variant="secondary">{selectedCount} selected</Badge>
            </div>
            <div className="space-y-3 max-h-[400px] overflow-auto">
              {filteredFields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No fields match your search "{searchQuery}"
                </div>
              ) : (
                filteredFields.map((field) => (
                  <div
                    key={field.id}
                    className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${field.selected ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                      }`}
                  >
                    <Checkbox
                      id={field.id}
                      checked={field.selected}
                      onCheckedChange={() => handleFieldToggle(field.id)}
                    />
                    <Label htmlFor={field.id} className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{field.field_name}</span>
                        <Badge variant="outline" className="text-xs">{field.field_type}</Badge>
                      </div>
                      {field.table_name && (
                        <span className="text-xs text-muted-foreground">
                          Table: {field.table_name}
                        </span>
                      )}
                    </Label>
                    <Badge
                      variant={field.confidence >= 90 ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {field.confidence}% confidence
                    </Badge>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end pt-4">
              <Button
                onClick={() => {
                  setCurrentFieldIndex(0);
                  setCurrentStep(2);
                }}
                disabled={!canProceedStep1}
                className="gradient-primary"
              >
                Next <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Sequential Field-by-Field Configuration */}
      {currentStep === 2 && currentField && (
        <Card className="glass-effect">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold">
              <Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              Configure Protection
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-300">
              Field {currentFieldIndex + 1} of {fieldsToConfig.length}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Single Field Display */}
            <div className="border rounded-lg p-6 space-y-6">
              {/* Field Name - Read Only */}
              <div className="text-center border-b pb-4">
                <span
                  className="font-mono text-xl font-semibold text-foreground select-none pointer-events-none"
                  style={{ cursor: 'default' }}
                >
                  {currentField.field_name}
                </span>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">{currentField.field_type}</Badge>
                  {currentField.table_name && (
                    <span className="text-xs text-muted-foreground">
                      ({currentField.table_name})
                    </span>
                  )}
                </div>
              </div>

              {/* Method Selection - Two Buttons */}
              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground">1. Select Protection Method</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={currentField.config.method === 'masking' ? 'default' : 'outline'}
                    className={`justify-start h-auto py-4 ${currentField.config.method === 'masking'
                      ? 'bg-primary text-primary-foreground'
                      : ''
                      }`}
                    onClick={() => updateFieldMethod(currentField.id, 'masking')}
                  >
                    <EyeOff className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <div className="font-medium">Data Masking</div>
                      <div className="text-xs opacity-80">Partially or fully hide data</div>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant={currentField.config.method === 'anonymization' ? 'default' : 'outline'}
                    className={`justify-start h-auto py-4 ${currentField.config.method === 'anonymization'
                      ? 'bg-primary text-primary-foreground'
                      : ''
                      }`}
                    onClick={() => updateFieldMethod(currentField.id, 'anonymization')}
                  >
                    <Shield className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <div className="font-medium">Anonymization</div>
                      <div className="text-xs opacity-80">Remove or replace data entirely</div>
                    </div>
                  </Button>
                </div>
              </div>

              {/* Technique Selection - Only show after method is selected */}
              {currentField.config.method && (
                <div className="space-y-3">
                  <Label className="text-sm text-muted-foreground">2. Select Technique</Label>
                  <Select
                    value={currentField.config.technique}
                    onValueChange={(value) => updateFieldTechnique(currentField.id, value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a technique" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      {(currentField.config.method === 'masking' ? maskingTechniques : anonymizationTechniques).map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Parameter Selection - Only show after technique is selected and needs params */}
              {currentField.config.technique && fieldNeedsParameter(currentField) && (
                <div className="space-y-3">
                  {/* Character Replacement Parameters */}
                  {currentField.config.technique === 'character_replacement' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Replacement Character</Label>
                        <Select
                          value={currentField.config.parameters.replacement_character || "X"}
                          onValueChange={(value) => updateFieldParameter(currentField.id, 'replacement_character', value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select character" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border z-50">
                            {maskingCharacters.map(c => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Keep Last Digits</Label>
                        <Select
                          value={currentField.config.parameters.keep_last_digits || "4"}
                          onValueChange={(value) => updateFieldParameter(currentField.id, 'keep_last_digits', value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Visible count" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border z-50">
                            {["0", "1", "2", "3", "4", "5", "6"].map(v => (
                              <SelectItem key={v} value={v}>{v} Digits</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Partial Masking Parameters */}
                  {currentField.config.technique === 'partial_masking' && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Masking Character</Label>
                        <Select
                          value={currentField.config.parameters.masking_character || "*"}
                          onValueChange={(value) => updateFieldParameter(currentField.id, 'masking_character', value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select character" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border z-50">
                            {maskingCharacters.map(c => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Visible Prefix</Label>
                          <Select
                            value={currentField.config.parameters.visible_prefix || "2"}
                            onValueChange={(value) => updateFieldParameter(currentField.id, 'visible_prefix', value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Chars" />
                            </SelectTrigger>
                            <SelectContent className="bg-background border z-50">
                              {["0", "1", "2", "3", "4"].map(v => (
                                <SelectItem key={v} value={v}>{v} Chars</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Visible Suffix</Label>
                          <Select
                            value={currentField.config.parameters.visible_suffix || "2"}
                            onValueChange={(value) => updateFieldParameter(currentField.id, 'visible_suffix', value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Chars" />
                            </SelectTrigger>
                            <SelectContent className="bg-background border z-50">
                              {["0", "1", "2", "3", "4"].map(v => (
                                <SelectItem key={v} value={v}>{v} Chars</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tokenization Parameters */}
                  {currentField.config.technique === 'tokenization' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Token Format</Label>
                      <Select
                        value={currentField.config.parameters.tokenFormat || "UUID"}
                        onValueChange={(value) => updateFieldParameter(currentField.id, 'tokenFormat', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                        <SelectContent className="bg-background border z-50">
                          <SelectItem value="UUID">Standard UUID</SelectItem>
                          <SelectItem value="RANDOM">Random Alphanumeric</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Date Masking Parameters */}
                  {currentField.config.technique === 'date_masking' && (
                    <div className="flex items-center gap-6 py-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="mask_day"
                          checked={currentField.config.parameters.mask_day !== false}
                          onCheckedChange={(checked) => updateFieldParameter(currentField.id, 'mask_day', checked ? 'true' : 'false')}
                        />
                        <Label htmlFor="mask_day" className="text-sm">Mask Day</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="mask_month"
                          checked={currentField.config.parameters.mask_month !== false}
                          onCheckedChange={(checked) => updateFieldParameter(currentField.id, 'mask_month', checked ? 'true' : 'false')}
                        />
                        <Label htmlFor="mask_month" className="text-sm">Mask Month</Label>
                      </div>
                    </div>
                  )}

                  {/* Data Perturbation Parameters */}
                  {currentField.config.technique === 'data_perturbation' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Noise Percentage (%)</Label>
                      <Select
                        value={currentField.config.parameters.noise_percentage || "5"}
                        onValueChange={(value) => updateFieldParameter(currentField.id, 'noise_percentage', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select %" />
                        </SelectTrigger>
                        <SelectContent className="bg-background border z-50">
                          {["1", "5", "10", "15", "20"].map(v => (
                            <SelectItem key={v} value={v}>{v}% variation</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* No additional params message */}
              {currentField.config.technique && !fieldNeedsParameter(currentField) && (
                <p className="text-sm text-muted-foreground italic text-center py-2">
                  No additional configuration needed for this technique.
                </p>
              )}

              {/* Configuration status indicator */}
              {isCurrentFieldConfigured() && (
                <div className="flex items-center justify-center gap-2 text-sm text-accent pt-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Field Configured</span>
                </div>
              )}
            </div>

            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2">
              {fieldsToConfig.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-all ${idx === currentFieldIndex
                    ? 'bg-primary w-4'
                    : idx < currentFieldIndex
                      ? 'bg-accent'
                      : 'bg-muted'
                    }`}
                />
              ))}
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handlePrevField}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                {currentFieldIndex === 0 ? 'Back to Selection' : 'Previous Field'}
              </Button>
              <Button
                onClick={handleNextField}
                disabled={!isCurrentFieldConfigured()}
                className="gradient-primary"
              >
                {currentFieldIndex === fieldsToConfig.length - 1 ? 'Proceed to Protect' : 'Next Field'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Protect Data with Field-by-Field Processing */}
      {currentStep === 3 && (
        <Card className="glass-effect">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Protect Your Data
            </CardTitle>
            <CardDescription>
              {isProcessing
                ? "Processing your data field by field..."
                : isComplete
                  ? "Protection applied successfully!"
                  : "Review and apply protection to your selected fields"
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isComplete && !isProcessing && (
              <>
                {/* Summary before processing */}
                <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">Protection Summary</h4>
                  <div className="space-y-2 max-h-[300px] overflow-auto">
                    {getSelectedFields().map(field => (
                      <div key={field.id} className="flex items-center justify-between text-sm border-b pb-2">
                        <span className="font-mono select-none">{field.field_name}</span>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-xs">
                            {field.config.method === 'masking' ? 'Masking' : 'Anonymization'}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {field.config.technique}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => {
                    setCurrentFieldIndex(fieldsToConfig.length - 1);
                    setCurrentStep(2);
                  }}>
                    <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                  </Button>
                  <Button
                    onClick={handleProtect}
                    className="gradient-primary"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Protect Your Data
                  </Button>
                </div>
              </>
            )}

            {/* Processing View - Single Execution Flow */}
            {isProcessing && (
              <div className="flex flex-col gap-6 max-w-4xl mx-auto">
                {/* 1. Global Progress Bar */}
                <div className="bg-secondary/30 rounded-xl p-5 border border-border/50 animate-in fade-in duration-500">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground italic flex items-center gap-2">
                      <Settings className="w-3 h-3 animate-spin" /> System Progress
                    </span>
                    <span className="text-sm font-black text-purple-600 dark:text-purple-400">{progress}% Completed</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3 overflow-hidden shadow-inner">
                    <div
                      className="bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* 2. Professional Execution Console */}
                <div className="w-full animate-in slide-in-from-bottom-2 duration-700 delay-150">
                  <ProcessingVisualization
                    isProcessing={isProcessing}
                    allFields={processingFields}
                    onProgress={(p) => setProgress(p)}
                    onComplete={() => {
                        // All steps recorded, final pause
                        setTimeout(() => handleAllFieldsComplete(), 1000);
                    }}
                    backendLogs={backendLogs}
                  />
                </div>

                {/* 3. Field Status List (Below Console) */}
                <div className="space-y-4 animate-in fade-in duration-1000 delay-300">
                  <div className="flex items-center gap-2 border-b border-border/50 pb-2">
                    <Shield className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-bold uppercase text-muted-foreground">Target Field Status</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-auto pr-2 custom-scrollbar">
                    {processingFields.map((pf) => (
                      <div
                        key={pf.field.id}
                        className={cn(
                          "border rounded-xl p-4 transition-all duration-700",
                          pf.status === 'processing' ? "border-purple-500/50 bg-purple-500/5 shadow-[0_0_15px_rgba(139,92,246,0.1)] scale-[1.02]" :
                          pf.status === 'complete' ? "border-accent/40 bg-accent/5 opacity-100" : 
                          "bg-secondary/10 opacity-40 border-dashed"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500",
                              pf.status === 'complete' ? "bg-accent/20 text-accent scale-110" : 
                              pf.status === 'processing' ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 animate-pulse" : 
                              "bg-gray-100 dark:bg-gray-800 text-gray-400"
                            )}>
                              {pf.status === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                            </div>
                            <div>
                              <p className="font-mono text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">{pf.field.field_name}</p>
                              <div className="flex gap-2 mt-1">
                                <Badge variant="outline" className="text-[9px] uppercase tracking-tighter h-4 px-1">{pf.field.config.technique}</Badge>
                                {pf.status === 'complete' && (
                                  <span className="text-[10px] text-accent font-bold flex items-center gap-1">
                                    <span className="w-1 h-1 rounded-full bg-accent animate-ping" /> VERIFIED
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Completion View */}
            {isComplete && (
              <>
                <div className="text-center py-8">
                  <CheckCircle2 className="h-16 w-16 mx-auto text-purple-600 dark:text-purple-400 mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Protection Applied Successfully!
                  </h3>
                  <p className="text-gray-700 dark:text-gray-300">
                    All {selectedCount} fields have been protected with your configured settings
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row justify-center items-center gap-6 mt-4">
                  {/* CASE 1: DATABASE SOURCE - Show both buttons */}
                  {isDatabaseSource && (
                    <Button
                      variant="outline"
                      className="w-full sm:w-[280px] h-[72px] bg-white dark:bg-[#0F172A]/80 border-gray-200 dark:border-[#1E293B] hover:bg-purple-500/10 hover:border-purple-500/50 text-gray-900 dark:text-white transition-all shadow-lg flex items-center justify-start px-6"
                      onClick={handlePushToDatabase}
                    >
                      <Database className="mr-4 h-6 w-6 text-purple-600 dark:text-purple-400 shrink-0" />
                      <div className="text-left">
                        <div className="font-bold text-base">Push to Database</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Update source database</div>
                      </div>
                    </Button>
                  )}

                  {/* CASE 2: Always show Export File button, centered if single */}
                  <Button
                    className="w-full sm:w-[280px] h-[72px] bg-gradient-to-r from-purple-600 to-indigo-600 hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/40 transition-all text-white border-0 flex items-center justify-start px-6"
                    onClick={() => setShowExportDialog(true)}
                  >
                    <Download className="mr-4 h-6 w-6 shrink-0" />
                    <div className="text-left">
                      <div className="font-bold text-base">Export File</div>
                      <div className="text-xs text-white/80">Download protected data</div>
                    </div>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden glass-effect">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-gray-900 dark:text-white font-semibold">Export Protected Data</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-300">Choose your preferred file format</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <Button
                variant="outline"
                className="w-full justify-start border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white transition-all font-medium py-6"
                onClick={() => handleExport('csv')}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4 text-violet-500" />}
                CSV Format (.csv)
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white transition-all font-medium py-6"
                onClick={() => handleExport('json')}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4 text-violet-500" />}
                JSON Format (.json)
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white transition-all font-medium py-6"
                onClick={() => handleExport('excel')}
                disabled={isExporting}
              >
                <Download className="mr-2 h-4 w-4 text-violet-500" />
                Excel Format (.xlsx)
              </Button>
              
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <Button
                  variant="ghost"
                  className="w-full text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => setShowExportDialog(false)}
                  disabled={isExporting}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
