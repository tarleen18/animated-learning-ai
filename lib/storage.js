const fs = require('fs/promises');
const path = require('path');

async function uploadFile(filePath, destKey) {
  // If AWS S3 is configured, upload to S3 (private) and return a presigned GET URL.
  const bucket = process.env.AWS_S3_BUCKET;
  if (bucket && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    try {
      const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const body = await fs.readFile(filePath);
      const Key = destKey || path.basename(filePath);
      // upload as private by default
      await client.send(new PutObjectCommand({ Bucket: bucket, Key, Body: body }));
      // generate presigned GET URL
      const getCmd = new GetObjectCommand({ Bucket: bucket, Key });
      const signedUrl = await getSignedUrl(client, getCmd, { expiresIn: Number(process.env.S3_PRESIGNED_EXPIRES || 3600) });
      return { url: signedUrl, key: Key };
    } catch (e) {
      console.warn('S3 upload or presign failed, falling back to local copy:', e.message || e);
    }
  }

  // local fallback: copy to public/renders
  const outDir = path.join(process.cwd(), 'public', 'renders');
  await fs.mkdir(outDir, { recursive: true });
  const fileName = destKey || path.basename(filePath);
  const destPath = path.join(outDir, fileName);
  await fs.copyFile(filePath, destPath);
  const url = `/renders/${encodeURIComponent(fileName)}`;
  return { url, key: fileName };
}

async function getPresignedUrl(key, expires = 3600) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return null;
  try {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const signedUrl = await getSignedUrl(client, getCmd, { expiresIn: expires });
    return signedUrl;
  } catch (e) {
    console.warn('getPresignedUrl failed', e.message || e);
    return null;
  }
}

module.exports = { uploadFile, getPresignedUrl };
