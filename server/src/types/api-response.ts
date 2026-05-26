export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export function ok<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

export function fail(code: string, message: string): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
    },
  };
}
