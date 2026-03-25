import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createResponse, logError } from "../helper/helper.js";

const region = process.env.REGION;
const ERROR_LOGS_BUCKET = process.env.ERROR_LOGS_BUCKET;
const s3 = new S3Client({ region });

export const handler = async (event) => {
  const startTime = Date.now();
  try {
    const errorId = event.pathParameters?.errorId;

    if (!errorId) {
      return createResponse(400, {
        success: false,
        message: "Missing required path parameter: errorId",
      });
    }

    const qs = event.queryStringParameters || {};
    const date = qs.date || null;
    const service = qs.service || null;

    // If date and service provided, build exact key
    if (date && service) {
      const [year, month, day] = date.split("-");
      const key = `${year}/${month}/${day}/${service}/${errorId}.json`;
      try {
        const result = await s3.send(new GetObjectCommand({
          Bucket: ERROR_LOGS_BUCKET,
          Key: key,
        }));
        const body = await result.Body.transformToString();
        return createResponse(200, {
          success: true,
          data: JSON.parse(body),
          duration: Date.now() - startTime,
        });
      } catch (err) {
        if (err.name === "NoSuchKey") {
          return createResponse(404, {
            success: false,
            message: `Error log '${errorId}' not found at ${key}`,
          });
        }
        throw err;
      }
    }

    // Otherwise, search for the errorId across the bucket
    const prefix = date ? `${date.split("-").join("/")}/` : "";
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: ERROR_LOGS_BUCKET,
      Prefix: prefix,
      MaxKeys: 1000,
    }));

    const match = (listResult.Contents || []).find((obj) =>
      obj.Key.endsWith(`/${errorId}.json`)
    );

    if (!match) {
      return createResponse(404, {
        success: false,
        message: `Error log with id '${errorId}' not found`,
      });
    }

    const result = await s3.send(new GetObjectCommand({
      Bucket: ERROR_LOGS_BUCKET,
      Key: match.Key,
    }));
    const body = await result.Body.transformToString();

    return createResponse(200, {
      success: true,
      data: JSON.parse(body),
      duration: Date.now() - startTime,
    });
  } catch (error) {
    logError(error, "getError handler");
    return createResponse(500, {
      success: false,
      message: "Failed to get error details",
      error: error.message || "Internal server error",
    });
  }
};
