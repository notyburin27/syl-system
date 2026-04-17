import { S3Client } from "@aws-sdk/client-s3"

export const spacesClient = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT!,
  region: process.env.DO_SPACES_REGION!,
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
  forcePathStyle: false,
})

export const SPACES_BUCKET = process.env.DO_SPACES_BUCKET!
export const SPACES_CDN_BASE = process.env.DO_SPACES_CDN_BASE
