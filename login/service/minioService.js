import { minioClient, ensureBucketExists } from '../storage/minioClient.js';
import { getCreatorUserIdByFileId, updateDocUrlByFileId } from './gamesService.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// 获取存储桶名称
const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'retainer-assets';

/**
 * 上传图片到 MinIO 指定路径
 * @param {Buffer} fileBuffer - 图片文件的 Buffer
 * @param {string} objectPath - MinIO 对象路径，如 'interactive-fiction-game-init/game123/cover/image.jpg'
 * @param {string} mimetype - MIME 类型 (如 'image/jpeg', 'image/png')
 * @param {string} bucketName - 存储桶名称，默认使用 BUCKET_NAME
 * @returns {Promise<string>} 返回 MinIO 的公开 URL
 */
export async function uploadImageToPath(fileBuffer, objectPath, mimetype, bucketName = BUCKET_NAME) {
  try {
    await ensureBucketExists(bucketName);
    
    await minioClient.putObject(bucketName, objectPath, fileBuffer, {
      'Content-Type': mimetype,
    });

    const isSSL = process.env.MINIO_USE_SSL === 'true';
    const protocol = isSSL ? 'https' : 'http';
    const port = parseInt(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000', 10);
    const endpoint = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || '39.97.36.219';
    const url = `${protocol}://${endpoint}:${port}/${bucketName}/${objectPath}`;

    return url;
  } catch (error) {
    console.error('MinIO 上传图片错误:', error);
    throw new Error(`图片上传失败: ${error.message}`);
  }
}

/**
 * 上传 PDF/DOC 文件到 MinIO 指定路径
 * @param {Buffer} fileBuffer - 文件的 Buffer
 * @param {string} objectPath - MinIO 对象路径，如 'interactive-fiction-game-init/game123/document.pdf'
 * @param {string} mimetype - MIME 类型 (如 'application/pdf')
 * @param {string} bucketName - 存储桶名称，默认使用 BUCKET_NAME
 * @returns {Promise<string>} 返回 MinIO 的公开 URL
 */
export async function uploadDocumentToPath(fileBuffer, objectPath, mimetype, bucketName = BUCKET_NAME) {
  try {
    await ensureBucketExists(bucketName);
    
    await minioClient.putObject(bucketName, objectPath, fileBuffer, {
      'Content-Type': mimetype,
    });

    const isSSL = process.env.MINIO_USE_SSL === 'true';
    const protocol = isSSL ? 'https' : 'http';
    const port = parseInt(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000', 10);
    const endpoint = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || '39.97.36.219';
    const url = `${protocol}://${endpoint}:${port}/${bucketName}/${objectPath}`;

    return url;
  } catch (error) {
    console.error('MinIO 上传文档错误:', error);
    throw new Error(`文档上传失败: ${error.message}`);
  }
}

/**
 * 上传图片到 MinIO
 * @param {Buffer} fileBuffer - 图片文件的 Buffer
 * @param {string} originalName - 原始文件名
 * @param {string} mimetype - MIME 类型 (如 'image/jpeg', 'image/png')
 * @returns {Promise<{success: boolean, url: string}>}
 */
export async function uploadImage(fileBuffer, originalName, mimetype, destPath) {
  try {
    // 解析目标路径：格式如 'bucket/prefix1/prefix2'
    let bucketName = BUCKET_NAME;
    let objectPrefix = 'images';
    if (destPath && typeof destPath === 'string') {
      const trimmed = destPath.replace(/^\/+|\/+$/g, '');
      const firstSlash = trimmed.indexOf('/');
      if (firstSlash === -1) {
        bucketName = trimmed || BUCKET_NAME;
        objectPrefix = '';
      } else {
        bucketName = trimmed.slice(0, firstSlash) || BUCKET_NAME;
        objectPrefix = trimmed.slice(firstSlash + 1);
      }
    }

    // 确保存储桶存在
    await ensureBucketExists(bucketName);

    // 生成唯一的对象名（文件名）
    const fileId = crypto.randomBytes(8).toString('hex');
    const ext = (originalName && originalName.includes('.')) ? originalName.split('.').pop() : 'jpg';
    const prefix = objectPrefix ? objectPrefix.replace(/\/+$/g, '') : '';
    const objectName = (prefix ? `${prefix}/` : '') + `${fileId}.${ext}`;

    // 上传文件到 MinIO
    await minioClient.putObject(bucketName, objectName, fileBuffer, {
      'Content-Type': mimetype,
    });

    // 生成直接访问 URL（存储桶设置为公开）
    const isSSL = process.env.MINIO_USE_SSL === 'true';
    const protocol = isSSL ? 'https' : 'http';
    const port = parseInt(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000', 10);
    const endpoint = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || '39.97.36.219';
    const url = `${protocol}://${endpoint}:${port}/${bucketName}/${objectName}`;

    return {
      success: true,
      url: url,
    };
  } catch (error) {
    console.error('MinIO 上传错误:', error);
    throw new Error(`图片上传失败: ${error.message}`);
  }
}

/**
 * 测试上传接口 - 上传图片并返回 URL
 * 从 form-data 接收参数：
 * - bucketName: 存储桶名称（必填）
 * - objectPath: MinIO 对象路径（必填），如 'interactive-fiction-game-init/game123/cover/image.jpg'
 * - image: 图片文件（必填）
 * @param {Express.Request} req - Express 请求对象
 * @param {Express.Response} res - Express 响应对象
 */
export async function testUploadImage(req, res) {
  try {
    // 从 form-data 获取参数
    const { bucketName, objectPath } = req.body || {};

    // 验证必填参数
    if (!bucketName) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：bucketName（存储桶名称）',
      });
    }

    if (!objectPath) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：objectPath（MinIO 对象路径）',
      });
    }

    // 获取上传的文件
    let file = req.file;
    if (!file && req.files && req.files.length > 0) {
      file = req.files[0];
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        message: '请上传图片文件',
      });
    }

    // 检查图片类型
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: '只支持图片文件格式（jpg, png, gif, webp 等）',
      });
    }

    // 读取文件 Buffer（如果 multer 使用 diskStorage，需要读取文件）
    // 如果使用 memoryStorage，直接使用 file.buffer
    const fileBuffer = file.buffer || fs.readFileSync(file.path);
    const mimetype = file.mimetype;
    
    // 从原始文件名提取扩展名，生成非中文的文件名
    const originalName = file.originalname || 'image.png';
    const ext = path.extname(originalName) || '.png';
    const randomString = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const fileName = `${timestamp}_${randomString}${ext}`;

    // 构建最终的对象路径（objectPath 是目录路径，直接拼接文件名）
    const cleanPath = objectPath.replace(/\/+$/, '');
    const finalObjectPath = `${cleanPath}/${fileName}`;

    // 上传到 MinIO 指定路径
    const url = await uploadImageToPath(fileBuffer, finalObjectPath, mimetype, bucketName);

    // diskStorage：删除临时文件
    const fileToClean = req.file || (req.files && req.files[0]);
    if (fileToClean && fileToClean.path && !fileToClean.buffer) {
      fs.unlinkSync(fileToClean.path);
    }

    return res.json({
      success: true,
      message: '图片上传成功',
      data: {
        url: url,
      },
    });
  } catch (error) {
    console.error('上传接口错误:', error);
    return res.status(500).json({
      success: false,
      message: error.message || '图片上传失败',
    });
  }
}

/**
 * 测试上传接口 - 通过本地路径上传 PDF/DOCX 到 MinIO 并返回 URL
 * 接收参数：{ file_id, file_path, file_name }
 */
export async function testUploadPdf(req, res) {
  try {
    const { file_id, file_path, file_name } = req.body || {};
    
    if (!file_id) {
      return res.status(400).json({ success: false, message: '缺少必填参数：file_id' });
    }
    
    if (!file_path) {
      return res.status(400).json({ success: false, message: '缺少必填参数：file_path' });
    }

    const { url } = await uploadPdfToMinioByFileId(file_path, file_id, file_name);

    return res.json({
      success: true,
      message: '文件上传成功',
      data: { url }
    });
  } catch (error) {
    console.error('文件上传错误:', error);
    const statusCode = error.message.includes('缺少') || error.message.includes('只支持') ? 400 : 
                       error.message.includes('未找到') || error.message.includes('不存在') ? 404 : 500;
    return res.status(statusCode).json({ success: false, message: error.message || 'PDF 上传失败' });
  }
}

/**
 * 根据 bucket 与前缀（伪目录）下载所有对象到本地 location 目录
 * @param {string} bucketName 存储桶名称
 * @param {string} prefix 对象键前缀，如 'user_123/game-files/abc/json/'
 * @param {string} destRoot 本地根目录，默认 'location'
 * @returns {Promise<{success: boolean, downloaded: number, dest: string}>}
 */
export async function downloadPrefixToLocal(bucketName, prefix, destRoot = 'location', options = {}) {
  const workspaceRoot = process.cwd();
  const baseDestDir = path.join(workspaceRoot, destRoot);
  if (!fs.existsSync(baseDestDir)) {
    fs.mkdirSync(baseDestDir, { recursive: true });
  }
  let normalizedPrefix = prefix || '';
  if (normalizedPrefix && !normalizedPrefix.endsWith('/')) {
    normalizedPrefix += '/';
  }

  const listStream = minioClient.listObjectsV2(bucketName, normalizedPrefix, true);
  const objects = [];
  await new Promise((resolve, reject) => {
    listStream.on('data', obj => objects.push(obj));
    listStream.on('end', resolve);
    listStream.on('error', reject);
  });

  let downloaded = 0;
  const stripPrefixSegments = Number(options.stripPrefixSegments) || 0;
  for (const obj of objects) {
    if (!obj || !obj.name || obj.name.endsWith('/') || obj.size === 0 && obj.name.endsWith('/')) {
      continue;
    }

    // 在本地以 prefix 为根还原对象层级：location/<obj.name>
    let relativeKey = obj.name;
    if (stripPrefixSegments > 0) {
      const segments = relativeKey.split('/').filter(Boolean);
      const strippedSegments = segments.slice(stripPrefixSegments);
      if (strippedSegments.length === 0) {
        continue;
      }
      relativeKey = strippedSegments.join('/');
    }

    const targetPath = path.join(baseDestDir, relativeKey);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    await new Promise((resolve, reject) => {
      minioClient.getObject(bucketName, obj.name, (err, dataStream) => {
        if (err) return reject(err);
        const fileStream = fs.createWriteStream(targetPath);
        dataStream.pipe(fileStream);
        dataStream.on('error', reject);
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });
    });

    downloaded += 1;
  }

  return { success: true, downloaded, dest: baseDestDir };
}

/**
 * 根据 bucket 与对象键下载单个文件到本地
 * @param {string} bucketName 存储桶名称
 * @param {string} objectKey 对象键，如 'user_123/game-files/abc.json'
 * @param {string} destRoot 本地根目录，默认 'location'
 * @param {Object} options 选项
 * @param {string} options.filenameOverride 可选，覆盖本地文件名
 * @returns {Promise<{success: boolean, downloaded: number, dest: string, localPath: string}>}
 */
export async function downloadObjectFileToLocal(bucketName, objectKey, destRoot = 'location', options = {}) {
  const workspaceRoot = process.cwd();
  const baseDestDir = path.join(workspaceRoot, destRoot);
  
  // 确保目标目录存在
  if (!fs.existsSync(baseDestDir)) {
    fs.mkdirSync(baseDestDir, { recursive: true });
  }

  // 验证参数
  if (!bucketName) throw new Error('缺少必填参数：bucketName');
  if (!objectKey) throw new Error('缺少必填参数：objectKey');

  // 确定本地文件名
  let localFilename;
  if (options.filenameOverride) {
    localFilename = options.filenameOverride;
  } else {
    // 从对象键中提取文件名（最后一个斜杠后的部分）
    const keySegments = objectKey.split('/');
    localFilename = keySegments[keySegments.length - 1];
  }

  // 构建完整的本地文件路径
  const localPath = path.join(baseDestDir, localFilename);
  
  try {
    // 下载文件
    await new Promise((resolve, reject) => {
      minioClient.getObject(bucketName, objectKey, (err, dataStream) => {
        if (err) {
          // 如果是文件不存在错误，提供更明确的错误信息
          if (err.code === 'NoSuchKey') {
            return reject(new Error(`对象不存在: ${bucketName}/${objectKey}`));
          }
          return reject(err);
        }
        
        const fileStream = fs.createWriteStream(localPath);
        dataStream.pipe(fileStream);
        
        dataStream.on('error', reject);
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });
    });

    // 检查文件是否成功写入
    if (!fs.existsSync(localPath)) {
      throw new Error('文件下载失败，本地文件未创建');
    }

    const stats = fs.statSync(localPath);
    
    return { 
      success: true, 
      downloaded: 1, 
      dest: baseDestDir,
      localPath: localPath,
      filename: localFilename,
      fileSize: stats.size,
      bucket: bucketName,
      objectKey: objectKey
    };
    
  } catch (error) {
    // 清理可能创建的文件（如果下载失败）
    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    } catch (cleanupErr) {
      // 忽略清理错误
    }
    
    throw error;
  }
}

/**
 * 删除指定 bucket/prefix 下的所有对象
 * @param {string} bucketName 存储桶名称
 * @param {string} prefix 对象键前缀，如 'user_123/game-files/'
 * @returns {Promise<{success: boolean, deleted: number}>}
 */
export async function deletePrefixFromMinio(bucketName, prefix) {
  let normalizedPrefix = prefix || '';
  if (normalizedPrefix && !normalizedPrefix.endsWith('/')) {
    normalizedPrefix += '/';
  }

  // 列出所有匹配 prefix 的对象
  const listStream = minioClient.listObjectsV2(bucketName, normalizedPrefix, true);
  const objects = [];
  const skipped = [];
  await new Promise((resolve, reject) => {
    listStream.on('data', obj => {
      if (obj && obj.name) {
        // 排除文件夹（以 '/' 结尾）
        if (obj.name.endsWith('/')) {
          skipped.push({ name: obj.name, reason: '文件夹' });
          return;
        }
        // 排除 doc, docx, pdf 文件
        const lowerName = obj.name.toLowerCase();
        if (lowerName.endsWith('.doc') || 
            lowerName.endsWith('.docx') || 
            lowerName.endsWith('.pdf')) {
          skipped.push({ name: obj.name, reason: '文档文件（doc/docx/pdf）' });
          return;
        }
        objects.push(obj.name);
      }
    });
    listStream.on('end', resolve);
    listStream.on('error', reject);
  });

  if (skipped.length > 0) {
    console.log(`[deletePrefixFromMinio] 跳过 ${skipped.length} 个文件（文件夹或文档文件）:`, 
      skipped.map(s => `${s.name} (${s.reason})`).join(', '));
  }

  if (objects.length === 0) {
    return { success: true, deleted: 0 };
  }

  // 批量删除对象
  let deleted = 0;
  try {
    await minioClient.removeObjects(bucketName, objects);
    deleted = objects.length;
  } catch (error) {
    //批量删除失败，尝试逐个删除
    console.warn('批量删除失败，尝试逐个删除:', error.message);
    for (const objName of objects) {
      try {
        await minioClient.removeObject(bucketName, objName);
        deleted += 1;
      } catch (e) {
        console.warn(`删除对象 ${objName} 失败:`, e.message);
      }
    }
  }

  return { success: true, deleted };
}

/**
 * 将本地目录（默认 uploadfiles）递归上传到 MinIO 指定 bucket/prefix 下（ZZ）
 * 会保留本地的目录层级：localRoot/a/b.txt -> prefix/a/b.txt
 * @param {string} bucketName 目标存储桶
 * @param {string} destPrefix 目标前缀（相当于目录），如 'user_123/game-files/'
 * @param {string} localRoot 本地根目录，默认 'uploadfiles'
 * @param {boolean} deleteBeforeUpload 是否在上传前删除 prefix 下的所有对象，默认 false
 * @returns {Promise<{success: boolean, uploaded: number, bucket: string, prefix: string, deleted?: number}>}
 */
//{   
//  "localRoot": "game_saves/74fcb9f3002fa7a01a5e60d43741363d",
//  "file_id":"74fcb9f3002fa7a01a5e60d43741363d",
//  "bucketName":"interactive-fiction-game-init"
//}
export async function uploadLocalFolderToMinio(bucketName, destPrefix, localRoot , deleteBeforeUpload = false) {
  // 如果第一个参数是对象，则从对象中提取所有参数
  if (bucketName && typeof bucketName === 'object') {
    const { userId, fileId, localRoot: optLocalRoot, deleteBeforeUpload: optDeleteBeforeUpload, bucketName: optBucketName } = bucketName;
    if (!fileId) {
      throw new Error('缺少必填参数：fileId');
    }
    if (!userId) {
      throw new Error('缺少必填参数：userId');
    }
    // 存储前缀：<user_id>/<file_id>/
    destPrefix = `${userId}/${fileId}/`;
    localRoot = (optLocalRoot && String(optLocalRoot).trim()) ? String(optLocalRoot).trim() : 'uploadfiles';
    deleteBeforeUpload = !!optDeleteBeforeUpload;
    bucketName = optBucketName || 'interactive-fiction-game-data';
  } else if (destPrefix && typeof destPrefix === 'object') {
    const { userId, fileId, localRoot: optLocalRoot, deleteBeforeUpload: optDeleteBeforeUpload, bucketName: optBucketName } = destPrefix;
    if (!fileId) {
      throw new Error('缺少必填参数：fileId');
    }
    if (!userId) {
      throw new Error('缺少必填参数：userId');
    }
    // 存储前缀：<user_id>/<file_id>/
    destPrefix = `${userId}/${fileId}/`;
    localRoot = (optLocalRoot && String(optLocalRoot).trim()) ? String(optLocalRoot).trim() : 'uploadfiles';
    deleteBeforeUpload = !!optDeleteBeforeUpload;
    bucketName = optBucketName || 'interactive-fiction-game-data';
  }

  await ensureBucketExists(bucketName);

  const workspaceRoot = process.cwd();
  const sourceDir = path.join(workspaceRoot, localRoot);
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`本地目录不存在: ${sourceDir}`);
  }

  let normalizedPrefix = destPrefix || '';
  if (normalizedPrefix && !normalizedPrefix.endsWith('/')) {
    normalizedPrefix += '/';
  }
  // 如果指定删除，先删除 prefix 下的所有对象
  let deletedCount = 0;
  if (deleteBeforeUpload) {
    try {
      const deleteResult = await deletePrefixFromMinio(bucketName, normalizedPrefix);
      deletedCount = deleteResult.deleted || 0;
    } catch (error) {
      console.warn('删除 prefix 下的对象时出错，继续上传:', error.message);
    }
  }

  // 递归收集文件清单
  /** @type {Array<{abs: string, rel: string}>} */
  const files = [];
  const walk = (currentAbs, currentRel) => {
    const entries = fs.readdirSync(currentAbs, { withFileTypes: true });
    for (const entry of entries) {
      const entryAbs = path.join(currentAbs, entry.name);
      const entryRel = currentRel ? path.join(currentRel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(entryAbs, entryRel);
      } else if (entry.isFile()) {
        // 跳过临时文件（.temp, .tmp 等）
        if (entry.name.endsWith('.temp') || entry.name.endsWith('.tmp')) {
          continue;
        }
        files.push({ abs: entryAbs, rel: entryRel });
      }
    }
  };
  walk(sourceDir, '');

  let uploaded = 0;
  let skipped = 0;
  const errors = [];
  
  for (const f of files) {
    try {
      // 尝试获取文件信息，如果失败则跳过
      let stat;
      try {
        stat = fs.statSync(f.abs);
      } catch (statError) {
        // 统一处理所有类型的文件访问错误
        console.warn(`[图片上传到 MinIO] 跳过文件: ${f.rel} - 错误: ${statError.code} - ${statError.message}`);
        skipped += 1;
        
        // 记录详细的错误信息便于调试
        if (statError.code === 'EPERM') {
          console.warn(`  → 权限不足，请检查文件权限: chmod +r "${f.abs}"`);
        } else if (statError.code === 'EBUSY') {
          console.warn(`  → 文件被其他进程占用，请稍后重试`);
        } else if (statError.code === 'EACCES') {
          console.warn(`  → 访问被拒绝，可能是SELinux或安全策略限制`);
        } else if (statError.code === 'ENOENT') {
          console.warn(`  → 文件不存在，可能已被删除: ${f.abs}`);
        } else {
          console.warn(`  → 未知文件访问错误: ${statError.code}`);
        }
        
        continue; // 跳过当前文件，继续下一个
      } 
      
      // 检查文件是否可读
      if (!stat.isFile()) {
        skipped += 1;
        continue;
      }
      
      const objectKey = normalizedPrefix + f.rel.split(path.sep).join('/');
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(f.abs);
        readStream.on('error', (streamError) => {
          reject(streamError);
        });
        minioClient.putObject(bucketName, objectKey, readStream, stat.size, (err) => {
          if (err) return reject(err);
          return resolve();
        });
      });
      uploaded += 1;
    } catch (error) {
      // 记录错误但继续处理其他文件
      const errorMsg = error.message || String(error);
      errors.push({ file: f.rel, error: errorMsg });
      console.warn(`[图片上传到 MinIO] 上传文件失败: ${f.rel} - ${errorMsg}`);
      skipped += 1;
    }
  }
  
  // 如果有错误，记录警告
  if (errors.length > 0) {
    console.warn(`[图片上传到 MinIO] 共 ${errors.length} 个文件上传失败`);
  }

  return {
    success: true,
    uploaded,
    skipped,
    total: files.length,
    bucket: bucketName,
    prefix: normalizedPrefix,
    ...(deleteBeforeUpload ? { deleted: deletedCount } : {}),
    ...(errors.length > 0 ? { errors } : {})
  };
}

/**
 * 将 public/game_data 下四个初始化 JSON 文件上传到 MinIO
 * 文件名模式：items_<fileId>.json, lore_<fileId>.json, player_<fileId>.json, scenes_<fileId>.json
 * 目标路径：<bucket>/<userId>/<fileId>/<filename>
 */
export async function uploadInitJsonFilesToMinio({ userId, fileId, bucketName = 'interactive-fiction-game-init' , visual = 'false'}) {
  if (!userId) throw new Error('缺少必填参数：userId');
  if (!fileId) throw new Error('缺少必填参数：fileId');

  await ensureBucketExists(bucketName);

  const workspaceRoot = process.cwd();
  const baseDir = visual === 'true' ? path.join(workspaceRoot, 'public', 'visual_game','temp', fileId) : path.join(workspaceRoot, 'public', 'game_data');
  const names = visual === 'true' ? ['metadata.json', 'npcSetting.json', 'sceneSetting.json', 'worldSetting.json'] : ['items', 'lore', 'player', 'scenes'].map(n => `${n}_${fileId}.json`);
  console.log("----------------------------内部上传四个初始化 JSON 文件-----------------------------");

  let uploaded = 0;
  for (const name of names) {
    const abs = path.join(baseDir, name);
    if (!fs.existsSync(abs)) {
      // 跳过不存在的文件
      continue;
    }
    const objectKey = `${userId}/${fileId}/${name}`;
    const buffer = fs.readFileSync(abs);
    await minioClient.putObject(bucketName, objectKey, buffer, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    uploaded += 1;
  }
  console.log("----------------------------内部上传四个初始化 JSON 文件结束-----------------------------");

  return { success: true, uploaded, bucket: bucketName, prefix: `${userId}/${fileId}/` };
}

/**

 */
export async function uploadPresetJsonFilesToMinio({ minioDir, localDir, bucketName = 'interactive-fiction-game-data', deleteBeforeUpload = false }) {
  if (!minioDir) throw new Error('缺少必填参数：minioDir');
  if (!localDir) throw new Error('缺少必填参数：localDir');

  // 规范化路径：去除多余的斜杠，确保格式正确
  // 将 minioDir 中的多个斜杠替换为单个斜杠，去除开头和结尾的斜杠
  const normalizedMinioDir = minioDir.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
  
  console.log(`[Info] 上传预设文件到 MinIO: ${normalizedMinioDir}`);
  await ensureBucketExists(bucketName);

  const workspaceRoot = process.cwd();
  const baseDir = path.isAbsolute(localDir) ? localDir : path.join(workspaceRoot, localDir);
  if (!fs.existsSync(baseDir)) {
    throw new Error(`本地目录不存在: ${baseDir}`);
  }

  // 规范化 prefix：确保只有一个结尾斜杠
  const prefix = normalizedMinioDir ? `${normalizedMinioDir}/` : '';
  let deletedCount = 0;
  // if (deleteBeforeUpload) {
  //   try {
  //     const deleteResult = await deletePrefixFromMinio(bucketName, prefix);
  //     deletedCount = deleteResult.deleted || 0;
  //   } catch (error) {
  //     console.warn('删除 prefix 下的对象时出错，继续上传:', error.message);
  //   }
  // }

  // 读取目录下的所有直接文件（不递归子目录），排除 images 文件夹以及 docx 和 pdf 文件
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile() && 
           !entry.name.toLowerCase().endsWith('.docx') && 
           !entry.name.toLowerCase().endsWith('.pdf')) // 只处理文件，不处理文件夹、docx 和 pdf 文件
    .map(entry => entry.name);

  if (files.length === 0) {
    console.warn(`[uploadPresetJsonFilesToMinio] 警告: 目录 ${baseDir} 中没有找到可上传的文件`);
    return { 
      success: true, 
      uploaded: 0, 
      bucket: bucketName, 
      prefix: prefix,
      warning: '目录中没有找到可上传的文件',
      ...(deleteBeforeUpload ? { deleted: deletedCount } : {})
    };
  }

  console.log(`[uploadPresetJsonFilesToMinio] 找到 ${files.length} 个文件待上传:`, files);

  // 根据文件扩展名判断 Content-Type
  const getContentType = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
  };

  let uploaded = 0;
  const uploadErrors = [];
  for (const filename of files) {
    try {
      const abs = path.join(baseDir, filename);
      const objectKey = `${prefix}${filename}`;
      const buffer = fs.readFileSync(abs);
      const contentType = getContentType(filename);

      // console.log(`  Uploading ${abs} to ${bucketName}/${objectKey}...`);
      
      await minioClient.putObject(bucketName, objectKey, buffer, {
        'Content-Type': contentType
      });
      // console.log(`  ✓ Successfully uploaded ${filename}`);
      uploaded += 1;
    } catch (error) {
      console.error(`  ✗ Failed to upload ${filename}:`, error.message);
      uploadErrors.push({ filename, error: error.message });
    }
  }

  if (uploadErrors.length > 0) {
    console.error(`[uploadPresetJsonFilesToMinio] ${uploadErrors.length} 个文件上传失败:`, uploadErrors);
    throw new Error(`${uploadErrors.length} 个文件上传失败: ${uploadErrors.map(e => e.filename).join(', ')}`);
  }

  return { 
    success: true, 
    uploaded, 
    bucket: bucketName, 
    prefix: prefix,
    ...(deleteBeforeUpload ? { deleted: deletedCount } : {})
  };
}

/**
 * 将指定目录下的直接文件上传到 MinIO（不递归子文件夹，排除 images 文件夹）
 * 只上传目录下的直接文件，不递归子目录
 * 目标路径：<bucket>/<userId>/<sessionId>/<filename>
 * @param {Object} params - 参数对象
 * @param {string} params.userId - 用户ID
 * @param {string} params.sessionId - 会话ID
 * @param {string} params.localDir - 本地目录路径（包含文件的目录）
 * @param {string} params.bucketName - 存储桶名称，默认 'interactive-fiction-game-data'
 * @param {boolean} params.deleteBeforeUpload - 是否在上传前删除 prefix 下的所有对象，默认 false
 */
export async function uploadSessionJsonFilesToMinio({ userId, sessionId, localDir, bucketName = 'interactive-fiction-game-data', deleteBeforeUpload = false }) {
  if (!userId) throw new Error('缺少必填参数：userId');
  if (!sessionId) throw new Error('缺少必填参数：sessionId');
  if (!localDir) throw new Error('缺少必填参数：localDir');

  await ensureBucketExists(bucketName);

  const workspaceRoot = process.cwd();
  const baseDir = path.isAbsolute(localDir) ? localDir : path.join(workspaceRoot, localDir);
  if (!fs.existsSync(baseDir)) {
    throw new Error(`本地目录不存在: ${baseDir}`);
  }

  // 如果指定删除，先删除 prefix 下的所有对象
  const prefix = `${userId}/${sessionId}/`;
  let deletedCount = 0;
  if (deleteBeforeUpload) {
    try {
      const deleteResult = await deletePrefixFromMinio(bucketName, prefix);
      deletedCount = deleteResult.deleted || 0;
    } catch (error) {
      console.warn('删除 prefix 下的对象时出错，继续上传:', error.message);
    }
  }

  // 读取目录下的所有直接文件（不递归子目录），排除 images 文件夹
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile()) // 只处理文件，不处理文件夹
    .map(entry => entry.name);

  // 根据文件扩展名判断 Content-Type
  const getContentType = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
  };

  let uploaded = 0;
  for (const filename of files) {
    const abs = path.join(baseDir, filename);
    const objectKey = `${prefix}${filename}`;
    const buffer = fs.readFileSync(abs);
    const contentType = getContentType(filename);
    
    await minioClient.putObject(bucketName, objectKey, buffer, {
      'Content-Type': contentType
    });
    uploaded += 1;
  }

  return { 
    success: true, 
    uploaded, 
    bucket: bucketName, 
    prefix: prefix,
    ...(deleteBeforeUpload ? { deleted: deletedCount } : {})
  };
}

/**
 * 将指定文件上传到 MinIO =》废弃函数
 * 目标路径：<bucket>/<userId>/<sessionId>/<filename>
 * @param {Object} params - 参数对象
 * @param {string} params.userId - 用户ID
 * @param {string} params.sessionId - 会话ID
 * @param {string} params.localFilePath - 本地文件路径（要上传的文件）
 * @param {string} params.bucketName - 存储桶名称，默认 'interactive-fiction-game-data'
 * @param {boolean} params.deleteBeforeUpload - 是否在上传前删除 prefix 下的所有对象，默认 false
 * @param {string} params.objectKeyOverride - 可选，覆盖默认的对象key（不包含prefix）
 */
export async function uploadSessionJsonFileToMinio({ 
  userId, 
  sessionId, 
  localFilePath, 
  bucketName = 'interactive-fiction-game-data', 
  deleteBeforeUpload = false,
  objectKeyOverride = null 
}) {
  if (!userId) throw new Error('缺少必填参数：userId');
  if (!sessionId) throw new Error('缺少必填参数：sessionId');
  if (!localFilePath) throw new Error('缺少必填参数：localFilePath');

  const workspaceRoot = process.cwd();
  const filePath = path.isAbsolute(localFilePath) ? localFilePath : path.join(workspaceRoot, localFilePath);
  
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    throw new Error(`本地文件不存在: ${filePath}`);
  }
  
  // 检查是否为文件
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`路径不是文件: ${filePath}`);
  }

  // 如果指定删除，先删除 prefix 下的所有对象
  const prefix = `${userId}/${sessionId}/`;
  let deletedCount = 0;
  if (deleteBeforeUpload) {
    try {
      const deleteResult = await deletePrefixFromMinio(bucketName, prefix);
      deletedCount = deleteResult.deleted || 0;
    } catch (error) {
      console.warn('删除 prefix 下的对象时出错，继续上传:', error.message);
    }
  }

  // 获取文件名和扩展名
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();
  
  // 根据文件扩展名判断 Content-Type
  const getContentType = (ext) => {
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
  };

  // 确定对象key
  const objectKey = objectKeyOverride 
    ? `${prefix}${objectKeyOverride}`
    : `${prefix}${filename}`;
  
  // 读取文件内容
  const buffer = fs.readFileSync(filePath);
  const contentType = getContentType(ext);
  
  // 上传文件
  await minioClient.putObject(bucketName, objectKey, buffer, {
    'Content-Type': contentType
  });

  return { 
    success: true, 
    uploaded: 1, 
    bucket: bucketName, 
    prefix: prefix,
    file: filename,
    objectKey: objectKey,
    fileSize: stat.size,
    ...(deleteBeforeUpload ? { deleted: deletedCount } : {})
  };
}

// 函数：从本地路径上传 PDF/DOCX 文件到 MinIO 并更新数据库 doc_url（ZZ）
export async function uploadPdfToMinioByFileId(localFilePath, fileId, originalFileName) {
  if (!localFilePath) {
    throw new Error('缺少必填参数：本地文件路径');
  }

  if (!fileId) {
    throw new Error('缺少必填参数：file_id');
  }

  // 检查本地文件是否存在
  const workspaceRoot = process.cwd();
  const fullPath = path.isAbsolute(localFilePath) ? localFilePath : path.join(workspaceRoot, localFilePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`本地文件不存在: ${fullPath}`);
  }

  // 验证文件类型（根据传入的文件名判断）
  const lowerName = (originalFileName || path.basename(fullPath) || '').toLowerCase();
  const isPdf = lowerName.endsWith('.pdf');
  const isDocx = lowerName.endsWith('.docx');
  if (!isPdf && !isDocx) {
    throw new Error('只支持 PDF 或 DOCX 文件');
  }

  // 从本地路径读取文件
  const fileBuffer = fs.readFileSync(fullPath);

  // 根据 fileId 获取 userId
  const userId = await getCreatorUserIdByFileId(String(fileId));
  if (!userId) {
    throw new Error('未找到对应的用户（根据 file_id）');
  }

  // 目标存储：interactive-fiction-game-init/<user_id>/<file_id>/<random>.pdf
  const bucket = 'interactive-fiction-game-init';
  await ensureBucketExists(bucket);
  const randomId = crypto.randomBytes(8).toString('hex');
  const ext = isPdf ? 'pdf' : 'docx';
  const objectName = `${userId}/${fileId}/${randomId}.${ext}`;

  // 上传到 MinIO
  await minioClient.putObject(bucket, objectName, fileBuffer, {
    'Content-Type': isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  // 生成公开 URL
  const isSSL = process.env.MINIO_USE_SSL === 'true';
  const protocol = isSSL ? 'https' : 'http';
  const port = parseInt(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000', 10);
  const endpoint = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || '39.97.36.219';
  const url = `${protocol}://${endpoint}:${port}/${bucket}/${objectName}`;

  // 更新数据库中的 doc_url
  try {
    await updateDocUrlByFileId(fileId, url);
  } catch (e) {
    // 不阻断上传成功，仅记录日志
    console.warn('更新 doc_url 失败:', e && e.message ? e.message : e);
  }

  return { url };
}

/**
 * 直接接收 Multer 文件对象，上传 PDF/DOCX 到 MinIO，并更新数据库 doc_url
 * @param {Express.Multer.File} file - Multer 提供的文件对象（支持 memoryStorage 的 buffer 或 diskStorage 的 path）
 * @param {string} fileId - 业务文件ID
 * @param {string} userId - 用户ID（由调用方传入）
 * @returns {Promise<{url: string}>}
 */
export async function uploadfileToMinio(file, fileId, userId) {
  if (!file) {
    throw new Error('缺少必填参数：file');
  }
  if (!fileId) {
    throw new Error('缺少必填参数：fileId');
  }
  if (!userId) {
    throw new Error('缺少必填参数：userId');
  }

  // 读取文件 Buffer（memoryStorage 直接用 buffer；diskStorage 读取临时文件）
  const fileBuffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
  if (!fileBuffer) {
    throw new Error('无法读取文件内容（缺少 buffer 或 path）');
  }

  // 判断类型与扩展名
  const originalName = file.originalname || '';
  const lowerName = originalName.toLowerCase();
  const isPdf = (file.mimetype === 'application/pdf') || lowerName.endsWith('.pdf');
  const isDocx = (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') || lowerName.endsWith('.docx');
  if (!isPdf && !isDocx) {
    throw new Error('只支持 PDF 或 DOCX 文件');
  }

  const bucket = 'interactive-fiction-game-init';
  
  try {
    await ensureBucketExists(bucket);
  } catch (error) {
    // 如果是连接错误，提供更详细的错误信息
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      const endpoint = process.env.MINIO_ENDPOINT || '39.97.36.219';
      const port = process.env.MINIO_PORT || '9000';
      console.error(`[文档上传] MinIO 连接失败: ${endpoint}:${port}`);
      console.error(`[文档上传] 错误代码: ${error.code}, 错误信息: ${error.message}`);
      throw new Error(`无法连接到 MinIO 服务器 (${endpoint}:${port}): ${error.message}`);
    }
    throw error;
  }

  const randomId = crypto.randomBytes(8).toString('hex');
  const ext = isPdf ? 'pdf' : 'docx';
  const objectName = `${userId}/${fileId}/${randomId}.${ext}`;

  try {
    await minioClient.putObject(bucket, objectName, fileBuffer, {
      'Content-Type': isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  } catch (error) {
    // 如果是连接错误，提供更详细的错误信息
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      const endpoint = process.env.MINIO_ENDPOINT || '39.97.36.219';
      const port = process.env.MINIO_PORT || '9000';
      console.error(`[文档上传] MinIO 上传失败: ${endpoint}:${port}`);
      console.error(`[文档上传] 错误代码: ${error.code}, 错误信息: ${error.message}`);
      throw new Error(`文档上传失败: 无法连接到 MinIO 服务器 (${endpoint}:${port}): ${error.message}`);
    }
    throw error;
  }

  const isSSL = process.env.MINIO_USE_SSL === 'true';
  const protocol = isSSL ? 'https' : 'http';
  const port = parseInt(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000', 10);
  const endpoint = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || '39.97.36.219';
  const url = `${protocol}://${endpoint}:${port}/${bucket}/${objectName}`;

  // 更新数据库中的 doc_url
  try {
    await updateDocUrlByFileId(fileId, url);
  } catch (e) {
    console.warn('更新 doc_url 失败:', e && e.message ? e.message : e);
  }

  // 清理临时文件（如果是 diskStorage）
  if (file.path && !file.buffer) {
    try {
      fs.unlinkSync(file.path);
    } catch {}
  }

  return { url };
}

/**
 * 根据 bucket 与对象路径删除单个文件
 * @param {string} bucketName 存储桶名称
 * @param {string} objectPath 对象路径（如 'dir1/dir2/file.png'，不需要以 / 开头）
 * @returns {Promise<{success: boolean, deleted: boolean, bucket: string, object: string, message?: string}>}
 */
export async function deleteObjectFromMinio(bucketName, objectPath) {
  if (!bucketName) {
    throw new Error('缺少必填参数：bucketName');
  }
  if (!objectPath) {
    throw new Error('缺少必填参数：objectPath');
  }

  const key = String(objectPath).replace(/^\/+/, '');

  try {
    await minioClient.removeObject(bucketName, key);
    return { success: true, deleted: true, bucket: bucketName, object: key };
  } catch (error) {
    // 对象不存在或已被删除
    if (error && (error.code === 'NoSuchKey' || error.code === 'NotFound' || error.statusCode === 404)) {
      return { success: true, deleted: false, bucket: bucketName, object: key, message: '对象不存在' };
    }
    console.error('删除对象失败:', error);
    throw new Error(`删除失败: ${error.message}`);
  }
}

export default {
  uploadImage,
  uploadImageToPath,
  uploadDocumentToPath,
  testUploadImage,
  testUploadPdf,
  downloadPrefixToLocal,
  uploadLocalFolderToMinio,
  deletePrefixFromMinio,
  uploadInitJsonFilesToMinio,
  uploadSessionJsonFilesToMinio,
  uploadPdfToMinioByFileId,
  uploadfileToMinio,
  deleteObjectFromMinio,
};