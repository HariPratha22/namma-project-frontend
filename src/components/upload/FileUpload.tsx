import { useState, useCallback } from "react";
import { Upload, File, X, FileText, Table, CheckCircle2, AlertCircle, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useProject } from "@/contexts/ProjectContext";
import { useNavigate } from "react-router-dom";
import { uploadFile, detectPIIFromFile, parseUploadError } from "@/api/upload";
import type { FileUploadResponse } from "@/api/upload";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "uploading" | "processing" | "complete" | "error";
  progress: number;
  recordsFound?: number;
  columns?: string[];
  rows?: Record<string, string>[];
  errorMessage?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const getFileIcon = (type: string) => {
  if (type.includes("csv") || type.includes("excel") || type.includes("spreadsheet")) {
    return Table;
  }
  if (type.includes("json") || type.includes("text")) {
    return FileText;
  }
  return File;
};

export const FileUpload = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const { currentProject } = useProject();

  /**
   * Upload file to backend for real parsing.
   * Returns columns, rows, and record_count from the server.
   */
  const processFile = async (file: File) => {
    const fileId = Math.random().toString(36).substr(2, 9);
    const newFile: UploadedFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type || file.name.split('.').pop() || '',
      status: "uploading",
      progress: 0,
    };

    setFiles((prev) => [...prev, newFile]);

    if (!currentProject?.id) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, status: "error", errorMessage: "No project selected" }
            : f
        )
      );
      toast.error("No project selected. Please select a project first.");
      return;
    }

    // Simulate upload progress while the real upload happens
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 15, 90);
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, progress } : f))
      );
    }, 200);

    try {
      // Real upload to backend
      const result: FileUploadResponse = await uploadFile(
        String(currentProject.id),
        file
      );

      clearInterval(progressInterval);

      // Update with real parsed data
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "complete",
                progress: 100,
                recordsFound: result.record_count,
                columns: result.columns,
                rows: result.rows,
              }
            : f
        )
      );

      toast.success(
        `${file.name} parsed — ${result.record_count} record${result.record_count !== 1 ? "s" : ""} found (${result.columns.length} columns)`
      );
    } catch (error) {
      clearInterval(progressInterval);
      const msg = parseUploadError(error);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, status: "error", progress: 0, errorMessage: msg }
            : f
        )
      );
      toast.error(`Failed to upload ${file.name}: ${msg}`);
    }
  };

  /**
   * Trigger PII detection on all completed files.
   */
  const navigate = useNavigate();

  /**
   * Trigger PII detection on all completed files.
   */
  const handleStartDetection = async () => {
    if (!currentProject?.id) {
      toast.error("No project selected.");
      return;
    }

    const completedFiles = files.filter(
      (f) => f.status === "complete" && f.columns && f.rows
    );

    if (completedFiles.length === 0) {
      toast.error("No parsed files available for detection.");
      return;
    }

    setIsDetecting(true);

    let totalDetected = 0;
    const allResults: any[] = [];
    const filesToPass = [];

    for (const file of completedFiles) {
      try {
        const tableName = file.name.replace(/\.[^/.]+$/, ""); // filename without extension
        const result = await detectPIIFromFile(
          String(currentProject.id),
          file.columns!,
          file.rows!,
          tableName
        );
        totalDetected += result.detected_fields;
        
        // Accumulate results
        allResults.push(...result.results);
        filesToPass.push({
          fileName: file.name,
          tableName,
          columns: file.columns,
          rows: file.rows,
        });

        toast.success(
          `${file.name}: Found ${result.detected_fields} PII field${result.detected_fields !== 1 ? "s" : ""}`
        );
      } catch (error) {
        const msg = parseUploadError(error);
        toast.error(`PII detection failed for ${file.name}: ${msg}`);
      }
    }

    setIsDetecting(false);

    if (totalDetected > 0) {
      toast.success(
        `PII Detection complete! Found ${totalDetected} PII field${totalDetected !== 1 ? "s" : ""} total. Redirecting...`
      );
      
      // Navigate to tracking page with the state containing file data and detected PII fields
      // This enforces the requirement: if file is uploaded -> DO NOT use database.
      navigate("/detection", {
        state: {
          isFileUpload: true,
          detectedData: allResults,
          filesData: filesToPass
        }
      });

    } else {
      toast.info("No PII fields detected in the uploaded files.");
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      droppedFiles.forEach(processFile);
    },
    [currentProject?.id]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    selectedFiles.forEach(processFile);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const hasCompletedFiles = files.some((f) => f.status === "complete");

  return (
    <Card className="glass-effect">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          File Upload
        </CardTitle>
        <CardDescription>
          Upload CSV, JSON, Excel, or text files for PII detection and masking
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-300",
            isDragging
              ? "border-primary bg-primary/5 scale-[1.02]"
              : "border-border hover:border-primary/50 hover:bg-secondary/50"
          )}
        >
          <input
            type="file"
            multiple
            accept=".csv,.json,.xlsx,.xls,.txt"
            onChange={handleFileSelect}
            className="absolute inset-0 cursor-pointer opacity-0"
          />

          <div
            className={cn(
              "rounded-full p-4 transition-all",
              isDragging ? "bg-primary/20 scale-110" : "bg-secondary"
            )}
          >
            <Upload
              className={cn(
                "h-8 w-8 transition-colors",
                isDragging ? "text-primary" : "text-muted-foreground"
              )}
            />
          </div>

          <p className="mt-4 text-lg font-medium">
            {isDragging ? "Drop files here" : "Drag & drop files here"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">or click to browse</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Supported formats: CSV, JSON, Excel, TXT
          </p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium">Uploaded Files</h4>
            {files.map((file) => {
              const FileIcon = getFileIcon(file.type);
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-4 rounded-lg border bg-card p-4"
                >
                  <div
                    className={cn(
                      "rounded-lg p-2",
                      file.status === "complete"
                        ? "bg-success/10"
                        : file.status === "error"
                        ? "bg-destructive/10"
                        : "bg-primary/10"
                    )}
                  >
                    <FileIcon
                      className={cn(
                        "h-5 w-5",
                        file.status === "complete"
                          ? "text-success"
                          : file.status === "error"
                          ? "text-destructive"
                          : "text-primary"
                      )}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{file.name}</p>
                      {file.status === "complete" && (
                        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      )}
                      {file.status === "error" && (
                        <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                      {file.status === "uploading" && (
                        <span className="text-sm text-primary animate-pulse">
                          Uploading...
                        </span>
                      )}
                      {file.status === "processing" && (
                        <span className="text-sm text-warning animate-pulse">
                          Processing...
                        </span>
                      )}
                      {file.status === "error" && (
                        <span className="text-sm text-destructive">
                          {file.errorMessage || "Upload failed"}
                        </span>
                      )}
                      {file.recordsFound !== undefined && (
                        <span className="text-sm text-success">
                          {file.recordsFound} records found
                        </span>
                      )}
                      {file.columns && (
                        <span className="text-sm text-muted-foreground">
                          ({file.columns.length} columns)
                        </span>
                      )}
                    </div>
                    {file.status === "uploading" && (
                      <Progress value={file.progress} className="mt-2 h-1.5" />
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(file.id)}
                    className="flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Start PII Detection Button */}
        {hasCompletedFiles && (
          <Button
            className="w-full gradient-primary"
            onClick={handleStartDetection}
            disabled={isDetecting}
          >
            {isDetecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Detecting PII...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Start PII Detection
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
