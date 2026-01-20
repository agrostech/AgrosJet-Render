/**
 * Simple Axios Configuration
 * No permission headers, no complex error handling
 */
import axios from 'axios';

// Create axios instance with base URL
const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL,
});

export default axiosInstance;
