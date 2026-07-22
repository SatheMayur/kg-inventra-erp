import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4000/api'
});

// Attach token to every request
client.interceptors.request.use(config => {
  const token = localStorage.getItem('fg_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

let _redirecting = false;

// On 401: clear storage and redirect to login (guard prevents duplicate redirects)
client.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401 && !_redirecting) {
      _redirecting = true;
      localStorage.removeItem('fg_token');
      localStorage.removeItem('fg_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
