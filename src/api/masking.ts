/**
 * Masking API Functions
 * 
 * This module provides functions for exporting masked data
 * from the backend. The backend fetches real database rows,
 * applies masking techniques, and returns the masked dataset.
 * 
 * All endpoints require JWT authentication.
 */

import { getApiUrl } from './client';
import { getAccessToken, refreshAccessToken, clearTokens } from './auth';
import React from 'react';
import { ShieldAlert, Lightbulb } from 'lucide-react';

// =============================================================================
// TECHNIQUE MAPPING
// =============================================================================

/**
 * Maps frontend technique/method names to backend technique identifiers.
 */
const TECHNIQUE_MAP: Record<string, string> = {
  // Mapping is now mostly 1:1
};

/**
 * Resolve a frontend technique name to a backend technique name.
 */
export function resolveBackendTechnique(frontendTechnique: string): string {
  return TECHNIQUE_MAP[frontendTechnique] || frontendTechnique;
}

/**
 * Apply masking/anonymization protection to the backend.
 * This fetches real data, transforms it, and stores it in ProtectedDataset.
 */
export async function applyProtection(
  projectId: string,
  methodType: "masking" | "anonymization",
  technique: string,
  tableName?: string | null,
  selectedColumns?: string[] | null,
  parameters?: Record<string, any> | null,
  source?: "file" | "database",
  tableData?: any
): Promise<{ message: string; tables: any[]; logs: string[]; masked_data?: any[] }> {
  const url = `/projects/${projectId}/masking/apply/`;

  const accessToken = getAccessToken();
  const fullUrl = getApiUrl(url);

  console.log('[Masking API] Apply Protection Request:', {
    fullUrl,
    methodType,
    technique,
    tableName,
    selectedColumns,
    parameters,
    source
  });

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method_type: methodType,
      technique: technique,
      table_name: tableName,
      selected_columns: selectedColumns,
      column_name: selectedColumns && selectedColumns.length > 0 ? selectedColumns[0] : null,
      parameters: parameters,
      source: source || 'database',
      table_data: tableData
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Protection failed: ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// AUTH FETCH (blob variant)
// =============================================================================

/**
 * Make an authenticated fetch that returns the raw Response object
 * (needed for blob downloads instead of JSON parsing).
 */
async function authFetchRaw(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = getAccessToken();
  const url = getApiUrl(endpoint);

  console.log('[Masking API] Raw Fetch Request:', { url, method: options.method || 'GET' });

  const headers: HeadersInit = {
    'Authorization': `Bearer ${accessToken}`,
    ...(options.headers || {}),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkError) {
    console.error('[Masking API] Network error:', networkError);
    throw new Error('Export failed - backend not reachable');
  }

  // Handle 401 - try to refresh token
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newAccessToken = getAccessToken();
      const retryHeaders = {
        'Authorization': `Bearer ${newAccessToken}`,
        ...(options.headers || {}),
      };

      const retryResponse = await fetch(url, {
        ...options,
        headers: retryHeaders,
      });

      return retryResponse;
    } else {
      clearTokens();
      throw new Error('Session expired. Please login again.');
    }
  }

  return response;
}

// =============================================================================
// EXPORT FUNCTION
// =============================================================================

/**
 * Export masked data from the backend as a downloadable file.
 * Uses authenticated fetch to ensure JWT tokens are sent.
 */
export async function exportMaskedData(
  projectId: string,
  format: 'csv' | 'json' | 'excel'
): Promise<void> {

  // IN-MEMORY EXPORT FOR UPLOADED FILES (By-passing Backend DB entirely)
  const uploadedStr = localStorage.getItem("uploadedFilesData");
  const maskedDataStr = localStorage.getItem("maskedUploadedData");
  if (uploadedStr && maskedDataStr) {
    const data = JSON.parse(maskedDataStr);
    if (data && data.length > 0) {
      console.log("[Export] Exporting in-memory data for upload flow");
      let blob: Blob;
      let filename = `protected_dataset.${format}`;

      if (format === 'json') {
        blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      } else if (format === 'csv') {
        const header = Object.keys(data[0]).join(',');
        const csvRows = data.map((row: any) => 
          Object.values(row).map(val => 
            `"${String(val !== null && val !== undefined ? val : '').replace(/"/g, '""')}"`
          ).join(',')
        );
        const csvContent = [header, ...csvRows].join('\n');
        blob = new Blob([csvContent], { type: 'text/csv' });
      } else {
        filename = "protected_dataset.xlsx";
        try {
          const XLSX = await import('xlsx');
          const worksheet = XLSX.utils.json_to_sheet(data);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, "MaskedData");
          const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
          blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        } catch (e) {
          console.error("Local XLSX export failed", e);
          throw new Error("Failed to export Excel locally. Missing xlsx module.");
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      return;
    }
  }

  // ✅ Correct endpoint
  const endpoint = `/projects/${projectId}/masking/export/${format}/`;

  // ✅ Use your existing auth system
  const response = await authFetchRaw(endpoint, {
    method: "GET"
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Export failed: ${response.status}`);
  }

  // ✅ Blob handling
  const blob = await response.blob();

  let filename = `protected_dataset.${format}`;
  if (format === "excel") {
    filename = "protected_dataset.xlsx";
  }

  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
export async function pushToSourceDatabase(projectId: string) {
  const endpoint = `/projects/${projectId}/database/push/`;

  // authFetchRaw automatically adds your security token!
  const response = await authFetchRaw(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('Database push failed');
  }
  return response.json();
}
// =============================================================================
// ERROR PARSER
// =============================================================================

/**
 * Parse masking API errors into a user-friendly message or component.
 */
export function parseMaskingError(error: unknown): string | React.ReactNode {
  if (error instanceof Error) {
    if (error.message.includes('backend not reachable')) {
      return 'Export failed - backend not reachable';
    }
    if (error.message.includes('Session expired')) {
      return 'Session expired. Please login again.';
    }

    try {
      // 1. Try to parse backend structured error
      const parsed = JSON.parse(error.message);
      
      // If we have our new structured format, render it beautifully
      if (parsed.status === 'error' && parsed.title && parsed.message) {
        return React.createElement('div', { className: 'flex flex-col gap-2 py-1' }, [
          React.createElement('div', { key: 'title', className: 'flex items-center gap-2 font-bold text-red-600 dark:text-red-400' }, [
            React.createElement(ShieldAlert, { key: 'icon', className: 'h-4 w-4' }),
            parsed.title
          ]),
          React.createElement('div', { key: 'msg', className: 'text-sm text-gray-700 dark:text-gray-300' }, 
            parsed.message
          ),
          parsed.suggestion && React.createElement('div', { 
            key: 'sugg', 
            className: 'text-xs bg-purple-500/10 dark:bg-purple-900/20 border border-purple-500/20 text-purple-700 dark:text-purple-300 p-2 rounded-md mt-1 flex gap-2 items-center' 
          }, [
            React.createElement(Lightbulb, { key: 's-icon', className: 'h-3 w-3 shrink-0' }),
            parsed.suggestion
          ])
        ]);
      }

      // Fallback for standard Django or generic error fields
      return parsed.detail || parsed.message || error.message;
    } catch {
      // Not JSON? Just return the raw string
      return error.message;
    }
  }
  return 'An unexpected error occurred';
}
