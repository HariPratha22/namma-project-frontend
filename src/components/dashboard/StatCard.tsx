import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "primary" | "accent" | "warning" | "danger";
}

const variantStyles = {
  default: "glass-effect",
  primary: "bg-[#0466C8] text-white shadow-blue-500/20",
  accent: "bg-[#023E7D] text-white shadow-blue-900/20",
  warning: "bg-warning text-white",
  danger: "bg-danger text-white",
};

const iconVariantStyles = {
  default: "bg-[#0466C8]/20 text-[#0466C8]",
  primary: "bg-white/20 text-white",
  accent: "bg-white/20 text-white",
  warning: "bg-white/20 text-white",
  danger: "bg-white/20 text-white",
};

export const StatCard = ({ title, value, icon: Icon, trend, variant = "default" }: StatCardProps) => {
  return (
    <div
      className={cn(
        "relative p-6 pt-6 bg-white dark:glass-effect border border-gray-100 dark:border-[#1E293B] shadow-md hover:shadow-xl transition-all duration-300 rounded-xl",
        variantStyles[variant]
      )}
    >
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-2">
          <p className={cn(
            "text-xs font-bold tracking-widest uppercase",
            variant === "default" ? "text-gray-500 dark:text-gray-400" : "text-white/80"
          )}>
            {title}
          </p>
          <p className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white transition-transform duration-300 group-hover:scale-110 origin-left inline-block">
            {value}
          </p>
          {trend && (
            <div className="flex items-center gap-1 text-sm mt-1">
              <span className={trend.isPositive ? "text-success font-bold" : "text-danger font-bold"}>
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              </span>
              <span className="text-gray-400 dark:text-gray-500 text-xs">vs last scan</span>
            </div>
          )}
        </div>
        <div className={cn(
          "rounded-xl p-3 shadow-sm transform transition-transform duration-300 group-hover:rotate-12",
          variant === "default" ? "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400" : iconVariantStyles[variant]
        )}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};
