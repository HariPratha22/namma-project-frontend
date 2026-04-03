import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface LogEntry {
  type: string;
  msg: string;
  time: string;
}

interface ProcessingVisualizationProps {
  isProcessing: boolean;
  onProgress: (progress: number) => void;
  onComplete: () => void;
  allFields?: any[];
  backendLogs?: string[];
}

// =============================================================================
// PII MASKING — never show raw sensitive values in the UI
// =============================================================================

/**
 * Detects strings that look like sensitive data and masks them.
 * Handles: phone numbers, emails, Aadhaar, UUIDs inside quotes, etc.
 */
const maskSensitiveValues = (text: string): string => {
  // Mask phone numbers (7+ consecutive digits)
  text = text.replace(/\b(\d{2})\d{4,}(\d{2})\b/g, "$1******$2");

  // Mask email addresses — keep first 2 chars + domain
  text = text.replace(
    /\b([a-zA-Z0-9._%+-]{2})[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    "$1****@$2"
  );

  // Mask Aadhaar-like patterns (12-digit numbers)
  text = text.replace(/\b(\d{4})\s?\d{4}\s?(\d{4})\b/g, "$1 **** $2");

  // Mask quoted strings longer than 5 characters (likely raw data samples)
  text = text.replace(/'([^']{2})[^']{4,}([^']{2})'/g, "'$1****$2'");

  return text;
};

// =============================================================================
// LOG LINE CLASSIFICATION
// =============================================================================

/**
 * Parse a raw backend log line into a typed LogEntry.
 * Extracts the tag, assigns color category, and cleans the message.
 */
const classifyLogLine = (raw: string): { type: string; msg: string } => {
  // Order matters — check most specific first
  if (raw.includes("[ALGO STEP]")) {
    return { type: "STEP", msg: raw.replace(/^\[ALGO STEP\]\s*/, "") };
  }
  if (raw.includes("[ALGO]") && raw.toLowerCase().includes("status: completed")) {
    return { type: "SUCCESS", msg: raw.replace(/^\[ALGO\]\s*/, "") };
  }
  if (raw.includes("[ALGO]") && raw.toLowerCase().includes("algorithm:")) {
    return { type: "ALGO", msg: raw.replace(/^\[ALGO\]\s*/, "") };
  }
  if (raw.includes("[ALGO]")) {
    return { type: "ALGO", msg: raw.replace(/^\[ALGO\]\s*/, "") };
  }
  if (raw.includes("[SUCCESS]") || raw.includes("[DONE]")) {
    const cleaned = raw.replace(/^\[(SUCCESS|DONE)\]\s*/, "");
    return { type: "SUCCESS", msg: cleaned };
  }
  if (raw.includes("[INIT]")) {
    return { type: "INIT", msg: raw.replace(/^\[INIT\]\s*/, "") };
  }
  if (raw.includes("[FIELD]")) {
    return { type: "FIELD", msg: raw.replace(/^\[FIELD\]\s*/, "") };
  }
  if (raw.includes("[ANALYSIS]")) {
    return { type: "ANALYSIS", msg: raw.replace(/^\[ANALYSIS\]\s*/, "") };
  }
  if (raw.includes("[TECHNIQUE]")) {
    return { type: "TECHNIQUE", msg: raw.replace(/^\[TECHNIQUE\]\s*/, "") };
  }
  if (raw.includes("[STEP ")) {
    return { type: "STEP", msg: raw.replace(/^\[STEP \d+\]\s*/, "") };
  }
  if (raw.includes("[RECONSTRUCT]")) {
    return { type: "PROCESS", msg: raw.replace(/^\[RECONSTRUCT\]\s*/, "") };
  }
  if (raw.includes("[WARNING]")) {
    return { type: "WARN", msg: raw.replace(/^\[WARNING\]\s*/, "") };
  }
  if (raw.includes("[ERROR]")) {
    return { type: "ERROR", msg: raw.replace(/^\[ERROR\]\s*/, "") };
  }

  // Fallback: show as generic process line
  return { type: "PROCESS", msg: raw };
};

// =============================================================================
// COMPONENT
// =============================================================================

export const ProcessingVisualization = ({
  isProcessing,
  onProgress,
  onComplete,
  allFields = [],
  backendLogs = [],
}: ProcessingVisualizationProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);
  const hasRunRef = useRef(false);

  // ── Icons ──────────────────────────────────────────────────────────────
  const getIcon = (type: string) => {
    switch (type) {
      case "FIELD":     return "▸";
      case "INIT":      return "⚙";
      case "ALGO":      return "⊕";
      case "STEP":      return "→";
      case "TECHNIQUE": return "▶";
      case "ANALYSIS":  return "≈";
      case "PROCESS":   return "▶";
      case "SUCCESS":   return "●";
      case "WARN":      return "⚠";
      case "ERROR":     return "✕";
      case "HEADER":    return "◈";
      default:          return "-";
    }
  };

  // ── Colors ─────────────────────────────────────────────────────────────
  const getLevelColor = (type: string) => {
    switch (type) {
      case "FIELD":     return "text-gray-200 font-bold";
      case "INIT":      return "text-blue-400";
      case "ALGO":      return "text-amber-400 font-bold";
      case "STEP":      return "text-cyan-300";
      case "TECHNIQUE": return "text-purple-400";
      case "ANALYSIS":  return "text-violet-400";
      case "PROCESS":   return "text-yellow-400";
      case "SUCCESS":   return "text-green-400 font-bold";
      case "WARN":      return "text-orange-400";
      case "ERROR":     return "text-red-400 font-bold";
      case "HEADER":    return "text-amber-500 font-extrabold";
      default:          return "text-gray-500";
    }
  };

  const getMsgColor = (type: string) => {
    switch (type) {
      case "SUCCESS":  return "text-green-400 font-medium";
      case "FIELD":    return "text-gray-100 font-bold";
      case "ALGO":     return "text-amber-300";
      case "STEP":     return "text-cyan-200/90";
      case "ERROR":    return "text-red-300";
      case "WARN":     return "text-orange-300";
      case "HEADER":   return "text-amber-400 font-bold";
      default:         return "text-gray-300";
    }
  };

  // ── Timestamp helper ───────────────────────────────────────────────────
  const now = () =>
    new Date().toLocaleTimeString("en-US", { hour12: false });

  // ── Main effect: stream real backend logs with typewriter delay ────────
  useEffect(() => {
    if (!isProcessing || backendLogs.length === 0 || hasRunRef.current) return;
    hasRunRef.current = true;

    const streamLogs = async () => {
      // Field names for a short preamble
      const fieldNames = allFields.map(
        (f) => f.field?.field_name || f.fieldName || "field"
      );

      // ── Preamble: brief init lines ──
      const preamble: LogEntry[] = [
        { time: now(), type: "HEADER", msg: "══════ EXECUTION TRACE ══════" },
        { time: now(), type: "INIT",   msg: `Target fields: [${fieldNames.join(", ")}]` },
        { time: now(), type: "INIT",   msg: `Total backend log entries: ${backendLogs.length}` },
      ];

      for (const entry of preamble) {
        setLogs((prev) => [...prev, entry]);
        await new Promise((r) => setTimeout(r, 200));
      }

      // ── Stream each real backend log line ──
      const total = backendLogs.length;
      for (let i = 0; i < total; i++) {
        const raw = backendLogs[i];

        // Skip blank lines
        if (!raw || raw.trim() === "") continue;

        const { type, msg } = classifyLogLine(raw);
        const safeMsg = maskSensitiveValues(msg);

        // Add visual separator when a new field starts
        if (raw.includes("[FIELD]") || (raw.includes("[ALGO]") && raw.includes("Algorithm:"))) {
          // Small visual gap before new algorithm blocks
          setLogs((prev) => [
            ...prev,
            { time: now(), type: "HEADER", msg: "────────────────────────────────" },
          ]);
          await new Promise((r) => setTimeout(r, 80));
        }

        setLogs((prev) => [
          ...prev,
          { time: now(), type, msg: safeMsg },
        ]);

        // Progress tracking
        const pct = Math.round(((i + 1) / total) * 100);
        onProgress(Math.min(pct, 99));

        // Delay: faster for STEP lines, slower for ALGO headers
        const delay = type === "STEP" ? 100 : type === "ALGO" ? 250 : 150;
        await new Promise((r) => setTimeout(r, delay));
      }

      // ── Footer ──
      setLogs((prev) => [
        ...prev,
        { time: now(), type: "HEADER",  msg: "══════ END EXECUTION TRACE ══════" },
        { time: now(), type: "SUCCESS", msg: "All transformations completed — data secured" },
      ]);

      onProgress(100);
      setTimeout(() => onComplete(), 800);
    };

    streamLogs();
  }, [isProcessing, backendLogs.length]);

  // ── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="w-full animate-in fade-in duration-500">
      <div
        ref={consoleRef}
        className="bg-[#0a0e1a] text-gray-300 text-[11px] font-mono rounded-lg p-4 h-96 w-full overflow-y-auto border border-gray-700/60 shadow-[inset_0_1px_4px_rgba(0,0,0,0.6)] custom-scrollbar"
      >
        <div className="space-y-[3px]">
          {logs.map((log, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-3 py-[2px] leading-relaxed",
                log.type === "FIELD" || log.type === "HEADER"
                  ? "mt-2 first:mt-0"
                  : "",
                i === logs.length - 1 && isProcessing
                  ? "drop-shadow-[0_0_6px_rgba(34,197,94,0.3)]"
                  : ""
              )}
            >
              {/* Timestamp */}
              <span className="text-gray-600 text-[10px] shrink-0 w-[60px] select-none tabular-nums">
                {log.time}
              </span>

              {/* Icon */}
              <span className="shrink-0 w-4 text-center">
                {getIcon(log.type)}
              </span>

              {/* Tag */}
              <span
                className={cn(
                  "w-[72px] shrink-0 text-[10px] uppercase tracking-wider",
                  getLevelColor(log.type)
                )}
              >
                {log.type}
              </span>

              {/* Message */}
              <span className={cn("flex-1 break-all", getMsgColor(log.type))}>
                {log.msg}
                {i === logs.length - 1 && isProcessing && (
                  <span className="inline-block ml-1 w-[6px] h-[13px] bg-green-400 animate-pulse align-middle rounded-sm" />
                )}
              </span>
            </div>
          ))}

          {/* Awaiting indicator */}
          {isProcessing && logs.length === 0 && (
            <div className="flex gap-3 py-1 items-center">
              <span className="w-[60px]" />
              <span className="text-gray-500/40 animate-pulse text-xs italic">
                Connecting to execution engine…
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};