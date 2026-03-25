import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { sanitizeInput, logError } from "../helper/helper.js";

const region = process.env.REGION;
const ERROR_LOGS_BUCKET = process.env.ERROR_LOGS_BUCKET;
const s3 = new S3Client({ region });

export const handler = async (event) => {
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);

      // Skip if missing required fields
      if (!body.service || !body.statusCode || !body.errorTitle) {
        console.warn("Skipping SQS record — missing required fields:", body);
        continue;
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

      console.log(`Error logged to S3: ${key}`);
    } catch (error) {
      logError(error, "logErrorSqs handler");
      // Don't throw — let other records in the batch succeed
    }
  }
};
