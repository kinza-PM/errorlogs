import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { createResponse, sanitizeInput, logError } from "../helper/helper.js";

const region = process.env.REGION;
const ERROR_LOGS_BUCKET = process.env.ERROR_LOGS_BUCKET;
const s3 = new S3Client({ region });

export const handler = async (event) => {
  const startTime = Date.now();
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};

    // Validate required fields
    if (!body.service || typeof body.service !== "string") {
      return createResponse(400, {
        success: false,
        message: "Missing or invalid field: service",
      });
    }

    if (!body.statusCode || typeof body.statusCode !== "number") {
      return createResponse(400, {
        success: false,
        message: "Missing or invalid field: statusCode (must be a number)",
      });
    }

    if (!body.errorTitle || typeof body.errorTitle !== "string") {
      return createResponse(400, {
        success: false,
        message: "Missing or invalid field: errorTitle",
      });
    }

    const errorId = uuidv4();
    const timestamp = new Date().toISOString();
    const [year, month, day] = timestamp.split("T")[0].split("-");
    const service = sanitizeInput(body.service, 100);

    const errorLog = {
      errorId,
      timestamp,
      service,
      statusCode: body.statusCode,
      errorTitle: sanitizeInput(body.errorTitle, 500),
      errorMessage: sanitizeInput(body.errorMessage || "", 2000),
      path: sanitizeInput(body.path || "", 500),
      method: sanitizeInput(body.method || "", 10).toUpperCase(),
      userId: sanitizeInput(body.userId || "system", 200),
      requestId: sanitizeInput(body.requestId || "", 200),
      stackTrace: sanitizeInput(body.stackTrace || "", 5000),
      environment: sanitizeInput(body.environment || process.env.STAGE || "dev", 20),
    };

    if (body.metadata && typeof body.metadata === "object") {
      errorLog.metadata = body.metadata;
    }

    // S3 key: YYYY/MM/DD/service/errorId.json
    const key = `${year}/${month}/${day}/${service}/${errorId}.json`;

    await s3.send(new PutObjectCommand({
      Bucket: ERROR_LOGS_BUCKET,
      Key: key,
      Body: JSON.stringify(errorLog, null, 2),
      ContentType: "application/json",
    }));

    return createResponse(200, {
      success: true,
      message: "Error logged successfully",
      data: { errorId, timestamp, key },
      duration: Date.now() - startTime,
    });
  } catch (error) {
    logError(error, "logError handler");
    return createResponse(500, {
      success: false,
      message: "Failed to log error",
      error: error.message || "Internal server error",
    });
  }
};
