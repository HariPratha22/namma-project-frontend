import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Text } from "recharts";
import { AlertCircle, Loader2, Shield } from "lucide-react";

interface MethodData {
  name: string;
  value: number;
  color: string;
}

interface MaskingMethodsChartProps {
  data: MethodData[];
  isLoading?: boolean;
  error?: string | null;
}

export const MaskingMethodsChart = ({ data, isLoading = false, error = null }: MaskingMethodsChartProps) => {
  const COLORS = [
    "#3B82F6", // blue
    "#22C55E", // green
    "#EF4444", // red
    "#EC4899", // pink
    "#F59E0B", // orange
  ];

  // Loading state
  if (isLoading) {
    return (
      <div className="h-[300px] w-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading masking methods...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-[300px] w-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  // Empty state - no data available
  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] w-full flex items-center justify-center">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <Shield className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No masking applied yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Apply masking rules to see distribution here
          </p>
        </div>
      </div>
    );
  }

  const formattedData = data.map((item, index) => ({
    ...item,
    color: COLORS[index % COLORS.length],
  }));

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="flex flex-col h-full w-full drop-shadow-md" style={{ outline: 'none' }}>
      <div className="h-[240px] w-full mt-2 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={formattedData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              labelLine={false}
              isAnimationActive={true}
              animationDuration={800}
              label={false}
              dataKey="value"
              stroke="none"
              activeShape={false}
              style={{ outline: "none" }}
            >
              {formattedData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color} 
                  className="hover:opacity-80 transition-opacity cursor-pointer outline-none" 
                  style={{ outline: "none" }}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)",
                border: "none",
                borderRadius: "12px",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                color: isDark ? "#ffffff" : "#111827",
                outline: 'none'
              }}
              itemStyle={{ color: isDark ? "#ffffff" : "#111827", fontSize: '12px', fontWeight: '800' }}
              cursor={false}
            />
            {/* Center Label for Donut */}
            <Text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-2xl font-black fill-gray-800 dark:fill-white"
            >
              {total}
            </Text>
            <Text
              x="50%"
              y="62%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[10px] font-bold fill-gray-400 dark:fill-gray-500 uppercase tracking-tighter"
            >
              Total Applied
            </Text>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Clean Modern Legend */}
      <div className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2 mt-4 px-4">
        {formattedData.map((entry, index) => (
          <div key={`legend-${index}`} className="flex items-center gap-2 group cursor-default">
            <div
              className="w-3 h-3 rounded-full transition-all duration-300 group-hover:scale-125 shadow-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
              {entry.name} <span className="text-gray-400 dark:text-gray-500 font-medium">({entry.value})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
