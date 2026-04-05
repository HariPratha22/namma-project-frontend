import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { DatabaseConnection } from "@/components/database/DatabaseConnection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Database, RefreshCw, Scan, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Search, Shield } from "lucide-react";
import { useSearch } from "@/contexts/SearchContext";
import { useProject } from "@/contexts/ProjectContext";
import { useNavigate } from "react-router-dom";

import { fetchDbTables, type TableMetadata } from "@/api";

const DatabasePage = () => {
  const { searchQuery } = useSearch();
  const { currentProject, isConnected } = useProject();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [tables, setTables] = useState<TableMetadata[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [activeConnectionId, setActiveConnectionId] = useState<number | null>(null);
  const navigate = useNavigate();
  
  const filteredTables = searchQuery && (tables?.length ?? 0) > 0
    ? (tables || []).filter(table => 
        (table?.table_name || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : (tables || []);

  const handleConnected = (connId: number) => {
    setShowSuccessMessage(true);
    setActiveConnectionId(connId);
    loadTables(connId, true); // Pass true to indicate initial connection for auto-scan check
  };

  const loadTables = async (connId: number, isInitialConnection = false) => {
    if (!currentProject) return;
    setIsLoadingTables(true);
    try {
      const response = await fetchDbTables(currentProject.id, connId);
      const fetchedTables = response.tables || [];
      setTables(fetchedTables);

      // Part 3: Auto-scan trigger
      if (isInitialConnection) {
        const autoScan = localStorage.getItem("autoScan");
        if (autoScan === "true" && fetchedTables.length > 0) {
          const allTableNames = fetchedTables.map(t => t.table_name);
          navigate('/detection', { state: { autoScanTables: allTableNames } });
          toast.info("Auto-scanning all tables...");
        }
      }
    } catch (error) {
      toast.error("Failed to fetch tables from the database");
    } finally {
      setIsLoadingTables(false);
    }
  };

  const handleRefresh = () => {
    if (activeConnectionId) {
      toast.info("Refreshing table list...");
      loadTables(activeConnectionId);
    } else {
      toast.error("No active connection available");
    }
  };

  const handleProceedToDetection = () => {
    navigate('/detection');
  };

  const handleScanTable = (tableName: string) => {
    // Navigate to detection page with table name in state for auto-scanning
    navigate('/detection', { state: { autoScanTable: tableName } });
  };

  const handleScanAll = () => {
    // Navigate to detection page with all tables for scanning
    const allTableNames = tables.map(t => t.table_name);
    navigate('/detection', { state: { autoScanTables: allTableNames } });
    toast.info("Scanning all tables...");
  };

  if (!currentProject) {
    return (
      <Layout>
        <div className="space-y-6 opacity-0 animate-fadeIn">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Database Connection</h1>
            <p className="text-muted-foreground mt-1">
              Connect to your database and scan tables for PII
            </p>
          </div>
          <Card className="glass-effect">
            <CardContent className="py-12 text-center">
              <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
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
      <div className="space-y-6 opacity-0 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Database Connection</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Connect to your database and scan tables for PII
            </p>
            <Badge variant="outline" className="mt-2">
              Project: {currentProject.name}
            </Badge>
          </div>
        </div>

        <DatabaseConnection onConnected={handleConnected} />

        {/* Success Message */}
        {showSuccessMessage && isConnected && (
          <Card className="glass-effect border-green-500/50 bg-green-500/5 overflow-hidden">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-green-700 dark:text-green-400 text-sm sm:text-base">
                      Database connected successfully!
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      You may now proceed to scan PII data.
                    </p>
                  </div>
                </div>
                <Button onClick={handleProceedToDetection} className="gradient-primary w-full sm:w-auto h-10 text-xs sm:text-sm">
                  Proceed to PII Detection
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Available Tables - Only shown when connected */}
        {isConnected && (
          <Card className="glass-effect">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Database className="h-5 w-5 text-primary" />
                    Available Tables
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Tables detected in the connected database
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoadingTables} className="h-8 text-xs sm:text-sm px-2 sm:px-3">
                    <RefreshCw className={`mr-1 sm:mr-2 h-3.5 w-3.5 ${isLoadingTables ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="rounded-lg border-x-0 sm:border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50">
                      <TableHead className="w-[200px] min-w-[150px]">Table Name</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead className="text-right">Cols</TableHead>
                      <TableHead className="min-w-[120px]">Last Scanned</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!filteredTables || filteredTables.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No matching results found
                        </TableCell>
                      </TableRow>
                    ) : (
                      (filteredTables || []).map((table) => (
                        <TableRow key={table.table_name} className="hover:bg-secondary/30">
                          <TableCell className="font-mono font-medium text-xs sm:text-sm truncate max-w-[180px]">
                            {table.table_name}
                          </TableCell>
                          <TableCell className="text-right text-xs sm:text-sm">
                            {table.rows?.toLocaleString?.() || "0"}
                          </TableCell>
                          <TableCell className="text-right text-xs sm:text-sm">
                            {table.columns || "0"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs sm:text-sm">
                            Never
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => handleScanTable(table.table_name)}
                              className="h-8 w-8 sm:w-auto p-0 sm:px-3 sm:py-1"
                            >
                              <Scan className="h-4 w-4 sm:mr-2" />
                              <span className="hidden sm:inline">Scan</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Scan All Button - Right side bottom */}
              <div className="flex justify-end mt-4">
                <Button 
                  onClick={handleScanAll}
                  className="gradient-primary"
                >
                  <Scan className="mr-2 h-4 w-4" />
                  Scan All
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default DatabasePage;
