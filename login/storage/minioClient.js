import * as Minio from 'minio';
import dotenv from 'dotenv';

dotenv.config();

// 获取 MinIO 配置
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || '39.97.36.219';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';

// 内部连接客户端 
export const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  // 优先使用专用的Access Key，如果没有则使用Root用户凭据
  accessKey: 'retainer_admin',
  secretKey: 'RetainerSecure2025!',
  // 添加请求超时配置（30秒）
  requestTimeout: 30000,
  // 添加连接超时配置（10秒）
  connectTimeout: 10000,
});

// 记录 MinIO 连接配置（用于调试）
console.log(`[MinIO] 配置: ${MINIO_USE_SSL ? 'https' : 'http'}://${MINIO_ENDPOINT}:${MINIO_PORT}`);

// 公共URL生成客户端 (用于生成外部可访问的URL)
const MINIO_PUBLIC_ENDPOINT = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || '39.97.36.219';
const MINIO_PUBLIC_PORT = parseInt(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000', 10);

export const minioPublicClient = new Minio.Client({
  endPoint: MINIO_PUBLIC_ENDPOINT,
  port: MINIO_PUBLIC_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: 'retainer_admin',
  secretKey: 'RetainerSecure2025!',
  // 添加请求超时配置（30秒）
  requestTimeout: 40000,
  // 添加连接超时配置（10秒）
  connectTimeout: 20000,
});

/**
 * 检查 MinIO 服务器连接
 * @returns {Promise<boolean>} 连接是否成功
 */
export async function checkMinioConnection() {
  try {
    await minioClient.listBuckets();
    return true;
  } catch (error) {
    console.error(`[MinIO] 连接检查失败: ${error.message}`);
    console.error(`[MinIO] 尝试连接到: ${MINIO_USE_SSL ? 'https' : 'http'}://${MINIO_ENDPOINT}:${MINIO_PORT}`);
    return false;
  }
}

// 用于检查并创建存储桶，并设置为公开读取
export async function ensureBucketExists(bucketName) {
  try {
    const exists = await minioClient.bucketExists(bucketName).catch(() => false);
    if (!exists) {
      await minioClient.makeBucket(bucketName);
    }
    
    // 设置存储桶策略为公开读取（允许所有人读取对象）
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`]
        }
      ]
    };
    
    try {
      await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
      // console.log(`存储桶 ${bucketName} 已设置为公开读取`);
    } catch (error) {
      // 如果策略已存在或设置失败，只记录警告，不阻止程序继续
      console.warn(`设置存储桶 ${bucketName} 策略时出现问题:`, error.message);
    }
  } catch (error) {
    // 如果是连接错误，提供更详细的错误信息
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error(`[MinIO] 无法连接到服务器: ${MINIO_USE_SSL ? 'https' : 'http'}://${MINIO_ENDPOINT}:${MINIO_PORT}`);
      console.error(`[MinIO] 错误代码: ${error.code}, 错误信息: ${error.message}`);
      console.error(`[MinIO] 请检查:`);
      console.error(`  1. MinIO 服务器是否正在运行`);
      console.error(`  2. 网络连接是否正常`);
      console.error(`  3. 防火墙是否阻止了连接`);
      console.error(`  4. 环境变量 MINIO_ENDPOINT 和 MINIO_PORT 是否正确配置`);
    }
    throw error;
  }
}


