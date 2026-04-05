import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/dashboard/StatCard";
import { PIIDistributionChart } from "@/components/dashboard/PIIDistributionChart";
import { MaskingMethodsChart } from "@/components/dashboard/MaskingMethodsChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Shield, Database, AlertTriangle, Clock, Loader2, Scan } from "lucide-react";
import { useSearch } from "@/contexts/SearchContext";
import { useProject } from "@/contexts/ProjectContext";
import { toast } from "sonner";
import {
  fetchDashboardData,
  type DashboardData,
  EMPTY_DASHBOARD_DATA,
} from "@/api/dashboard";
import { startPiiScan, parseScanError } from "@/api/piiScan";

const Index = () => {
  console.log("[Index] Page rendering...");
  const navigate = useNavigate();
  const { searchQuery } = useSearch();
  const {
    currentProject,
  } = useProject();

  // Dashboard data state - fetched from API
  const [dashboardData, setDashboardData] = useState<DashboardData>(EMPTY_DASHBOARD_DATA);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);

  // Function to load dashboard data
  const loadDashboardData = async (projectId: string) => {
    setIsDashboardLoading(true);
    setDashboardError(null);

    try {
      const data = await fetchDashboardData(projectId);
      setDashboardData(data);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setDashboardError('Failed to load dashboard data');
      setDashboardData(EMPTY_DASHBOARD_DATA);
    } finally {
      setIsDashboardLoading(false);
    }
  };

  // Handle PII scan
  const handleStartScan = async () => {
    if (!currentProject?.id) return;

    setIsScanning(true);
    try {
      const result = await startPiiScan(currentProject.id);
      toast.success(`Scan completed! Found ${result.detected_fields} PII fields.`);

      // Refresh dashboard data to show new results
      await loadDashboardData(currentProject.id);
    } catch (err) {
      const errorMessage = parseScanError(err);
      toast.error(errorMessage);
      setDashboardError(errorMessage);
    } finally {
      setIsScanning(false);
    }
  };

  // Fetch dashboard data when project changes
  useEffect(() => {
    const loadData = () => {
      if (currentProject?.id) {
        loadDashboardData(currentProject.id);
      } else {
        setDashboardData(EMPTY_DASHBOARD_DATA);
        setDashboardError(null);
      }
    };

    // ✅ initial load
    loadData();

    // ✅ event listener
    window.addEventListener("dashboardRefresh", loadData);

    return () => {
      window.removeEventListener("dashboardRefresh", loadData);
    };
  }, [currentProject?.id]);



  // Filter PII data based on search query
  const filteredPiiData = searchQuery && (dashboardData?.piiDistribution?.length ?? 0) > 0
    ? (dashboardData?.piiDistribution || []).filter((item) =>
      item?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : dashboardData?.piiDistribution ?? [];

  // Filter masking methods based on search query
  const filteredMaskingMethods = searchQuery && (dashboardData?.maskingMethods?.length ?? 0) > 0
    ? (dashboardData?.maskingMethods || []).filter((item) =>
      item?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : dashboardData?.maskingMethods ?? [];

  // Filter recent activity based on search query
  const filteredRecentActivity = searchQuery && (dashboardData?.recentActivity?.length ?? 0) > 0
    ? (dashboardData?.recentActivity || []).filter((item) =>
      (item?.message || item?.description || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
    : dashboardData?.recentActivity ?? [];

  // Limit display items based on toggle state
  const displayedActivities = showAllActivities 
    ? filteredRecentActivity 
    : (filteredRecentActivity || []).slice(0, 3);

  // Debug log for data
  useEffect(() => {
    if (currentProject) {
      console.log("[Index] Dashboard Data:", dashboardData);
      console.log("[Index] Filtered PII:", filteredPiiData);
    }
  }, [dashboardData, filteredPiiData, currentProject]);

  // Project Dashboard View
  return (
    <Layout>
      <div className="space-y-6 opacity-0 animate-slideUp">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/projects')}
                className="text-muted-foreground hover:text-foreground h-8 px-2 -ml-2"
              >
                ← Back
              </Button>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold">
                Active Project
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white line-clamp-1">
              {currentProject?.name}
            </h1>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium">
              PII detection and masking metrics for your data
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Button
              onClick={handleStartScan}
              disabled={isScanning || isDashboardLoading}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:scale-[1.02] active:scale-95 hover:shadow-lg hover:shadow-violet-500/40 transition-all text-white font-semibold flex items-center justify-center gap-2 px-6 h-11"
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Scan className="h-4 w-4" />
                  <span>Start Scan</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <StatCard
            title="Total Scans"
            value={isDashboardLoading ? "..." : String(dashboardData?.stats?.totalScans ?? 0)}
            icon={FileText}
            trend={{ value: 0, isPositive: true }}
          />
          <StatCard
            title="PII Fields Found"
            value={isDashboardLoading ? "..." : String(dashboardData?.stats?.piiFieldsFound ?? 0)}
            icon={AlertTriangle}
            trend={{ value: 0, isPositive: false }}
          />
          <StatCard
            title="Data Masked"
            value={isDashboardLoading ? "..." : String(dashboardData?.stats?.dataMasked ?? 0)}
            icon={Shield}
            trend={{ value: 0, isPositive: true }}
          />
          <StatCard
            title="Tables Scanned"
            value={isDashboardLoading ? "..." : String(dashboardData?.stats?.tablesScanned ?? 0)}
            icon={Database}
            trend={{ value: 0, isPositive: true }}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* PII Distribution Chart */}
          <Card className="glass-effect">
            <CardHeader>
              <CardTitle>PII Distribution by Type</CardTitle>
              <CardDescription>
                Breakdown of detected personally identifiable information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PIIDistributionChart
                data={filteredPiiData}
                isLoading={isDashboardLoading}
                error={dashboardError}
              />
            </CardContent>
          </Card>

          {/* Masking Methods Chart */}
          <Card className="glass-effect">
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Methods Applied</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Distribution of masking and anonymization techniques used
              </p>
            </CardHeader>
            <CardContent>
              <MaskingMethodsChart
                data={filteredMaskingMethods}
                isLoading={isDashboardLoading}
                error={dashboardError}
              />
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="glass-effect">
          <CardHeader className="border-b dark:border-[#1E293B]">
            <CardTitle className="text-gray-900 dark:text-white font-bold">Recent Activity</CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">Latest scans and masking operations</CardDescription>
          </CardHeader>
          <CardContent>
            {isDashboardLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading activity...</p>
              </div>
            ) : (filteredRecentActivity?.length ?? 0) > 0 ? (
              <div className="space-y-3">
                {(displayedActivities || []).map((activity, index) => (
                  <div
                    key={activity?.id || index}
                    className="flex items-center justify-between p-4 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-all duration-200 group border border-transparent hover:border-violet-500/10"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-full transition-transform group-hover:scale-110 shadow-sm ${(activity?.type || 'mask') === 'scan' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' :
                        (activity?.type || 'mask') === 'mask' ? 'bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400' :
                          'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400'
                        }`}>
                        {(activity?.type || 'mask') === 'scan' ? <FileText className="h-4.5 w-4.5" /> :
                          (activity?.type || 'mask') === 'mask' ? <Shield className="h-4.5 w-4.5" /> :
                            <Database className="h-4.5 w-4.5" />}
                      </div>
                      <span className="text-sm text-gray-800 dark:text-gray-300 font-semibold">{activity?.message || activity?.description || "No detail"}</span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-500">
                      {(() => {
                        const dateInput = activity?.timestamp || activity?.created_at;
                        if (!dateInput) return activity?.time || "Just now";
                        
                        const date = new Date(dateInput);
                        if (!isNaN(date.getTime())) {
                          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }
                        return activity?.time || "Just now";
                      })()}
                    </span>
                  </div>
                ))}

                {filteredRecentActivity.length > 3 && (
                  <div className="pt-2 flex justify-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowAllActivities(!showAllActivities)}
                      className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-medium text-xs flex items-center gap-1"
                    >
                      {showAllActivities ? (
                        <>Show Less</>
                      ) : (
                        <>Show More ({filteredRecentActivity.length - 3} more)</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
                <p className="text-sm">Connect a database and run a scan to see activity here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Index;
