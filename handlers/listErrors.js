import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { createResponse, logError } from "../helper/helper.js";

const region = process.env.REGION;
const ERROR_LOGS_BUCKET = process.env.ERROR_LOGS_BUCKET;
const s3 = new S3Client({ region });

export const handler = async (event) => {
  const startTime = Date.now();
  try {
    const qs = event.queryStringParameters || {};
    const limit = Math.min(parseInt(qs.limit || "20", 10), 1000);
    const nextToken = qs.nextToken || null;
    const service = qs.service || null;
    const statusCode = qs.statusCode ? parseInt(qs.statusCode, 10) : null;
    const from = qs.from || null; // ISO date string
    const to = qs.to || null; // ISO date string

    // Parse date range
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    // Build S3 prefix based on service filter
    const prefix = service ? "" : ""; // Search all, we'll filter by date range later

    // List objects in the bucket (or with service prefix if specified)
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: ERROR_LOGS_BUCKET,
      Prefix: prefix,
      MaxKeys: limit,
      ContinuationToken: nextToken || undefined,
    }));

    let objects = listResult.Contents || [];

    // Filter by service if specified (check if key contains service name)
    if (service) {
      objects = objects.filter(obj => obj.Key.includes(`/${service}/`));
    }

    // Filter by date range if specified
    if (fromDate || toDate) {
      objects = objects.filter(obj => {
        // Extract date from S3 key: YYYY/MM/DD/service/errorId.json
        const keyParts = obj.Key.split('/');
        if (keyParts.length >= 3) {
          const [year, month, day] = keyParts;
          const objDate = new Date(`${year}-${month}-${day}`);
          
          if (fromDate && objDate < fromDate) return false;
          if (toDate && objDate > toDate) return false;
          return true;
        }
        return false;
      });
    }

    // Limit results
    objects = objects.slice(0, limit);

    // Fetch each JSON object
    let errors = await Promise.all(
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

    // Filter by statusCode if specified
    if (statusCode) {
      errors = errors.filter(err => err.statusCode === statusCode);
    }

    return createResponse(200, {
      success: true,
      data: {
        errors,
        count: errors.length,
        from: from || "all",
        to: to || "all",
        service: service || "all",
        statusCode: statusCode || "all",
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
