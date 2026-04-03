import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// =============================================================================
// TYPES
// =============================================================================

interface ExecutionLogProps {
  /** The PII field being protected */
  fieldName: string;
  /** masking or anonymization */
  method: "masking" | "anonymization" | "";
  /** e.g. partial_masking, tokenization */
  technique: string;
  /** Whether the parent component is actively processing */
  isActive: boolean;
  /** Whether the parent component has finished */
  isCompleted: boolean;
  /** Real backend algorithm-level logs */
  externalLogs?: string[];
}

// =============================================================================
// PII SAFETY — mask raw sensitive values before display
// =============================================================================

const maskSensitiveValues = (text: string): string => {
  // Phone numbers (7+ consecutive digits)
  text = text.replace(/\b(\d{2})\d{4,}(\d{2})\b/g, "$1******$2");
  // Emails
  text = text.replace(
    /\b([a-zA-Z0-9._%+-]{2})[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    "$1****@$2"
  );
  // Aadhaar-like (12 digits)
  text = text.replace(/\b(\d{4})\s?\d{4}\s?(\d{4})\b/g, "$1 **** $2");
  // Quoted strings > 5 chars
  text = text.replace(/'([^']{2})[^']{4,}([^']{2})'/g, "'$1****$2'");
  return text;
};

// =============================================================================
// LOG LINE CLASSIFIER
// =============================================================================

interface ParsedLog {
  tag: string;
  message: string;
}

const parseLogLine = (raw: string): ParsedLog => {
  if (raw.includes("[ALGO STEP]")) {
    return { tag: "STEP", message: raw.replace(/^\[ALGO STEP\]\s*/, "") };
  }
  if (raw.includes("[ALGO]") && raw.toLowerCase().includes("status: completed")) {
    return { tag: "SUCCESS", message: raw.replace(/^\[ALGO\]\s*/, "") };
  }
  if (raw.includes("[ALGO]") && raw.toLowerCase().includes("algorithm:")) {
    return { tag: "ALGO", message: raw.replace(/^\[ALGO\]\s*/, "") };
  }
  if (raw.includes("[ALGO]")) {
    return { tag: "ALGO", message: raw.replace(/^\[ALGO\]\s*/, "") };
  }
  if (raw.includes("[SUCCESS]") || raw.includes("[DONE]")) {
    return { tag: "SUCCESS", message: raw.replace(/^\[(SUCCESS|DONE)\]\s*/, "") };
  }
  if (raw.includes("[INIT]")) {
    return { tag: "INIT", message: raw.replace(/^\[INIT\]\s*/, "") };
  }
  if (raw.includes("[FIELD]")) {
    return { tag: "FIELD", message: raw.replace(/^\[FIELD\]\s*/, "") };
  }
  if (raw.includes("[ANALYSIS]")) {
    return { tag: "ANALYSIS", message: raw.replace(/^\[ANALYSIS\]\s*/, "") };
  }
  if (raw.includes("[TECHNIQUE]")) {
    return { tag: "TECHNIQUE", message: raw.replace(/^\[TECHNIQUE\]\s*/, "") };
  }
  if (raw.includes("[STEP ")) {
    return { tag: "STEP", message: raw.replace(/^\[STEP \d+\]\s*/, "") };
  }
  if (raw.includes("[RECONSTRUCT]")) {
    return { tag: "PROCESS", message: raw.replace(/^\[RECONSTRUCT\]\s*/, "") };
  }
  if (raw.includes("[WARNING]")) {
    return { tag: "WARN", message: raw.replace(/^\[WARNING\]\s*/, "") };
  }
  if (raw.includes("[ERROR]")) {
    return { tag: "ERROR", message: raw.replace(/^\[ERROR\]\s*/, "") };
  }
  return { tag: "PROCESS", message: raw };
};

// =============================================================================
// COLOR/ICON HELPERS
// =============================================================================

const tagColor = (tag: string): string => {
  switch (tag) {
    case "ALGO":      return "text-blue-400 font-bold";
    case "STEP":      return "text-yellow-400";
    case "SUCCESS":   return "text-green-400 font-bold";
    case "INIT":      return "text-blue-300";
    case "FIELD":     return "text-gray-300 font-bold";
    case "TECHNIQUE": return "text-purple-400";
    case "ANALYSIS":  return "text-violet-400";
    case "PROCESS":   return "text-cyan-400";
    case "WARN":      return "text-orange-400";
    case "ERROR":     return "text-red-400 font-bold";
    default:          return "text-green-400/70";
  }
};

const msgColor = (tag: string): string => {
  switch (tag) {
    case "ALGO":    return "text-blue-300";
    case "STEP":    return "text-yellow-200/90";
    case "SUCCESS": return "text-green-400";
    case "ERROR":   return "text-red-300";
    case "WARN":    return "text-orange-300";
    default:        return "text-green-400/80";
  }
};

const tagIcon = (tag: string): string => {
  switch (tag) {
    case "ALGO":      return "⊕";
    case "STEP":      return "→";
    case "SUCCESS":   return "●";
    case "INIT":      return "⚙";
    case "FIELD":     return "▸";
    case "TECHNIQUE": return "▶";
    case "ANALYSIS":  return "≈";
    case "PROCESS":   return "▶";
    case "WARN":      return "⚠";
    case "ERROR":     return "✕";
    default:          return "-";
  }
};

// =============================================================================
// COMPONENT
// =============================================================================

interface RenderedLog {
  id: number;
  timestamp: string;
  tag: string;
  message: string;
}

export const ExecutionLog = ({
  fieldName,
  method,
  technique,
  isActive,
  isCompleted,
  externalLogs = [],
}: ExecutionLogProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [visibleLogs, setVisibleLogs] = useState<RenderedLog[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamedRef = useRef(false);

  const timestamp = () =>
    new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) +
    "." +
    new Date().getMilliseconds().toString().padStart(3, "0");

  // ── Stream real backend logs with typewriter reveal ───────────────────
  useEffect(() => {
    if (externalLogs.length === 0 || streamedRef.current) return;
    if (!isActive && !isCompleted) return;

    streamedRef.current = true;

    const stream = async () => {
      let counter = 0;

      for (const raw of externalLogs) {
        if (!raw || raw.trim() === "") continue;

        const { tag, message } = parseLogLine(raw);
        const safeMessage = maskSensitiveValues(message);

        counter++;
        setVisibleLogs((prev) => [
          ...prev,
          { id: counter, timestamp: timestamp(), tag, message: safeMessage },
        ]);

        const delay = tag === "STEP" ? 80 : tag === "ALGO" ? 180 : 120;
        await new Promise((r) => setTimeout(r, delay));
      }
    };

    stream();
  }, [externalLogs, isActive, isCompleted]);

  // ── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleLogs]);

  // Don't render if there are no logs to show
  if (externalLogs.length === 0 && visibleLogs.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-3">
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 px-3 rounded bg-secondary/50 hover:bg-secondary/70 transition-colors">
        {isOpen ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <Terminal className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Algorithm Trace — {fieldName}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {visibleLogs.length} / {externalLogs.length} entries
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div
          ref={scrollRef}
          className="mt-2 max-h-56 overflow-y-auto bg-[#0a0e1a] text-green-400 font-mono text-[10px] p-3 rounded-lg border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.08)]"
        >
          {visibleLogs.map((log, index) => (
            <div
              key={log.id}
              className={cn(
                "flex items-start gap-2 py-[2px] leading-relaxed tracking-wider transition-all duration-300",
                log.tag === "ALGO" && "mt-1",
                index === visibleLogs.length - 1 &&
                  isActive &&
                  "drop-shadow-[0_0_5px_rgba(34,197,94,0.4)]"
              )}
            >
              {/* Timestamp */}
              <span className="text-green-900/50 shrink-0 w-[72px] tabular-nums select-none">
                {log.timestamp}
              </span>

              {/* Icon */}
              <span className="shrink-0 w-3 text-center">
                {tagIcon(log.tag)}
              </span>

              {/* Tag */}
              <span
                className={cn(
                  "shrink-0 w-[64px] text-[9px] uppercase tracking-widest",
                  tagColor(log.tag)
                )}
              >
                {log.tag}
              </span>

              {/* Message */}
              <span className={cn("flex-1 break-all", msgColor(log.tag))}>
                {log.message}
                {index === visibleLogs.length - 1 && isActive && (
                  <span className="inline-block ml-1 w-[5px] h-[12px] bg-green-400 animate-pulse align-middle rounded-sm" />
                )}
              </span>
            </div>
          ))}

          {/* Cursor when waiting */}
          {isActive && !isCompleted && visibleLogs.length === 0 && (
            <div className="flex items-center gap-2 py-0.5 text-green-900/30">
              <span className="w-[72px]" />
              <span className="text-green-500/20 italic text-[9px]">
                Awaiting backend trace…
              </span>
              <span className="animate-pulse">|</span>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
