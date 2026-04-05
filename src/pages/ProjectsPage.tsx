/**
 * Projects Page
 * 
 * Post-login landing page where users select or create a project.
 * After selecting a project, the user is navigated to the Dashboard.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderOpen, Plus, Shield, Sparkles } from "lucide-react";
import { useProject, type Project } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectList } from "@/components/project/ProjectList";
import { NewProjectDialog } from "@/components/project/NewProjectDialog";
import { StartupWizard } from "@/components/wizard/StartupWizard";

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { currentProject, projects, isLoading, selectProject } = useProject();
  const { isAuthenticated, user } = useAuth();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showStartupWizard, setShowStartupWizard] = useState(false);

  // Check if user needs onboarding (first login, no projects)
  useEffect(() => {
    if (isAuthenticated && user && projects.length === 0 && !isLoading) {
      const hasSeenWizard = localStorage.getItem(`wizard_completed_${user.id}`);
      if (!hasSeenWizard) {
        setShowStartupWizard(true);
      }
    }
  }, [isAuthenticated, user, projects.length, isLoading]);

  const handleWizardComplete = () => {
    setShowStartupWizard(false);
    if (user) {
      localStorage.setItem(`wizard_completed_${user.id}`, 'true');
    }
  };

  const handleSelectProject = async (project: Project) => {
    if (currentProject?.id !== project.id) {
      await selectProject(project.id);
    }
    // Navigate to dashboard after project selection
    navigate("/", { replace: true });
  };

  return (
    <Layout>
      <StartupWizard
        open={showStartupWizard}
        onComplete={handleWizardComplete}
      />
      <NewProjectDialog
        open={showNewProjectDialog}
        onOpenChange={setShowNewProjectDialog}
      />

      <div className="space-y-8 opacity-0 animate-slideUp">
        {/* Page Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600/10 via-indigo-600/10 to-purple-600/10 border border-violet-500/20 p-8">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-transparent" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/30 flex-shrink-0">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Your Projects
                </h1>
              </div>
              <p className="text-gray-600 dark:text-gray-400 max-w-lg text-sm sm:text-base leading-relaxed">
                Select an existing project to continue working, or create a new one to start protecting your data.
              </p>
            </div>
            {isAuthenticated && (
              <Button
                onClick={() => setShowNewProjectDialog(true)}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:scale-105 hover:shadow-lg hover:shadow-violet-500/40 transition-all text-white font-semibold px-6 py-2.5 w-full sm:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            )}
          </div>
        </div>

        {/* Project List */}
        {isAuthenticated ? (
          <Card className="glass-effect border-violet-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <FolderOpen className="h-5 w-5 text-violet-500" />
                Available Projects
              </CardTitle>
              <CardDescription>
                Click on a project to select it and open the dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500 mx-auto"></div>
                  <p className="text-muted-foreground mt-3">Loading your projects...</p>
                </div>
              ) : (
                <ProjectList onSelectProject={handleSelectProject} />
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="glass-effect">
            <CardContent className="py-16 text-center">
              <Shield className="h-14 w-14 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Welcome to DataMask</h3>
              <p className="text-muted-foreground mb-6">
                Please log in to access your projects and start protecting your data
              </p>
              <Button 
                onClick={() => navigate('/auth')}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold"
              >
                Login to Get Started
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default ProjectsPage;
