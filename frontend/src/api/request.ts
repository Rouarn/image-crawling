import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { antdUtils } from '@/utils/antd-global';

const config: AxiosRequestConfig = {
  baseURL: '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
};

const request: AxiosInstance = axios.create(config);

request.interceptors.request.use(
  (reqConfig) => 
    // Add CSRF token if needed, or other headers
    // const token = localStorage.getItem('token');
    // if (token) {
    //   reqConfig.headers.Authorization = `Bearer ${token}`;
    // }
     reqConfig
  ,
  (error) => Promise.reject(error)
);

request.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error) => {
    const msg = error.response?.data?.message || error.message || 'Unknown Error';
    antdUtils.message.error(msg);
    return Promise.reject(error);
  }
);

export default request;
