import { createGame, listAllGames, listGamesByUser, listGamesByIsPublicNoDiscount, listGamesByIsPublicWithDiscount, publishGameByFileId, deleteGameByFileId, getGameFilesByFileId, getGameByFileId, listFileIdsAndFilesByUser, getCreatorUserIdByFileId, createGameSession, getGameSessionByFiles, getGameSessionByUserAndFile, updateGameSessionEndTime, updateGameSessionStatusAndFiles, getUserIdBySessionId, getGameSessionBySessionId, deleteGameSessionsByFileId, deleteGameSessionBySessionId, getFileIdsFromSessionsByUser, getGamesByFileIds, listPublicGameCreatorIds, unpublishGameByFileId, getGameDataByFileId } from '../service/gamesService.js';
import { downloadPrefixToLocal, uploadLocalFolderToMinio, uploadImage, uploadfileToMinio, uploadInitJsonFilesToMinio, uploadSessionJsonFilesToMinio, deletePrefixFromMinio, uploadPresetJsonFilesToMinio } from '../service/minioService.js';
import { updateUser, getUserById, getUserByUserId } from '../service/authService.js';
import { checkUserReaction } from '../service/gameLikeService.js';
import { checkUserAlreadyPurchased, getUserPaidFileIdsInPoints, createPointsPurchase, deletePointsPurchaseByUserAndFile } from '../service/pointsPurchasesService.js';
import { getPaymentStatusByUserIdAndFileId, getUserPaidFileIds, updateOrderToPaid } from '../service/gameOrdersService.js';
import fs from 'fs';
import path from 'path';
import { file } from 'zod';


// 创建游戏
export async function create(req, res) {
  try {
    // Route-level timeout to prevent long tasks from being cut off prematurely
    try {
      res.setTimeout(Number(1200000));
    } catch { }

    const payload = req.body || {};
    if (!payload.title) {
      return res.status(400).json({ success: false, message: '缺少必填字段：title' });
    }
    let generateImages = payload.generateImages;
    const normalizedGenerateImages =
      typeof generateImages === 'string'
        ? generateImages.trim().toLowerCase()
        : generateImages;
    const shouldUploadImages = !(
      normalizedGenerateImages === false ||
      normalizedGenerateImages === 0 ||
      normalizedGenerateImages === 'false' ||
      normalizedGenerateImages === '0'
    );
    // 仅处理图片与文档，file_id 将优先取解析结果
    const userIdForPrefix = req.user?.userId;
    console.log("----------------------------userId", userIdForPrefix);
    if (!userIdForPrefix) {
      return res.status(400).json({ success: false, message: '缺少必填字段：creator_user_id' });
    }
    let derivedFileId = null;

    let coverUrl = null;
    let docUrl = null;
    let parseResult = null;

    // doc,pdf的解析
    // backendController中的export const uploadAndProcessPDF = async (req, res)

    // 如果传了文档文件，同步调用后端解析接口（/api/backend/pdf/upload-and-process）
    try {
      let docFileForParse = req.file;
      if (!docFileForParse && Array.isArray(req.files)) {
        docFileForParse = req.files.find(f => f.fieldname === 'file');
      }
      if (docFileForParse) {
        const fileBufferForParse = docFileForParse.buffer || fs.readFileSync(docFileForParse.path);
        const filenameForParse = docFileForParse.originalname || 'document.pdf';
        const mimetypeForParse = docFileForParse.mimetype || 'application/pdf';

        const baseUrl = process.env.SELF_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const formData = new FormData();
        const blob = new Blob([fileBufferForParse], { type: mimetypeForParse });
        formData.append('pdf', blob, filenameForParse);
        formData.append('generateImages', generateImages);

        // const timeoutMs = Number(1200000);
        const resp = await fetch(`${baseUrl}/api/backend/pdf/upload-and-process`, {
          method: 'POST',
          body: formData,
          timeout: 0
        });
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          console.warn(`[文档解析] 接口返回非 2xx，忽略继续: ${resp.status} ${txt}`);
        } else {
          parseResult = await resp.json().catch(() => null);
          if (parseResult && parseResult.fileId) derivedFileId = parseResult.fileId;
          if (parseResult && parseResult.fileId) {
            console.log('------------------文档解析结果的fileId-------------------', parseResult.fileId);
          }
        }
      }
    } catch (error) {
      console.warn('[文档解析] 调用失败，忽略并继续（可能超时或连接失败）:', error && error.message ? error.message : error);
      if (error && error.stack) console.warn('[文档解析] 错误堆栈:', error.stack);
    }

    // file_id 优先使用解析结果，其次兼容传入 图片的上传
    const fileId = derivedFileId || payload.file_id || req.body.file_id;
    if (!fileId) {
      return res.status(400).json({ success: false, message: '缺少 file_id（请通过文档解析获取或提供）' });
    }
    // 规范化前缀，去掉首尾斜杠
    const normalizedFileId = String(fileId).replace(/^\/+|\/+$/g, '');
    const targetPrefix = `${userIdForPrefix}/${normalizedFileId}`;

    // 仅处理图片上传（字段名：cover），不再接收文档文件
    const allFiles = Array.isArray(req.files) ? req.files : [];
    const coverFile = allFiles.find(f => f.fieldname === 'cover') || allFiles[0];

    if (coverFile) {
      try {
        if (!coverFile.mimetype || !coverFile.mimetype.startsWith('image/')) {
          return res.status(400).json({ success: false, message: '封面文件必须是图片格式' });
        }
        const coverFileBuffer = coverFile.buffer || fs.readFileSync(coverFile.path);
        const coverFileName = coverFile.originalname;

        // 指定上传到指定 bucket/prefix：interactive-fiction-game-init/<user>/<files>/cover
        const destPath = `interactive-fiction-game-init/${targetPrefix}/cover`;
        const result = await uploadImage(coverFileBuffer, coverFileName, coverFile.mimetype, destPath);
        // coverUrl = result && result.url ? result.url : null;
        // 原始逻辑 + 正则去除前缀
        coverUrl = result && result.url ? result.url.replace(/^http(s)?:\/\/.+?:\d+\/(.+)$/, '$2') : null;

        // 清理临时文件
        if (coverFile.path && !coverFile.buffer) {
          try { fs.unlinkSync(coverFile.path); } catch { }
        }
      } catch (error) {
        console.error('[封面图片上传] 上传失败:', error);
        console.error('[封面图片上传] 错误堆栈:', error.stack);
        return res.status(500).json({ success: false, message: '封面图片上传失败: ' + error.message });
      }
    } else {
      // 无图片时跳过上传
      console.log('[封面图片上传] 无图片，跳过上传');
    }

    // doc,pdf的上传
    // 调用minioService中uploadfileToMinio函数
    try {
      // 从 form-data 中获取字段名为 'file' 的文档（pdf/docx）
      let docFile = req.file;
      if (!docFile && Array.isArray(req.files)) {
        docFile = req.files.find(f => f.fieldname === 'file');
      }
      if (docFile) {
        // 可选：快速校验类型，失败直接返回 400（底层也会校验）
        const lowerName = (docFile.originalname || '').toLowerCase();
        const isPdf = (docFile.mimetype === 'application/pdf') || lowerName.endsWith('.pdf');
        const isDocx = (docFile.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') || lowerName.endsWith('.docx');
        if (!isPdf && !isDocx) {
          return res.status(400).json({ success: false, message: '文档文件仅支持 PDF 或 DOCX' });
        }
        // 上传到 MinIO（bucket 使用函数内部的固定配置，路径：<userId>/<fileId>/<random>.ext）
        const result = await uploadfileToMinio(docFile, normalizedFileId, String(userIdForPrefix));
        // docUrl = result && result.url ? result.url : null;
        docUrl = result && result.url ? result.url.replace(/^http(s)?:\/\/.+?:\d+\/(.+)$/, '$2') : null;
      }
    } catch (error) {
      console.error('[文档上传] 上传失败:', error);
      console.error('[文档上传] 错误堆栈:', error.stack);
      return res.status(500).json({ success: false, message: '文档上传失败: ' + error.message });
    }

    // 初始化后文件的上传（文件会先放在本地的public/game_data里面）
    // 调用minioService里的uploadLocalFolderToMinio函数
    //   {
    //     "localRoot": "game_saves/${filedId}",
    //     "file_id":${filedId},
    //     "bucketName":"interactive-fiction-game-init"
    // }

    try {
      if (shouldUploadImages) {
        // 映射为内部需要的字段 fileId，并按给定格式提供 localRoot 与 bucketName
        const uploadParams = {
          localRoot: `public/game_data/images/${normalizedFileId}`,
          fileId: normalizedFileId,
          userId: String(userIdForPrefix),
          bucketName: 'interactive-fiction-game-init',
          deleteBeforeUpload: false
        };
        await uploadLocalFolderToMinio(uploadParams);
      } else {
        console.log('[初始化文件上传到 MinIO] generateImages 为 false，跳过图片上传');
      }
      // 紧接着上传四个初始化 JSON 文件
      try {
        await uploadInitJsonFilesToMinio({
          userId: String(userIdForPrefix),
          fileId: normalizedFileId,
          bucketName: 'interactive-fiction-game-init'
        });
        console.warn('[初始化 JSON 上传到 MinIO] ======成功=======:', e && e.message ? e.message : e);
      } catch (e) {
        console.warn('[初始化 JSON 上传到 MinIO] 跳过或失败:', e && e.message ? e.message : e);
      }
    } catch (e) {
      console.warn('[初始化文件上传到 MinIO] 跳过或失败:', e && e.message ? e.message : e);
    }

    // 将上传后的 URL 与 files 添加到 payload
    const finalPayload = {
      ...payload,
      creator_user_id: userIdForPrefix,
      file_id: normalizedFileId,
      cover_url: coverUrl,
      doc_url: docUrl,
      files: `interactive-fiction-game-init/${userIdForPrefix}/${normalizedFileId}`,
      author_name: payload.authorName || payload.author_name
    };

    const row = await createGame(finalPayload);
    console.log('-------------------------数据库插入数据结果------------------------', row);

    // 更新用户的 fileIds 字段
    try {
      const user = await getUserByUserId(userIdForPrefix);
      if (user) {
        let fileIds = [];

        // 解析现有的 fileIds（如果存在）
        if (user.fileIds) {
          try {
            fileIds = JSON.parse(user.fileIds);
            if (!Array.isArray(fileIds)) {
              fileIds = [];
            }
          } catch (parseError) {
            console.warn('解析用户 fileIds 失败，使用空数组:', parseError);
            fileIds = [];
          }
        }

        // 检查 fileId 是否已存在，避免重复添加
        if (!fileIds.includes(normalizedFileId)) {
          fileIds.push(normalizedFileId);

          // 更新用户的 fileIds 字段
          await updateUser(user.userId, {
            fileIds: JSON.stringify(fileIds)
          });

          console.log(`用户 ${userIdForPrefix} 的 fileIds 已更新:`, fileIds);
        } else {
          console.log(`fileId ${normalizedFileId} 已存在于用户 ${userIdForPrefix} 的 fileIds 中`);
        }
      } else {
        console.warn(`未找到用户 ${userIdForPrefix}`);
      }
    } catch (updateError) {
      console.error('更新用户 fileIds 失败:', updateError);
      // 不影响游戏创建的成功响应，只记录错误
    }

    return res.json(parseResult);
  } catch (err) {
    console.error('gamesController.create error:', err);
    return res.status(500).json({ success: false, message: err.message || '创建失败' });
  }
}

//================
// 创建session会话
//================
export async function sessionCreate(req, res) {
  try {
    const { fileId } = req.body || {};
    const userId = req.user?.userId;
    console.log("============================session:userId", userId);
    console.log("============================session:fileId", fileId);
    if (!fileId || !userId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：fileId 或 userId'
      });
    }

    const normalizedFileId = String(fileId).trim();
    const normalizedUserId = String(userId).trim();
    if (!normalizedFileId || !normalizedUserId) {
      return res.status(400).json({
        success: false,
        message: 'fileId 或 userId 不能为空字符串'
      });
    }

    // 通过 userId 从用户表中获取 nickname，作为 playerName
    // let playerName = '';
    // try {
    //   const user = await getUserByUserId(normalizedUserId);
    //   console.log("======================user",user);
    //   if (user && user.nickname) {
    //     playerName = user.nickname;
    //   }
    // } catch (error) {
    //   console.warn('[sessionCreate] 根据 userId 获取用户昵称失败，使用默认昵称', error && error.message ? error.message : error);
    // }
    // 如果games_saves路径下存在${filedId}的文件夹的话，就不再拉取初始化文件，直接看existingSession是否存在
    let initFilesPath = null;
    const gameSavesPath = `game_saves/${normalizedFileId}`;
    const folderExists = fs.existsSync(gameSavesPath) && fs.statSync(gameSavesPath).isDirectory();

    if (!folderExists) {
      try {
        console.log("----------------------------拉取初始化文件-----------------------------")
        initFilesPath = await downloadInitFilesAndReturnFiles(normalizedFileId, 'game_saves');
      } catch (error) {
        console.warn('[sessionCreate] 下载初始化文件失败，继续执行', error && error.message ? error.message : error);
      }
    } else {
      console.log(`[sessionCreate] game_saves/${normalizedFileId} 文件夹已存在，跳过下载初始化文件`);
    }
    console.log("----------------------------normalizedUserId-----------------------------", normalizedUserId);
    console.log("----------------------------normalizedFileId-----------------------------", normalizedFileId);
    const existingSession = await getGameSessionByUserAndFile(normalizedUserId, normalizedFileId);
    console.log("----------------------------existingSession-----------------------------", existingSession);

    if (!existingSession) {
      const baseUrl = process.env.SELF_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      let backendSessionResp;

      try {
        let response = await fetch(`${baseUrl}/api/backend/game/session/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: normalizedFileId
          }),
          signal: AbortSignal.timeout(Number(process.env.SESSION_CREATE_TIMEOUT_MS || 120000))
        });

        if (!response.ok) {
          const message = await response.text().catch(() => '');
          throw new Error(`后端会话创建接口返回异常状态 ${response.status}: ${message}`);
        }

        backendSessionResp = await response.json();
      } catch (error) {
        console.error('[sessionCreate] 调用后端会话创建接口失败', error);
        return res.status(502).json({
          success: false,
          message: '调用后端会话创建接口失败',
          error: error.message || error
        });
      }

      if (!backendSessionResp || backendSessionResp.success !== true || !backendSessionResp.sessionId) {
        return res.status(500).json({
          success: false,
          message: '会话创建接口返回的数据不完整',
          data: backendSessionResp || null
        });
      }
      console.log("--------------------------------", backendSessionResp.sessionId);
      //对于数据库games_session,插入一条数据插入字段为fileId,sessionId,userId,startedAt,endedAt
      let sessionRecord = null;
      try {
        // 确定 files 字段的值
        const filesValue = initFilesPath || `game_saves/${normalizedFileId}`;

        sessionRecord = await createGameSession({
          sessionId: backendSessionResp.sessionId,
          userId: normalizedUserId,
          fileId: normalizedFileId,
          status: 'active',
          files: filesValue,
          startedAt: new Date(),
          endedAt: null
        });
        console.log('[sessionCreate] 数据库会话记录创建成功:', sessionRecord.id);
      } catch (error) {
        console.error('[sessionCreate] 写入 game_sessions 表失败', error);
        // 如果是因为重复键错误（并发情况），尝试查询现有记录
        if (error.code === 'ER_DUP_ENTRY' && error.errno === 1062) {
          try {
            sessionRecord = await getGameSessionBySessionId(backendSessionResp.sessionId);
            console.log('[sessionCreate] 会话记录已存在，使用现有记录');
          } catch (queryError) {
            console.error('[sessionCreate] 查询现有会话记录失败', queryError);
          }
        }
        // 即使数据库插入失败，也继续返回响应（因为后端会话已创建成功）
      }
      // 第二个操作：完成会话（只有在数据库记录创建成功后才执行）
      if (sessionRecord) {
        try {
          await completeGameSessionByParams(backendSessionResp.sessionId, 'public/game_data', normalizedFileId);
          console.log('[sessionCreate] 会话存储完成操作成功');
        } catch (error) {
          console.error('[sessionCreate] 完成会话存储操作失败', error);
        }
      }

      console.log("----------------------------会话创建结束-----------------------------")
      return res.json({
        success: true,
        message: '会话创建成功',
        data: {
          session: sessionRecord || {
            session_id: backendSessionResp.sessionId
          },
          initFilesPath,
          sessionDataSync: null
        }
      });
    } else {
      console.log("--------------------------------不再进入---------------------------")
      // 用户如果没有玩过游戏=》没有session=>检查拉取后的文件夹是否有 avatar 文件夹(是否是无图模式)，如果没有则删除整个文件夹
      const avatarPath = path.join(gameSavesPath, 'avatars');
      const iconPath = path.join(gameSavesPath, 'icons');
      const avatarExists = fs.existsSync(avatarPath) && fs.statSync(avatarPath).isDirectory();
      const iconExists = fs.existsSync(iconPath) && fs.statSync(iconPath).isDirectory();
      if (!avatarExists && !iconExists) {
        console.log(`[sessionCreate] game_saves/${normalizedFileId} 文件夹下没有图片文件夹，删除该文件夹`);
        fs.rmSync(gameSavesPath, { recursive: true, force: true });
      }
      // 安全检查：确保 existingSession 存在且有 session_id
      if (!existingSession || !existingSession.session_id) {
        console.error('[sessionCreate] existingSession 不存在或缺少 session_id');
        return res.status(500).json({
          success: false,
          message: '会话数据不完整'
        });
      }

      // 如果public/game_data路径下存在${session_id}的文件夹的话，就不再做下载步骤，直接return即可
      const sessionDataPath = `public/game_data/${existingSession.session_id}`;
      const sessionDataFolderExists = fs.existsSync(sessionDataPath) && fs.statSync(sessionDataPath).isDirectory();

      if (sessionDataFolderExists) {
        console.log(`[sessionCreate] public/game_data/${existingSession.session_id} 文件夹已存在，跳过下载步骤`);
        return res.json({
          success: true,
          message: '会话已存在，返回现有会话信息了',
          data: {
            session: existingSession,
            initFilesPath,
            sessionDataSync: null
          }
        });
      }

      let sessionDataSync = null;
      try {
        console.log("--------------------------------进入minio拉取历史存档---------------------")
        sessionDataSync = await uploadGameSessionDataBySessionId(existingSession.session_id, 'public/game_data');
      } catch (error) {
        console.warn('[sessionCreate] 拉取已存在会话的游戏数据失败', error && error.message ? error.message : error);
      }

      // 仅同步 images 资源目录
      try {
        copyGameImagesToSession(normalizedFileId, existingSession.session_id);
      } catch (error) {
        console.warn('[sessionCreate] 同步 images 目录失败', error && error.message ? error.message : error);
      }


      return res.json({
        success: true,
        message: '会话已存在，返回现有会话信息',
        data: {
          session: existingSession,
          initFilesPath,
          sessionDataSync
        }
      });
    }
  } catch (error) {
    console.error('gamesController.sessionCreate error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || '创建会话失败'
    });
  }
}
export async function listAll(req, res) {
  try {
    const rows = await listAllGames();
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('gamesController.listAll error:', err);
    return res.status(500).json({ success: false, message: err.message || '查询失败' });
  }
}

// 根据userId查询游戏列表
export async function listByUser(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: '缺少 userId' });
    }
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const gamesWithAvatar = await listGamesByUser(userId, { limit, offset });
    return res.json({ success: true, data: gamesWithAvatar });
  } catch (err) {
    console.error('gamesController.listByUser error:', err);
    return res.status(500).json({ success: false, message: err.message || '查询失败' });
  }
}

// 根据 fileId 下载初始化文件
export async function getInitFilesByFileId(req, res) {
  try {
    const fileId = req.params.fileId;
    if (!fileId) {
      return res.status(400).json({ success: false, message: '缺少 file_id' });
    }
    const files = await downloadInitFilesAndReturnFiles(fileId, 'location');
    if (files == null) {
      return res.status(404).json({ success: false, message: '未找到对应游戏或无 files' });
    }
    return res.json({ success: true, data: files });
  } catch (err) {
    console.error('gamesController.getInitFilesByFileId error:', err);
    return res.status(500).json({ success: false, message: err.message || '查询失败' });
  }
}

// 完成游戏并上传到 MinIO，创建 game_session 记录
export async function completeGameSession(req, res) {
  try {
    const { session_id, local_path, file_id } = req.body || {};

    // 参数校验
    if (!session_id || !file_id) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：session_id, file_id'
      });
    }
    const session = await completeGameSessionByParams(session_id, local_path, file_id);
    return res.json({ success: true, data: session });
  } catch (err) {
    console.error('gamesController.completeGameSession error:', err);
    return res.status(500).json({ success: false, message: err.message || '创建游戏会话失败' });
  }
}

// 初始化游戏文件的下载
// 目前先下载到固定的“location”目录下，可以自行修改
export async function getFilesOfAdminUser(req, res) {
  try {
    const userId = '2';
    const rows = await listFileIdsAndFilesByUser(userId);
    // 每个 file_id 对应的前缀
    for (const row of rows) {
      try {
        if (row && row.file_id) {
          // 调用minio接口
          await downloadPrefixToLocal('interactive-fiction-game-init', `${userId}/${row.file_id}`, 'location');
        }
      } catch (e) {
        console.warn('downloadPrefixToLocal skipped:', e && e.message ? e.message : e);
      }
    }
    const data = rows.map(r => r.files);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('gamesController.getFilesOfUser2 error:', err);
    return res.status(500).json({ success: false, message: err.message || '查询失败' });
  }
}

// 首页初始化文件下载到本地(destRoot:初始游戏需要下载到的地址)(ZZ)
export async function downloadInitFilesByUser(destRoot) {
  const userId = '2';
  const rows = await listFileIdsAndFilesByUser(userId);
  for (const row of rows) {
    try {
      if (row && row.file_id) {
        await downloadPrefixToLocal('interactive-fiction-game-init', `${userId}/${row.file_id}`, destRoot);
      }
    } catch (e) {
      console.warn('downloadPrefixToLocal skipped:', e && e.message ? e.message : e);
    }
  }
  return rows.map(r => r.files);
}

// ========================
// 通用函数部分
// ========================

// 根据 fileId 下载用户的初始化文件，下载到项目的destRoot目录下（ZZ）
export async function downloadInitFilesAndReturnFiles(fileId, destRoot) {
  // prefix 使用 <user_id>/<file_id>
  try {
    const userId = await getCreatorUserIdByFileId(fileId);
    if (userId) {
      await downloadPrefixToLocal('interactive-fiction-game-init', `${userId}/${fileId}`, destRoot, {
        stripPrefixSegments: 1
      });
    }
  } catch (e) {
    console.warn('downloadPrefixToLocal skipped:', e && e.message ? e.message : e);
  }
  const files = await getGameFilesByFileId(fileId);
  return files ?? null;
}

// 游戏会话存储，上传数据并写入/更新 （本地的上传路径为local_path）（ZZ）
export async function completeGameSessionByParams(session_id, local_path, file_id) {
  // 先通过 session_id 查询是否存在记录（session_id 是唯一键）
  const existingSession = await getGameSessionBySessionId(session_id);

  // 通过 session_id 获取 user_id（如果 existingSession 存在，则从 existingSession 中获取）
  const user_id = existingSession ? existingSession.user_id : null;

  if (!user_id) {
    throw new Error('未找到对应的用户（根据 session_id）');
  }

  // 本地上传源路径：<local_path>/<file_id>
  const localRoot = (local_path && String(local_path).trim()) ? String(local_path).trim() : 'public/game_data';
  const resolvedLocalPath = `${localRoot}/${session_id}`;

  // MinIO prefix 使用 user_id/session_id 拼接
  const minioPrefix = `${user_id}/${session_id}`;
  const filesValue = `interactive-fiction-game-data / ${minioPrefix}`;

  // 只上传四个 JSON 文件（不上传 images 文件夹）
  // 如果存在相同 session_id 的记录，先删除 MinIO 中对应路径下的所有文件，再上传（确保完全同步）
  // 本地路径使用 resolvedLocalPath，prefix：user_id/session_id
  try {
    const shouldDeleteBeforeUpload = !!existingSession; // 如果存在相同记录，先删除再上传
    await uploadSessionJsonFilesToMinio({
      userId: String(user_id),
      sessionId: session_id,
      localDir: resolvedLocalPath,
      bucketName: 'interactive-fiction-game-data',
      deleteBeforeUpload: shouldDeleteBeforeUpload
    });
  } catch (e) {
    console.error('uploadSessionJsonFilesToMinio error:', e);
    throw new Error('MinIO 上传失败: ' + (e && e.message ? e.message : String(e)));
  }

  if (existingSession) {
    // 如果存在相同的 session_id，更新 status、files 和 ended_at 字段
    return await updateGameSessionStatusAndFiles(existingSession.id, 'completed', filesValue, new Date());
  }

  // 如果不存在，创建新的 game_session 记录
  try {
    return await createGameSession({
      sessionId: session_id,
      userId: Number(user_id),
      fileId: file_id,
      status: 'completed',
      files: filesValue,
      startedAt: new Date(),
      endedAt: null
    });
  } catch (err) {
    // 如果插入时仍然遇到重复键错误（并发情况），则查询并更新
    if (err.code === 'ER_DUP_ENTRY' && err.errno === 1062) {
      const session = await getGameSessionBySessionId(session_id);
      if (session) {
        return await updateGameSessionEndTime(session.id, new Date());
      }
    }
    throw err;
  }
}

// 游戏创建文件夹存储，上传数据并写入/更新 （本地的上传路径为local_path）（同时作为编辑器的图片与json文件存储函数使用）
export async function completeGameByParams(local_path, file_id) {

  // 通过fileId获取user_id
  const user_id = await getCreatorUserIdByFileId(file_id);
  console.log('user_id', user_id);

  if (!user_id) {
    throw new Error('未找到对应的用户（根据 file_id)', file_id);
  }
  console.log('=================================local_path=====================', local_path);
  
  // 判断local_path是否以.json结尾
  let resolvedLocalPath;
  if (local_path.endsWith('.json')) {
    // 如果是JSON文件路径，使用基础路径（minioDir不应该包含bucket名称，bucket通过bucketName参数单独指定）
    resolvedLocalPath = `${user_id}/${file_id}`;
    local_path = path.dirname(local_path);
  } else {
    // 处理图片文件路径：需要获取文件所在的目录路径
    // 先检查是否是文件路径（通过文件扩展名判断）
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const isImageFile = imageExtensions.some(ext => local_path.toLowerCase().endsWith(ext));
    
    if (isImageFile) {
      // 如果是图片文件，获取其所在目录
      const imageDir = path.dirname(local_path);
      
      // 从完整路径中提取 images/ 之后的部分（包含 images 本身）
      // 将路径统一转换为正斜杠格式
      const normalizedPath = imageDir.replace(/\\/g, '/');
      const imagesMatch = normalizedPath.match(/(images\/.*)$/i);
      
      let relativePath;
      if (imagesMatch) {
        // 找到 images/ 后的路径部分
        relativePath = imagesMatch[1];
      } else {
        // 如果没有找到 images，默认使用 images
        relativePath = 'images';
      }
      // 规范化路径：去除多余的斜杠
      relativePath = relativePath.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
      // 从 relativePath 中移除 file_id 和 images 部分（如果存在）
      // 例如：images/abc-def-123/avatars -> avatars
      // 例如：images/abc-def-123 -> 空字符串
      let finalPath = '';
      if (relativePath.startsWith('images/')) {
        const pathAfterImages = relativePath.substring(7); // 移除 "images/" 前缀
        const pathParts = pathAfterImages.split('/').filter(p => p); // 分割并过滤空字符串

        // 如果第一部分是 file_id，则移除它
        if (pathParts.length > 0 && pathParts[0] === file_id) {
          pathParts.shift(); // 移除第一个元素（file_id）
        }

        // 重新构建路径（不包含 images 前缀）
        if (pathParts.length > 0) {
          finalPath = pathParts.join('/');
        }
      } else if (relativePath === 'images') {
        // 如果只是 images，则 finalPath 为空
        finalPath = '';
      } else {
        // 其他情况，直接使用 relativePath（去掉 images 前缀如果存在）
        finalPath = relativePath.replace(/^images\//, '');
      }
      
      // 构建 MinIO 路径
      if (finalPath) {
        resolvedLocalPath = `${user_id}/${file_id}/${finalPath}`.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
      } else {
        resolvedLocalPath = `${user_id}/${file_id}`.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
      }
      console.log('=================resolvedLocalPath==================', resolvedLocalPath);
      local_path = imageDir; // 使用目录路径而不是文件路径
    } else {
      // 原有逻辑处理目录路径
      const relativePath = getTargetPath(local_path); 
      console.log('=================relativePath==================', relativePath);
      // 规范化路径
      const normalizedRelativePath = relativePath.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
      resolvedLocalPath = `${user_id}/${file_id}/images/${normalizedRelativePath}`.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
    }
  }
  // 如果存在相同 session_id 的记录，先删除 MinIO 中对应路径下的所有文件，再上传（确保完全同步）
  // 本地路径使用 resolvedLocalPath
  try {
    const shouldDeleteBeforeUpload = !!user_id; // 如果存在相同记录，先删除再上传
    
    const uploadResult = await uploadPresetJsonFilesToMinio({
      minioDir: resolvedLocalPath,
      localDir: local_path,
      bucketName: 'interactive-fiction-game-init',
      deleteBeforeUpload: shouldDeleteBeforeUpload
    });
    
    console.log(`[completeGameByParams] 上传完成:`, uploadResult);
    return { success: true, uploadResult };
  } catch (e) {
    console.error('[completeGameByParams] uploadPresetJsonFilesToMinio error:', e);
    throw new Error('MinIO 上传失败: ' + (e && e.message ? e.message : String(e)));
  }
}

function getTargetPath(localPath) {
  // 步骤1：匹配 images/ 或 images\ 后的内容（支持 Windows 和 Unix 路径）
  // 支持多种图片格式和目录路径
  // 先统一路径分隔符为正斜杠，便于匹配
  const normalizedPath = localPath.replace(/\\/g, '/');
  const reg = /images\/(.+?)(?:\/[^\/]+\.(?:png|jpg|jpeg|webp|gif))?$/i;
  const match = normalizedPath.match(reg);
  
  if (match) {
    // 提取 images/ 后的路径部分，去除文件名（如果存在）
    let relativePath = match[1];
    // 确保路径以 / 开头和结尾
    if (!relativePath.startsWith('/')) {
      relativePath = '/' + relativePath;
    }
    if (!relativePath.endsWith('/')) {
      relativePath = relativePath + '/';
    }
    return relativePath;
  }
  
  // 匹配失败返回空
  return '';
}

// 根据 sessionId 从 MinIO 下载文件夹到本地（存储桶：interactive-fiction-game-data，路径：userId/sessionId）（ZZ）
export async function uploadGameSessionDataBySessionId(sessionId, localRoot) {
  if (!sessionId) {
    throw new Error('缺少必填参数：sessionId');
  }

  // 通过 sessionId 查询 userId
  const userId = await getUserIdBySessionId(sessionId);
  if (!userId) {
    throw new Error('未找到对应的用户（根据 sessionId）');
  }

  // MinIO prefix 使用 userId/sessionId 拼接
  const minioPrefix = `${userId}/${sessionId}`;

  // 本地下载目标路径：如果 localRoot 为空则使用默认路径
  const destRoot = (localRoot && String(localRoot).trim()) ? String(localRoot).trim() : `game_saves/${sessionId}`;

  // 从 MinIO 下载到本地
  await downloadPrefixToLocal('interactive-fiction-game-data', minioPrefix, destRoot, {
    stripPrefixSegments: 1
  });

  return { success: true, bucket: 'interactive-fiction-game-data', prefix: minioPrefix, destRoot };
}

// 复制预设游戏的图片
function copyGameImagesToSession(fileId, sessionId) {
  console.log(`🖼️ Copying game images ${fileId} to session ${sessionId}...`);

  const rootDir = process.cwd();
  const sourceDir = path.join(rootDir, 'game_saves', fileId);
  const targetDir = path.join(rootDir, 'public', 'game_data', sessionId);

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Pre-processed game not found: ${fileId}`);
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let copied = false;

  const sourceImagesDir = path.join(sourceDir, 'images');
  const targetImagesDir = path.join(targetDir, 'images');

  if (fs.existsSync(sourceImagesDir)) {
    copyDirectoryRecursive(sourceImagesDir, targetImagesDir);
    copied = true;
    console.log('  ✓ Copied images directory');
  }

  ['scenes', 'avatars', 'icons'].forEach((dirName) => {
    const sourceDirPath = path.join(sourceDir, dirName);
    if (fs.existsSync(sourceDirPath)) {
      const targetDirPath = path.join(targetDir, 'images', dirName);
      copyDirectoryRecursive(sourceDirPath, targetDirPath);
      copied = true;
      console.log(`  ✓ Copied ${dirName} directory`);
    }
  });

  if (!copied) {
    console.log('  ⚠️ No images directories found to copy');
  }
}

// 递归复制文件夹
function copyDirectoryRecursive(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });

  entries.forEach((entry) => {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  });
}




// ========================
// Games Public Operations APIs
// ========================
// 公开游戏列表查询(无优惠价格)
export async function listPublicGames(req, res) {
  try {
    const limit = req.query.limit;
    const offset = req.query.offset;
    // const { limit, offset} = req.body || {};
    const userId = req.user?.userId;
    const rows = await listGamesByIsPublicNoDiscount(1, { limit, offset });
    if (userId) {
      // 只有当 userId 存在时才执行查询逻辑
      for (const row of rows) {
        const alreadyPurchased = await checkUserAlreadyPurchased(userId, row.file_id);
        //console.log("===============================alreadyPurchased",alreadyPurchased);
        row.paid = alreadyPurchased;
      }
    } else {
      // 没有 userId，全部设为 false
      rows.forEach(row => {
        row.paid = false;
      });
    }
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('gamesController.listPublicGames error:', err);
    return res.status(500).json({ success: false, message: err.message || '查询失败' });
  }
}

// 公开游戏列表查询(有优惠价格)
export async function listPublicGamesWithDiscount(req, res) {
  try {
    const limit = req.query.limit;
    const offset = req.query.offset;
    // const { limit, offset} = req.body || {};
    const userId = req.user?.userId;
    const rows = await listGamesByIsPublicWithDiscount(1, { limit, offset });
    if (userId) {
      // 只有当 userId 存在时才执行查询逻辑
      for (const row of rows) {
        const alreadyPurchased = await checkUserAlreadyPurchased(userId, row.file_id);
        row.paid = alreadyPurchased;
      }
    } else {
      // 没有 userId，全部设为 false
      rows.forEach(row => {
        row.paid = false;
      });
    }
    return res.json({ success: true, data: rows });
  }
  catch (err) {
    console.error('gamesController.listPublicGamesWithDiscount error:', err);
    return res.status(500).json({ success: false, message: err.message || '查询失败' });
  }
}

// 发布游戏
export async function publishGame(req, res) {
  try {
    // const fileId = req.params.fileId;
    const userId = req.user?.userId;
    const { fileId, priceAmount } = req.body || {};

    if (!fileId) {
      return res.status(400).json({ success: false, message: '缺少 file_id' });
    }

    if (priceAmount === undefined || priceAmount === null) {
      return res.status(400).json({ success: false, message: '缺少 priceAmount' });
    }

    const parsedPrice = Number(priceAmount);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ success: false, message: 'priceAmount 必须是大于等于 0 的数字' });
    }

    // 创建作者的购买订单（状态为paid）
    const gameData = await getGameDataByFileId(fileId);
    const purchaseNo = generatePurchaseNo(userId.toString());
    console.log("==================purchaseNo", purchaseNo);
    await createPointsPurchase({
      purchase_no: purchaseNo,
      user_id: userId,
      file_id: fileId,
      game_title: gameData.title,
      points_cost: 0,
      purchase_status: 'completed'
    });


    const game = await publishGameByFileId(fileId, parsedPrice);
    return res.json({ success: true, data: game });
  } catch (err) {
    console.error('gamesController.publishGame error:', err);
    return res.status(500).json({ success: false, message: err.message || '发布失败' });
  }
}

// 游戏下架
export async function unpublishGame(req, res) {
  try {
    // const fileId = req.params.fileId;
    const { fileId } = req.body || {};
    const userId = req.user?.userId;
    if (!fileId) {
      return res.status(400).json({ success: false, message: '缺少 file_id' });
    }
    // 删除创作者订单
    if (!userId) {
      return res.status(400).json({ success: false, message: '缺少 userId' });
    }
    await deletePointsPurchaseByUserAndFile(userId, fileId);
    // console.log("==================删除创作者订单成功");
    const game = await unpublishGameByFileId(fileId);
    return res.json({ success: true, data: game });
  } catch (err) {
    console.error('gamesController.publishGame error:', err);
    return res.status(500).json({ success: false, message: err.message || '下架失败' });
  }
}

// 删除游戏
export async function deleteGame(req, res) {
  try {
    const fileId = req.params.fileId;
    if (!fileId) {
      return res.status(400).json({ success: false, message: '缺少 file_id' });
    }

    // 先获取游戏信息以获取创建者用户ID
    let creatorUserId = null;
    try {
      creatorUserId = await getCreatorUserIdByFileId(fileId);
    } catch (error) {
      console.warn('获取游戏创建者失败:', error);
    }

    // 标记删除 game_sessions 表中 file_id 等于 fileId 的所有记录
    try {
      const deletedSessionsCount = await deleteGameSessionsByFileId(fileId);
      console.log(`已删除 ${deletedSessionsCount} 条 game_sessions 记录（file_id: ${fileId}）`);
    } catch (error) {
      console.error('删除 game_sessions 记录失败:', error);
    }

    const game = await deleteGameByFileId(fileId);

    // 更新用户的 fileIds 字段，移除已删除的 fileId
    if (creatorUserId) {
      try {
        const user = await getUserByUserId(creatorUserId);
        if (user && user.fileIds) {
          let fileIds = [];
          // 解析现有的 fileIds
          try {
            fileIds = JSON.parse(user.fileIds);
            if (!Array.isArray(fileIds)) {
              fileIds = [];
            }
          } catch (parseError) {
            console.warn('解析用户 fileIds 失败:', parseError);
            fileIds = [];
          }
          // 从数组中移除对应的 fileId
          const originalLength = fileIds.length;
          fileIds = fileIds.filter(id => id !== fileId);

          if (fileIds.length !== originalLength) {
            // 更新用户的 fileIds 字段
            await updateUser(user.userId, {
              fileIds: JSON.stringify(fileIds)
            });
          }
        }
      } catch (updateError) {
        console.error('更新用户 fileIds 失败:', updateError);
        console.error('错误堆栈:', updateError.stack);
        // 不影响游戏删除的成功响应，只记录错误
      }
    }

    return res.json({ success: true, data: game });
  } catch (err) {
    console.error('gamesController.deleteGame error:', err);
    console.error('错误堆栈:', err.stack);
    return res.status(500).json({ success: false, message: err.message || '删除失败' });
  }
}

// 单个游戏数据获取
export async function gameInfo(req, res) {
  try {
    const fileId = req.query.fileId;
    //console.log("===============================req.user",req.user);
    const userId = req.user?.userId;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：fileId'
      });
    }

    const game = await getGameByFileId(fileId, userId);
    //console.log("===============================userId",userId);
    // 获取是否支付成功字段
    if (userId) {
      const alreadyPurchased = await checkUserAlreadyPurchased(userId, fileId);
      //console.log("===============================alreadyPurchased",alreadyPurchased);
      game.paid = alreadyPurchased;
    } else {
      game.paid = false;
    }
    if (!game) {
      return res.status(404).json({
        success: false,
        message: '未找到对应的游戏数据'
      });
    }

    let reaction = null;
    if (userId) {
      const reactionData = await checkUserReaction(fileId, userId);
      reaction = reactionData ? reactionData.reaction : null;
    }

    return res.json({
      success: true,
      data: {
        ...game,
        reaction: reaction
      }
    });
  } catch (err) {
    console.error('gamesController.gameInfo error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || '获取游戏数据失败'
    });
  }
}

// 手动标记订单为已支付（用于后台或补偿操作）
export async function markOrderPaid(req, res) {
  try {
    const {
      outTradeNo,
      transactionId,
      openid,
      notifyData
    } = req.body || {};

    if (!outTradeNo || !transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：outTradeNo 或 transactionId'
      });
    }

    const updatedOrder = await updateOrderToPaid(outTradeNo, {
      wechat_transaction_id: transactionId,
      wechat_openid: openid || null,
      notify_data: notifyData || null
    });

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: '未找到对应的订单'
      });
    }

    return res.json({
      success: true,
      message: '订单状态已更新为已支付',
      data: updatedOrder
    });
  } catch (err) {
    console.error('gamesController.markOrderPaid error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || '更新订单状态失败'
    });
  }
}

// 根据userId,fileId删除存档
export async function deleteGamSession(req, res) {
  try {
    const { fileId } = req.body || {};
    const userId = req.user?.userId;
    // 参数校验
    if (!userId || !fileId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：userId 或 fileId'
      });
    }

    // 通过userId和fileId查询到对应的数据，然后获取到sessionId(查询game_sessions表)
    const gameSession = await getGameSessionByUserAndFile(String(userId), String(fileId));

    if (!gameSession || !gameSession.session_id) {
      return res.status(404).json({
        success: false,
        message: '未找到对应的游戏会话记录'
      });
    }

    const sessionId = gameSession.session_id;
    const normalizedUserId = String(userId);

    // 调用minioService中的deletePrefixFromMinio方法
    // bucketName："interactive-fiction-game-data" prefix:"userId/sessionId"
    const deleteResult = await deletePrefixFromMinio(
      'interactive-fiction-game-data',
      `${normalizedUserId}/${sessionId}`
    );
    // 删除game_sessions表中的数据
    try {
      const deletedRows = await deleteGameSessionBySessionId(sessionId);
      console.log(`已删除 ${deletedRows} 条 game_sessions 记录（sessionId: ${sessionId}）`);
    } catch (error) {
      console.error('删除 game_sessions 记录失败:', error);
    }
    // 返回删除成功的data
    return res.json({
      success: true,
      message: '存档删除成功',
      data: {
        userId: normalizedUserId,
        fileId: String(fileId),
        sessionId: sessionId,
        deleted: deleteResult.deleted || 0
      }
    });
  } catch (err) {
    console.error('gamesController.deleteGamSession error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || '删除存档失败'
    });
  }
}

// 玩家的历史游戏仓库(包含自己的游戏) =》 购买过的游戏
export async function userGamSession(req, res) {
  try {
    const userId = req.user?.userId;
    const limit = req.query.limit;
    const offset = req.query.offset;
    //console.log("===========================limit,offset",limit,offset);
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少 userId'
      });
    }
    // 查询用户购买过的游戏
    const fileIds = await getUserPaidFileIdsInPoints(userId);
    const gamesWithAvatar = await getGamesByFileIds(fileIds, userId, { limit, offset });
    return res.json({ success: true, data: gamesWithAvatar });
  } catch (error) {
    console.error('userGamSession error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || '查询游戏失败'
    });
  }
}

// 导出游戏历史数据（history + npc_chat）为 doc
export async function exportGameHistoryDoc(req, res) {
  try {
    const sessionId = (req.params.sessionId || req.query.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 sessionId'
      });
    }

    const baseDir = path.join(process.cwd(), 'public', 'game_data', sessionId);
    if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
      return res.status(404).json({
        success: false,
        message: `未找到会话对应的数据目录：${sessionId}`
      });
    }

    const historyFileName = `history_${sessionId}.json`;
    const historyFilePath = path.join(baseDir, historyFileName);
    let historyData = null;
    if (fs.existsSync(historyFilePath)) {
      const rawHistory = safeReadJson(historyFilePath);
      if (rawHistory) {
        // 如果文件包含 history 数组，则提取每项的 message 或 content 字段为字符串数组
        if (Array.isArray(rawHistory.history)) {
          historyData = rawHistory.history.map(item => {
            if (!item) return null;
            return item.message ?? item.content ?? item.text ?? null;
          }).filter(Boolean);
        } else if (Object.prototype.hasOwnProperty.call(rawHistory, 'message')) {
          // 兼容旧格式：顶层 message 字段
          historyData = [rawHistory.message];
        } else {
          historyData = null;
        }
      }
    }

    const npcPrefix = `npc_chat_${sessionId}`;
    const files = fs.readdirSync(baseDir);
    const npcChatEntries = [];
    for (const fileName of files) {
      if (fileName.startsWith(npcPrefix) && fileName.endsWith('.json')) {
        const fullPath = path.join(baseDir, fileName);
        const data = safeReadJson(fullPath);
        if (data !== null) {
          // 提取其中每项的 content 字段为字符串数组
          let messages = null;
          if (data && Array.isArray(data.chatHistory)) {
            messages = data.chatHistory.map(item => {
              if (!item) return null;
              return item.content ?? item.message ?? item.text ?? null;
            }).filter(Boolean);
          } else if (data && Object.prototype.hasOwnProperty.call(data, 'message')) {
            // 若没有 chatHistory，但存在顶层 message，包装为单元素数组
            messages = [data.message];
          }

          npcChatEntries.push({
            fileName,
            messages
          });
        }
      }
    }

    if (!historyData && npcChatEntries.length === 0) {
      return res.status(404).json({
        success: false,
        message: '目标目录下未找到 history 或 npc_chat 文件'
      });
    }

    const docHtml = buildHistoryDocHtml(sessionId, historyData, npcChatEntries);
    const buffer = Buffer.from(docHtml, 'utf8');

    res.setHeader('Content-Type', 'application/msword');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=history.doc`
    );
    return res.send(buffer);
  } catch (error) {
    console.error('exportGameHistoryDoc error:', error);
    return res.status(500).json({
      success: false,
      message: error && error.message ? error.message : '导出历史数据失败'
    });
  }
}

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`读取 JSON 文件失败：${filePath}`, error);
    return null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatJsonBlock(data) {
  if (data === null || data === undefined) return '（无数据）';
  try {
    // 如果是数组，则去掉两边的方括号，按条目显示（每条之间空一行）
    if (Array.isArray(data)) {
      const parts = data.map(item => {
        if (item === null || item === undefined) return '';
        if (typeof item === 'string') return escapeHtml(item);
        try {
          return escapeHtml(JSON.stringify(item, null, 2));
        } catch {
          return escapeHtml(String(item));
        }
      }).filter(p => p !== '');
      return parts.join('\n\n');
    }

    if (typeof data === 'object') {
      return escapeHtml(JSON.stringify(data, null, 2));
    }
    return escapeHtml(String(data));
  } catch {
    return escapeHtml(String(data));
  }
}

function buildHistoryDocHtml(sessionId, historyData, npcChatEntries) {
  const sections = [];

  if (historyData) {
    sections.push(`
      <h2>时间流逝文件</h2>
      <pre>${formatJsonBlock(historyData)}</pre>
    `);
  }

  if (npcChatEntries.length > 0) {
    sections.push('<h2>NPC 对话文件</h2>');
    npcChatEntries.forEach((entry, index) => {
      sections.push(`
        <h3>${index + 1}</h3>
        <pre>${formatJsonBlock(entry.messages)}</pre>
      `);
    });
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Session ${sessionId} 历史导出</title>
      <style>
        body { font-family: "Microsoft YaHei", Arial, sans-serif; padding: 20px; line-height: 1.6; }
        h1 { text-align: center; }
        pre {
          background: #f4f6fb;
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #e0e5f1;
          white-space: pre-wrap;
          word-wrap: break-word;
          font-size: 20px;
          font-family: Consolas, "Courier New", monospace;
        }
        h2 { border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      </style>
    </head>
    <body>
      <h1>游戏会话历史导出</h1>
      <p><strong>导出时间：</strong>${escapeHtml(new Date().toLocaleString())}</p>
      ${sections.join('\n')}
    </body>
    </html>
  `;
}


// 创建订单编号函数
function generatePurchaseNo(userId = '') {
  const prefix = 'POINTS';

  // 时间部分：YYMMDDHHmmss
  const now = new Date();
  const timestamp = [
    now.getFullYear().toString().slice(2), // 年后两位
    String(now.getMonth() + 1).padStart(2, '0'), // 月
    String(now.getDate()).padStart(2, '0'), // 日
    String(now.getHours()).padStart(2, '0'), // 时
    String(now.getMinutes()).padStart(2, '0'), // 分
    String(now.getSeconds()).padStart(2, '0') // 秒
  ].join('');

  // 随机部分：4位随机数
  const random = Math.floor(1000 + Math.random() * 9000);

  // 用户标识：取用户ID后4位（如果有）
  const userSuffix = userId ? userId.slice(-4) : '';

  return `${prefix}${timestamp}${random}${userSuffix}`;
}

const exported = { create, listAll, listByUser, getInitFilesByFileId, getFilesOfAdminUser, completeGameSession, gameInfo, exportGameHistoryDoc, unpublishGame, completeGameByParams };
export default exported;
