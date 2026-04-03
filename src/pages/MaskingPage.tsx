import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Scan } from "lucide-react";
import { useProject } from "@/contexts/ProjectContext";
import { useNavigate } from "react-router-dom";
import { MaskingWizard } from "@/components/masking/MaskingWizard";

const MaskingPage = () => {
  const { currentProject, detectedFields } = useProject();
  const navigate = useNavigate();

  if (!currentProject) {
    return (
      <Layout>
        <div className="space-y-6 opacity-0 animate-slideRight">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data Masking</h1>
            <p className="text-muted-foreground mt-1">
              Protect your sensitive data with masking and anonymization
            </p>
          </div>
          <Card className="glass-effect">
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
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

  if (detectedFields.length === 0) {
    return (
      <Layout>
        <div className="space-y-6 opacity-0 animate-slideRight">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data Masking</h1>
            <p className="text-muted-foreground mt-1">
              Protect your sensitive data with masking and anonymization
            </p>
            <Badge variant="outline" className="mt-2">
              Project: {currentProject.name}
            </Badge>
          </div>
          <Card className="glass-effect">
            <CardContent className="py-12 text-center">
              <Scan className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No PII Fields Detected</h3>
              <p className="text-muted-foreground mb-4">
                Please scan your database for PII fields first
              </p>
              <Button onClick={() => navigate('/detection')}>
                Go to PII Detection
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 opacity-0 animate-slideRight">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data Masking</h1>
          <p className="text-muted-foreground mt-1">
            Protect your sensitive data with masking and anonymization
          </p>
          <Badge variant="outline" className="mt-2">
            Project: {currentProject.name}
          </Badge>
        </div>

        <MaskingWizard />
      </div>
    </Layout>
  );
};

export default MaskingPage;
