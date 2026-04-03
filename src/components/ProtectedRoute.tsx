/**
 * Protected Route Component
 * 
 * Wraps routes that require authentication.
 * Redirects unauthenticated users to the login page.
 * Optionally requires a project to be selected.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If true, also requires a project to be selected. Redirects to /projects otherwise. */
  requireProject?: boolean;
}

/**
 * ProtectedRoute - Ensures only authenticated users can access wrapped content
 * 
 * Usage:
 *   <Route path="/dashboard" element={
 *     <ProtectedRoute requireProject>
 *       <DashboardPage />
 *     </ProtectedRoute>
 *   } />
 */
export function ProtectedRoute({ children, requireProject = false }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  const { currentProject, isLoading: projectsLoading } = useProject();
  const location = useLocation();
  
  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Save the attempted URL for redirecting after login
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // If a project is required but none is selected, redirect to /projects
  if (requireProject && !currentProject) {
    // Wait for projects to finish loading before redirecting
    if (projectsLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    return <Navigate to="/projects" state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
}

export default ProtectedRoute;
