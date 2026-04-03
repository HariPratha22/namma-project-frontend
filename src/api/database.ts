/**
 * Database Connection API Functions
 * 
 * This module provides functions for interacting with Django database connection endpoints.
 * All endpoints require JWT authentication.
 * 
 * 
 * Real database connections are made securely from the backend to process data.
 */

import { getApiUrl } from './client';
import { getAccessToken, refreshAccessToken, clearTokens } from './auth';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Database types supported by the backend
 */
export type DatabaseType = 'postgres' | 'mysql' | 'mongodb' | 'sqlite';

/**
 * Connection status returned from the API
 */
export type ConnectionStatus = 'pending' | 'success' | 'failed';

/**
 * Database connection data returned from the API
 */
export interface DatabaseConnectionData {
  id: number;
  db_type: DatabaseType;
  host: string;
  port?: number;
  database_name: string;
  username?: string;
  status: ConnectionStatus;
  created_at?: string;
}

/**
 * Create database connection request payload
 */
export interface CreateDbConnectionRequest {
  db_type: DatabaseType;
  host?: string;
  port?: number;
  database_name?: string;
  username?: string;
  password?: string;
}

/**
 * Test connection response
 */
export interface TestConnectionResponse {
  status: 'success' | 'failed';
  message: string;
}

export interface TableMetadata {
  table_name: string;
  rows?: number;
  columns?: number;
  column_names?: string[];
}

/**
 * Fetch tables response
 */
export interface FetchTablesResponse {
  tables: TableMetadata[];
}

/**
 * Database API error response
 */
export interface DatabaseError {
  detail?: string;
  message?: string;
  db_type?: string[];
  host?: string[];
  non_field_errors?: string[];
}

// =============================================================================
// API HELPERS
// =============================================================================

/**
 * Make an authenticated API request with JWT token
 * (Replicates the pattern from projects.ts for consistency)
 */
async function authFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = getAccessToken();
  const url = getApiUrl(endpoint);
  
  console.log('[Database API] Request:', { url, method: options.method || 'GET', hasToken: !!accessToken });
  
  if (!accessToken) {
    console.warn('[Database API] No access token found - user may not be logged in');
    throw new Error('Authentication required. Please login first.');
  }
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {}),
    'Authorization': `Bearer ${accessToken}`,
  };
  
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkError) {
    console.error('[Database API] Network error:', networkError);
    throw new Error('Network error: Unable to reach the server. Make sure the Django backend is running.');
  }
  
  console.log('[Database API] Response status:', response.status);
  
  // Handle 401 - try to refresh token
  if (response.status === 401 && accessToken) {
    console.log('[Database API] Token expired, attempting refresh...');
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newAccessToken = getAccessToken();
      const retryHeaders: HeadersInit = {
        ...headers,
        'Authorization': `Bearer ${newAccessToken}`,
      };
      
      const retryResponse = await fetch(url, {
        ...options,
        headers: retryHeaders,
      });
      
      if (!retryResponse.ok) {
        const errorData = await retryResponse.json().catch(() => ({}));
        throw new Error(JSON.stringify(errorData));
      }
      
      return retryResponse.json();
    } else {
      clearTokens();
      throw new Error('Session expired. Please login again.');
    }
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[Database API] Error response:', { status: response.status, data: errorData });
    throw new Error(JSON.stringify(errorData));
  }
  
  return response.json();
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Create a new database connection configuration
 * 
 * This saves the connection details but does NOT test the connection.
 * Connection is created with status='failed' initially.
 * 
 * @param projectId - UUID of the project
 * @param payload - Connection configuration (db_type, host)
 * @returns The created connection data
 */
export async function createDbConnection(
  projectId: string,
  payload: CreateDbConnectionRequest
): Promise<DatabaseConnectionData> {
  return authFetch<DatabaseConnectionData>(`/api/projects/${projectId}/db-connections/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Test a real database connection
 * 
 * Instructs the backend to connect to the configured database.
 * 
 * @param projectId - UUID of the project
 * @param connectionId - ID of the connection to test
 * @returns Test result with status and message
 */
export async function testDbConnection(
  projectId: string,
  connectionId: number
): Promise<TestConnectionResponse> {
  return authFetch<TestConnectionResponse>(
    `/api/projects/${projectId}/db-connections/${connectionId}/test/`,
    { method: 'POST' }
  );
}

/**
 * Fetch tables from a connected database
 * 
 * Queries the real database for actual table and column metadata.
 * 
 * Only works if the connection status is 'connected'.
 * 
 * @param projectId - UUID of the project
 * @param connectionId - ID of the connection
 * @returns List of tables with metadata
 */
export async function fetchDbTables(
  projectId: string,
  connectionId: number
): Promise<FetchTablesResponse> {
  return authFetch<FetchTablesResponse>(
    `/api/projects/${projectId}/db-connections/${connectionId}/tables/`,
    { method: 'GET' }
  );
}

/**
 * Parse database API error response
 * 
 * @param error - Error from API call
 * @returns User-friendly error message
 */
export function parseDatabaseError(error: unknown): string {
  if (error instanceof Error) {
    try {
      const parsed: DatabaseError = JSON.parse(error.message);
      
      // Check for specific field errors
      if (parsed.detail) return parsed.detail;
      if (parsed.message) return parsed.message;
      if (parsed.db_type?.length) return `Database type: ${parsed.db_type[0]}`;
      if (parsed.host?.length) return `Host: ${parsed.host[0]}`;
      if (parsed.non_field_errors?.length) return parsed.non_field_errors[0];
      
      // Return stringified error if no specific message
      return error.message;
    } catch {
      // Not JSON, return the message as-is
      return error.message;
    }
  }
  
  return 'An unexpected error occurred';
}
