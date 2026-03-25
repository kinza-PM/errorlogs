import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { createResponse, logError } from "../helper/helper.js";

const region = process.env.REGION;
const ERROR_LOGS_BUCKET = process.env.ERROR_LOGS_BUCKET;
const s3 = new S3Client({ region });

export const handler = async (event) => {
  const startTime = Date.now();
  try {
    const qs = event.queryStringParameters || {};
    const limit = Math.min(parseInt(qs.limit || "20", 10), 100);
    const nextToken = qs.nextToken || null;
    const service = qs.service || null;
    const date = qs.date || new Date().toISOString().split("T")[0]; // default: today (YYYY-MM-DD)
    const [year, month, day] = date.split("-");

    // Build S3 prefix: YYYY/MM/DD/ or YYYY/MM/DD/service/
    let prefix = `${year}/${month}/${day}/`;
    if (service) {
      prefix = `${year}/${month}/${day}/${service}/`;
    }

    // List objects in the prefix
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: ERROR_LOGS_BUCKET,
      Prefix: prefix,
      MaxKeys: limit,
      ContinuationToken: nextToken || undefined,
    }));

    const objects = listResult.Contents || [];

    // Fetch each JSON object
    const errors = await Promise.all(
      objects.map(async (obj) => {
        try {
          const getResult = await s3.send(new GetObjectCommand({
            Bucket: ERROR_LOGS_BUCKET,
            Key: obj.Key,
          }));
          const body = await getResult.Body.transformToString();
          return JSON.parse(body);
        } catch (err) {
          console.warn(`Failed to read ${obj.Key}:`, err.message);
          return { key: obj.Key, error: "Failed to read" };
        }
      })
    );

    return createResponse(200, {
      success: true,
      data: {
        errors,
        count: errors.length,
        date,
        service: service || "all",
        nextToken: listResult.NextContinuationToken || null,
      },
      duration: Date.now() - startTime,
    });
  } catch (error) {
    logError(error, "listErrors handler");
    return createResponse(500, {
      success: false,
      message: "Failed to list errors",
      error: error.message || "Internal server error",
    });
  }
};
