/**
 * API Helper for AgrosJet Kurye Yönetim Sistemi
 * Simple API call helpers without permission headers
 */

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Create headers for API calls
 */
export const createHeaders = (additionalHeaders = {}) => {
  return {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };
};

/**
 * Wrapper around fetch
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  
  const headers = createHeaders(options.headers || {});
  
  // Don't set Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
};

/**
 * GET request
 */
export const apiGet = async (endpoint) => {
  const response = await apiFetch(endpoint);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.detail || 'İstek başarısız');
  }
  return response.json();
};

/**
 * POST request
 */
export const apiPost = async (endpoint, data) => {
  const response = await apiFetch(endpoint, {
    method: 'POST',
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'İstek başarısız');
  }
  return response.json();
};

/**
 * PUT request
 */
export const apiPut = async (endpoint, data) => {
  const response = await apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'İstek başarısız');
  }
  return response.json();
};

/**
 * DELETE request
 */
export const apiDelete = async (endpoint, data = null) => {
  const options = {
    method: 'DELETE',
  };
  if (data) {
    options.body = JSON.stringify(data);
  }
  const response = await apiFetch(endpoint, options);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'İstek başarısız');
  }
  return response.json();
};

export default {
  createHeaders,
  apiFetch,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
};
