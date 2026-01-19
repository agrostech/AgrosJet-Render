/**
 * API Helper for ShiftJet Kurye Yönetim Sistemi
 * Handles API calls with permission headers
 */

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Get the current admin ID from localStorage
 */
const getAdminId = () => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.id || null;
    }
  } catch (e) {
    console.error('Error getting admin ID:', e);
  }
  return null;
};

/**
 * Create headers with X-Admin-Id for permission checking
 */
export const createHeaders = (additionalHeaders = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };

  const adminId = getAdminId();
  if (adminId) {
    headers['X-Admin-Id'] = adminId;
  }

  return headers;
};

/**
 * Wrapper around fetch that adds permission headers
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

  if (response.status === 403) {
    const data = await response.json();
    throw new Error(data.detail || 'Bu işlem için yetkiniz yok');
  }

  return response;
};

/**
 * GET request with permission headers
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
 * POST request with permission headers
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
 * PUT request with permission headers
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
 * DELETE request with permission headers
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
