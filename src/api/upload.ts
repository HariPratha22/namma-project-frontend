/**
 * File Upload & File PII Detection API
 *
 * Provides functions for uploading files to the backend for parsing,
 * and triggering PII detection on the parsed data.
 */

import { getApiUrl } from './client';
import { getAccessToken, refreshAccessToken, clearTokens } from './auth';

// =============================================================================
// INTERFACES
// =============================================================================

export interface FileUploadResponse {
  filename: string;
  columns: string[];
  rows: Record<string, string>[];
  record_count: number;
}

export interface FileDetectPIIResponse {
  message: string;
  detected_fields: number;
  results: {
    id: string | number;
    table_name: string;
    field_name: string;
    pii_type: string;
    confidence: number;
  }[];
}

// =============================================================================
// AUTH HELPER (multipart-aware, no Content-Type header for FormData)
// =============================================================================

async function authFetchRaw(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = getAccessToken();
  const url = getApiUrl(endpoint);

  if (!accessToken) {
    throw new Error('No access token - user not authenticated');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  // DO NOT set Content-Type for FormData — browser sets it automatically with boundary
  let response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
  });

  // Handle 401 — try refresh
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getAccessToken()}`;
      response = await fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
      });
    } else {
      clearTokens();
      throw new Error('Session expired. Please login again.');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(JSON.stringify(errorData));
  }

  return response;
}

async function authFetchJSON<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = getAccessToken();
  const url = getApiUrl(endpoint);

  if (!accessToken) {
    throw new Error('No access token - user not authenticated');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  let response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
  });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getAccessToken()}`;
      response = await fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
      });
    } else {
      clearTokens();
      throw new Error('Session expired. Please login again.');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(JSON.stringify(errorData));
  }

  return response.json();
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Upload a file to the backend for parsing.
 * Returns columns, rows (as dict[]), and record_count.
 */
export async function uploadFile(
  projectId: string,
  file: File
): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await authFetchRaw(
    `/projects/${projectId}/upload/`,
    { method: 'POST', body: formData }
  );

  return response.json();
}

/**
 * Trigger PII detection on parsed file data.
 * Sends columns + rows to backend which runs the existing detect_pii() engine.
 */
export async function detectPIIFromFile(
  projectId: string,
  columns: string[],
  rows: Record<string, string>[],
  tableName: string = 'uploaded_file'
): Promise<FileDetectPIIResponse> {
  return authFetchJSON<FileDetectPIIResponse>(
    `/projects/${projectId}/file/detect-pii/`,
    {
      method: 'POST',
      body: JSON.stringify({
        columns,
        rows,
        table_name: tableName,
      }),
    }
  );
}

/**
 * Parse file upload API errors into human-readable messages.
 */
export function parseUploadError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('not authenticated')) {
      return 'Please log in to upload files';
    }
    if (error.message.includes('Session expired')) {
      return 'Session expired. Please login again.';
    }
    try {
      const parsed = JSON.parse(error.message);
      return parsed.error || parsed.detail || parsed.message || 'Upload failed';
    } catch {
      return error.message;
    }
  }
  return 'An unexpected error occurred';
}
