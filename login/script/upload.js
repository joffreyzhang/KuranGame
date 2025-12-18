import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { minioClient, ensureBucketExists } from '../storage/minioClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// node upload.js D:\download\minio\ace33b3a23b75a51\28e4a3df1adfb93379cd48e7c5c43ab9 interactive-fiction-game-init
/**
 * 根据文件扩展名获取 Content-Type
 */
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.txt': 'text/plain; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * 递归收集文件夹中的所有文件
 * @param {string} dir - 目录路径
 * @param {string} baseDir - 基础目录（用于计算相对路径）
 * @returns {Array<{abs: string, rel: string}>} 文件列表
 */
function collectFiles(dir, baseDir = null) {
  const files = [];
  const base = baseDir || dir;

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) {
      console.warn(`[Warn] 目录不存在: ${currentDir}`);
      return;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // 递归遍历子目录
        walk(entryPath);
      } else if (entry.isFile()) {
        // 计算相对路径
        const relativePath = path.relative(base, entryPath);
        files.push({
          abs: entryPath,
          rel: relativePath
        });
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * 删除 MinIO 中指定前缀下的所有对象
 */
async function deletePrefixObjects(bucketName, prefix) {
  try {
    const listStream = minioClient.listObjectsV2(bucketName, prefix, true);
    const objects = [];
    
    await new Promise((resolve, reject) => {
      listStream.on('data', obj => {
        if (obj && obj.name && !obj.name.endsWith('/')) {
          objects.push(obj.name);
        }
      });
      listStream.on('end', resolve);
      listStream.on('error', reject);
    });

    if (objects.length === 0) {
      return 0;
    }

    try {
      await minioClient.removeObjects(bucketName, objects);
      return objects.length;
    } catch (error) {
      console.warn(`[Warn] 批量删除失败，尝试逐个删除:`, error.message);
      let deleted = 0;
      for (const objName of objects) {
        try {
          await minioClient.removeObject(bucketName, objName);
          deleted++;
        } catch (e) {
          console.warn(`[Warn] 删除对象 ${objName} 失败:`, e.message);
        }
      }
      return deleted;
    }
  } catch (error) {
    console.warn(`[Warn] 列出对象时出错:`, error.message);
    return 0;
  }
}

/**
 * 上传单个文件到 MinIO
 */
async function uploadFile(localPath, bucketName, objectKey) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(localPath);
    const contentType = getContentType(localPath);
    const readStream = fs.createReadStream(localPath);

    minioClient.putObject(
      bucketName,
      objectKey,
      readStream,
      stat.size,
      { 'Content-Type': contentType },
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * 递归上传本地文件夹到 MinIO
 * @param {string} localDir - 本地文件夹路径
 * @param {string} bucketName - MinIO 存储桶名称
 * @param {string} destPrefix - 目标前缀（可选，相当于 MinIO 中的目录路径）
 * @param {boolean} deleteBeforeUpload - 是否在上传前删除 prefix 下的所有对象
 */
async function uploadFolderToMinio(localDir, bucketName, destPrefix = '', deleteBeforeUpload = false) {
  // 确保存储桶存在
  console.log(`[Info] 检查存储桶: ${bucketName}`);
  await ensureBucketExists(bucketName);

  // 解析本地目录路径
  const sourceDir = path.isAbsolute(localDir) 
    ? localDir 
    : path.resolve(process.cwd(), localDir);

  // 检查本地目录是否存在
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`本地目录不存在: ${sourceDir}`);
  }

  // 检查是否为目录
  const stat = fs.statSync(sourceDir);
  if (!stat.isDirectory()) {
    throw new Error(`路径不是目录: ${sourceDir}`);
  }

  console.log(`[Info] 本地目录: ${sourceDir}`);

  // 规范化前缀
  let normalizedPrefix = destPrefix || '';
  if (normalizedPrefix && !normalizedPrefix.endsWith('/')) {
    normalizedPrefix += '/';
  }
  if (normalizedPrefix) {
    console.log(`[Info] 目标前缀: ${normalizedPrefix}`);
  }

  // 如果指定删除，先删除 prefix 下的所有对象
  if (deleteBeforeUpload && normalizedPrefix) {
    console.log(`[Info] 正在删除目标前缀下的旧对象...`);
    const deletedCount = await deletePrefixObjects(bucketName, normalizedPrefix);
    console.log(`[Info] 已删除 ${deletedCount} 个旧对象`);
  }

  // 收集所有文件
  console.log(`[Info] 正在扫描文件夹...`);
  const files = collectFiles(sourceDir);
  
  if (files.length === 0) {
    console.log('[Info] 目录中没有文件需要上传');
    return { 
      success: true, 
      uploaded: 0, 
      failed: 0,
      total: 0,
      bucket: bucketName, 
      prefix: normalizedPrefix 
    };
  }

  console.log(`[Info] 找到 ${files.length} 个文件，开始上传...\n`);

  // 上传文件
  let uploaded = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      // 将 Windows 路径分隔符转换为 Unix 风格（MinIO 使用 /）
      const objectKey = normalizedPrefix + file.rel.split(path.sep).join('/');
      
      await uploadFile(file.abs, bucketName, objectKey);
      
      uploaded++;
      const progress = `[${i + 1}/${files.length}]`;
      console.log(`${progress} ✓ ${file.rel} -> ${bucketName}/${objectKey}`);
    } catch (err) {
      failed++;
      errors.push({ file: file.rel, error: err.message });
      console.error(`[${i + 1}/${files.length}] ✗ ${file.rel} - 错误: ${err.message}`);
    }
  }

  // 输出统计信息
  console.log('\n' + '='.repeat(60));
  console.log(`[Summary] 上传完成`);
  console.log(`  存储桶: ${bucketName}`);
  console.log(`  前缀: ${normalizedPrefix || '(根目录)'}`);
  console.log(`  总文件数: ${files.length}`);
  console.log(`  上传成功: ${uploaded} 个`);
  if (failed > 0) {
    console.log(`  上传失败: ${failed} 个`);
    console.log('\n失败的文件:');
    errors.forEach(({ file, error }) => {
      console.log(`  - ${file}: ${error}`);
    });
  }
  console.log('='.repeat(60));

  return {
    success: true,
    uploaded,
    failed,
    total: files.length,
    bucket: bucketName,
    prefix: normalizedPrefix,
    errors: failed > 0 ? errors : undefined
  };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('用法: node upload.js <本地文件夹路径> <存储桶名称> [目标前缀] [--delete-before]');
    console.error('');
    console.error('参数说明:');
    console.error('  <本地文件夹路径>  - 要上传的本地文件夹路径（绝对路径或相对路径）');
    console.error('  <存储桶名称>     - MinIO 存储桶名称');
    console.error('  [目标前缀]        - 可选，MinIO 中的目标路径前缀（如 "user_123/game-files/"）');
    console.error('  [--delete-before] - 可选，上传前删除目标前缀下的所有对象');
    console.error('');
    console.error('示例:');
    console.error('  node upload.js D:\\download\\minio-data my-bucket');
    console.error('  node upload.js ./game_saves my-bucket user_123/game-files/');
    console.error('  node upload.js ./game_saves my-bucket user_123/game-files/ --delete-before');
    process.exit(1);
  }

  const localDir = args[0];
  const bucketName = args[1];
  const destPrefix = args[2] || '';
  const deleteBeforeUpload = args.includes('--delete-before');

  try {
    await uploadFolderToMinio(localDir, bucketName, destPrefix, deleteBeforeUpload);
    console.log('\n[Success] 所有操作完成');
  } catch (err) {
    console.error('\n[Error] 执行出错:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  }
}

main();
