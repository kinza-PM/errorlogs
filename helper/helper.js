/**
 * Standard response helper for error-log-service
 */
export const createResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

/**
 * Sanitize a string input — trim and limit length
 */
export const sanitizeInput = (value, maxLength = 2000) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

/**
 * Log error to console with context
 */
export const logError = (error, context = "") => {
  console.error(`[ERROR] ${context}:`, error?.message || error);
  if (error?.stack) console.error(error.stack);
};
