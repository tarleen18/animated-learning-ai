import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import prisma from '../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { jobId } = req.query;
  if (!jobId) return res.status(400).json({ error: 'jobId query param required' });

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const job = await prisma.job.findUnique({ where: { id: jobId }, include: { assets: true } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.userId !== session.user.id) return res.status(403).json({ error: 'Forbidden' });

    // prefer jobStore realtime status when available
    let storeStatus = null;
    try { const mod = await import('../../lib/jobStore'); storeStatus = await mod.getJobStatus(jobId); } catch (e) {}

    let jobMeta = {};
    try {
      if (storeStatus?.meta) jobMeta = storeStatus.meta;
      else if (typeof job.meta === 'string') jobMeta = JSON.parse(job.meta || '{}');
      else jobMeta = job.meta || {};
    } catch (e) { jobMeta = {}; }

    const response = {
      jobId: job.id,
      status: storeStatus?.status || job.status,
      meta: jobMeta,
      assets: job.assets
    };
    // If S3 is configured, replace asset URLs with fresh presigned GET URLs
    try {
      if (process.env.AWS_S3_BUCKET && Array.isArray(response.assets)) {
        const mod = await import('../../lib/storage');
        for (const a of response.assets) {
          if (a.key) {
            const signed = await mod.getPresignedUrl(a.key, Number(process.env.S3_PRESIGNED_EXPIRES || 3600));
            if (signed) a.url = signed;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to attach presigned urls', e.message || e);
    }
    return res.status(200).json(response);
  } catch (e) {
    console.error('job-status error', e);
    return res.status(500).json({ error: String(e) });
  }
}
