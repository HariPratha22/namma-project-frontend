import { Layout } from "@/components/layout/Layout";
import { FileUpload } from "@/components/upload/FileUpload";
import { motion } from "framer-motion";

const UploadPage = () => {
  return (
    <Layout>
      <motion.div 
        className="space-y-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">File Upload</h1>
          <p className="text-muted-foreground mt-1">
            Upload files to scan for PII and apply masking
          </p>
        </div>

        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <FileUpload />
        </motion.div>
      </motion.div>
    </Layout>
  );
};

export default UploadPage;
