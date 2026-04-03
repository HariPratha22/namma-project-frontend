import { useEffect, useState } from "react";
import { Shield, Lock, CheckCircle2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExecutionLog } from "./ExecutionLog";

interface FieldSimulationProps {
  fieldName: string;
  method: "masking" | "anonymization" | "";
  technique: string;
  isActive: boolean;
  onComplete: () => void;
  /** Real backend algorithm logs for this field */
  externalLogs?: string[];
}

type Phase = "initializing" | "analyzing" | "detecting" | "selecting" | "applying" | "validating" | "completed";

const getSensitivityLevel = (fieldName: string): "Low" | "Medium" | "High" => {
  const highSensitivity = ["ssn", "aadhaar", "passport", "credit_card", "bank_account", "pan"];
  const mediumSensitivity = ["email", "phone", "address", "dob", "date_of_birth"];
  
  const normalizedName = fieldName.toLowerCase().replace(/[_\s-]/g, "");
  
  if (highSensitivity.some(f => normalizedName.includes(f))) return "High";
  if (mediumSensitivity.some(f => normalizedName.includes(f))) return "Medium";
  return "Low";
};

const getAlgorithmName = (method: string, technique: string): string => {
  if (method === "masking") {
    const algorithms: Record<string, string> = {
      "partial_masking": "PARTIAL-MASK-256",
      "redaction": "FULL-REDACT-512",
      "character_replacement": "CHAR-SUBSTITUTE-128",
      "shuffling": "SHUFFLE-PERMUTE-384",
      "tokenization": "TOKEN-VAULT-AES256",
      "nulling": "NULL-STUB-SHA512",
      "data_perturbation": "NOISE-LAPLACE-256",
      "date_masking": "DATE-SHIFT-128",
      "default": "MASK-STANDARD-256"
    };
    return algorithms[technique] || "MASK-STANDARD-256";
  } else {
    const algorithms: Record<string, string> = {
      "data_generalization": "K-ANON-GENERAL-512",
      "randomization": "RANDOM-NOISE-P384",
      "hashing": "SHA256-HASH-512",
      "swapping": "SWAP-RECORD-AES",
      "noise_addition": "LAPLACE-DP-256",
      "k_anonymity": "K-ANON-ALG-512",
      "l_diversity": "L-DIV-ALG-512",
      "pseudonymization": "PSEUDO-VAULT-SHA256",
      "default": "ANON-STANDARD-256"
    };
    return algorithms[technique] || "ANON-STANDARD-256";
  }
};

export const FieldSimulation = ({ 
  fieldName, 
  method, 
  technique,
  isActive,
  onComplete,
  externalLogs = []
}: FieldSimulationProps) => {
  const [phase, setPhase] = useState<Phase>("initializing");
  const [phaseProgress, setPhaseProgress] = useState({
    initializing: 0,
    analyzing: 0,
    detecting: 0,
    selecting: 0,
    applying: 0,
    validating: 0,
    completed: 0
  });
  const [isCompleted, setIsCompleted] = useState(false);
  const [recordsProcessed, setRecordsProcessed] = useState(0);

  useEffect(() => {
    if (!isActive || isCompleted) return;

    const baseTime = 3000 + Math.random() * 2000;
    const phaseTimings = {
      initializing: baseTime * 0.8,
      analyzing: baseTime * 1.2,
      detecting: baseTime * 1.5,
      selecting: baseTime * 1.0,
      applying: baseTime * 5.0,
      validating: baseTime * 1.5,
      completed: 500
    };

    const phases: Phase[] = ["initializing", "analyzing", "detecting", "selecting", "applying", "validating", "completed"];

    const runPhase = (phaseName: Phase, duration: number) => {
      return new Promise<void>((resolve) => {
        const steps = 30; 
        const stepDuration = duration / steps;
        let currentStep = 0;

        const interval = setInterval(() => {
          currentStep++;
          setPhaseProgress(prev => ({
            ...prev,
            [phaseName]: (currentStep / steps) * 100
          }));

          if (phaseName === "applying") {
            setRecordsProcessed(prev => prev + Math.floor(Math.random() * 80 + 40));
          }

          if (currentStep >= steps) {
            clearInterval(interval);
            resolve();
          }
        }, stepDuration);
      });
    };

    const runAllPhases = async () => {
      for (const phaseName of phases) {
        if (phaseName === "completed") {
          setPhase(phaseName);
          setIsCompleted(true);
          onComplete();
          break;
        }
        setPhase(phaseName);
        await runPhase(phaseName, phaseTimings[phaseName]);
      }
    };

    runAllPhases();
  }, [isActive, isCompleted, onComplete]);

  const sensitivityLevel = getSensitivityLevel(fieldName);
  const algorithmName = getAlgorithmName(method, technique);

  const phaseLabels: Record<Phase, string> = {
    initializing: "Initializing Engine",
    analyzing: "Analyzing Data Structure",
    detecting: "Detecting Sensitivity",
    selecting: "Selecting Algorithm",
    applying: "Applying Protection",
    validating: "Validating Output",
    completed: "Process Finalized"
  };

  const getPhaseStatus = (phaseName: Phase): "pending" | "active" | "complete" => {
    const phases: Phase[] = ["initializing", "analyzing", "detecting", "selecting", "applying", "validating", "completed"];
    const currentIndex = phases.indexOf(phase);
    const phaseIndex = phases.indexOf(phaseName);
    
    if (isCompleted || phaseProgress[phaseName] >= 100 || phaseIndex < currentIndex) return "complete";
    if (phaseIndex === currentIndex) return "active";
    return "pending";
  };

  return (
    <div className={cn(
      "rounded-lg border p-4 transition-all duration-300",
      isCompleted ? "border-accent/50 bg-accent/5" : isActive ? "border-primary/50 bg-primary/5 shadow-[0_0_15px_rgba(139,92,246,0.1)]" : "border-border/50 bg-secondary/20"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isCompleted ? (
            <Lock className="w-4 h-4 text-accent" />
          ) : isActive ? (
            <Activity className="w-4 h-4 text-primary animate-pulse" />
          ) : (
            <Shield className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">{fieldName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded font-medium uppercase",
            sensitivityLevel === "High" && "bg-destructive/20 text-destructive",
            sensitivityLevel === "Medium" && "bg-yellow-500/20 text-yellow-600",
            sensitivityLevel === "Low" && "bg-accent/20 text-accent"
          )}>
            {sensitivityLevel}
          </span>
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-accent" />}
        </div>
      </div>

      {/* Phase Indicators */}
      <div className="space-y-2">
        {(["initializing", "analyzing", "detecting", "selecting", "applying", "validating", "completed"] as Phase[]).map((phaseName) => {
          const status = getPhaseStatus(phaseName);
          return (
            <div key={phaseName} className="flex items-center gap-2">
              <div className="w-32 flex items-center gap-1.5">
                {status === "complete" && <CheckCircle2 className="w-3 h-3 text-accent flex-shrink-0" />}
                {status === "active" && (
                  <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin flex-shrink-0" />
                )}
                {status === "pending" && <div className="w-3 h-3 rounded-full border border-muted-foreground/30 flex-shrink-0" />}
                <span className={cn(
                  "text-[10px] truncate",
                  status === "complete" && "text-accent",
                  status === "active" && "text-primary font-bold",
                  status === "pending" && "text-muted-foreground/50"
                )}>
                  {phaseLabels[phaseName]}
                </span>
              </div>
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    status === "complete" && "bg-accent",
                    status === "active" && "bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]",
                    status === "pending" && "bg-transparent"
                  )}
                  style={{ width: `${phaseProgress[phaseName]}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Current Activity Detail */}
      {isActive && !isCompleted && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Algorithm</span>
            <span className="font-mono text-foreground">{algorithmName}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Technique</span>
            <span className="text-foreground">{technique.charAt(0).toUpperCase() + technique.slice(1)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Records</span>
            <span className="font-mono text-foreground">{recordsProcessed.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Completed State */}
      {isCompleted && (
        <div className="mt-3 pt-3 border-t border-accent/30 flex items-center justify-between">
          <span className="text-[10px] text-accent font-medium">Field Secured</span>
          <span className="text-[10px] text-muted-foreground">{recordsProcessed.toLocaleString()} records</span>
        </div>
      )}

      {/* Execution Log Panel — now uses REAL backend logs */}
      <ExecutionLog
        fieldName={fieldName}
        method={method}
        technique={technique}
        isActive={isActive}
        isCompleted={isCompleted}
        externalLogs={externalLogs}
      />
    </div>
  );
};
