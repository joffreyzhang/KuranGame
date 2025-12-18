import { createGame, listAllGames, listGamesByUser, listGamesByIsPublicNoDiscount, listGamesByIsPublicWithDiscount, publishGameByFileId, deleteGameByFileId, getGameFilesByFileId, getGameByFileId, listFileIdsAndFilesByUser, getCreatorUserIdByFileId, createGameSession, getGameSessionByFiles, getGameSessionByUserAndFile, updateGameSessionEndTime, updateGameSessionStatusAndFiles, getUserIdBySessionId, getGameSessionBySessionId, deleteGameSessionsByFileId, deleteGameSessionBySessionId, getFileIdsFromSessionsByUser, getGamesByFileIds, listPublicGameCreatorIds, unpublishGameByFileId, getGameDataByFileId, updateGameCoverUrl } from '../service/gamesService.js';
import { downloadPrefixToLocal, uploadLocalFolderToMinio, uploadImage, uploadfileToMinio, uploadInitJsonFilesToMinio, uploadSessionJsonFilesToMinio, deletePrefixFromMinio } from '../service/minioService.js';
import { updateUser, getUserById, getUserByUserId } from '../service/authService.js';
import { checkUserReaction } from '../service/gameLikeService.js';
import { checkUserAlreadyPurchased, getUserPaidFileIdsInPoints, createPointsPurchase, deletePointsPurchaseByUserAndFile } from '../service/pointsPurchasesService.js';
import { getPaymentStatusByUserIdAndFileId, getUserPaidFileIds, updateOrderToPaid } from '../service/gameOrdersService.js';
import { processDocumentFile } from '../../controllers/visualGameController.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import taskManager from './persisentTaskManager.js';
import co from 'co';

// 创建游戏
export async function uploadAndProcessDocument(req, res) {
    try {
        const payload = req.body || {};
        // if (!payload.title) {
        //     return res.status(400).json({ success: false, message: '缺少必填字段：title' });
        // }
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
        // 根据userIdForPrefix获取用户信息
        const user = await getUserByUserId(userIdForPrefix);
        const authorName = user?.phoneNumber || null;
        console.log("----------------------------userId", userIdForPrefix);
        if (!userIdForPrefix) {
            return res.status(400).json({ success: false, message: '缺少必填字段：creator_user_id' });
        }
        let derivedFileId = null;
        // let coverUrl = null;
        let docUrl = null;
        let parseResult = null;

        // doc,pdf的解析
        // 如果传了文档文件，同步调用后端解析接口（/api/backend/pdf/upload-and-process）

        try {
            // 使用 upload.single('document') 后，文件在 req.file 中
            let docFileForParse = req.file;
            // 兼容处理：如果没有 req.file，尝试从 req.files 数组中查找
            if (!docFileForParse && Array.isArray(req.files)) {
                docFileForParse = req.files.find(f => f.fieldname === 'document');
            }
            if (docFileForParse) {
                const fileBufferForParse = docFileForParse.buffer || fs.readFileSync(docFileForParse.path);
                const filenameForParse = docFileForParse.originalname || 'document.pdf';
                const mimetypeForParse = docFileForParse.mimetype || 'application/pdf';

                console.log('-------------------------开始上传文档------------------------');
                console.log(`[文档解析] 文件名: ${filenameForParse}, 大小: ${fileBufferForParse.length} 字节`);

                // 设置超时时间为 25 分钟（1500000ms），文档解析可能需要较长时间
                const timeoutMs = Number(process.env.DOCUMENT_PARSE_TIMEOUT_MS || 1500000);
                console.log(`[文档解析] 超时设置: ${timeoutMs}ms (${timeoutMs / 60000} 分钟)`);

                // 直接调用函数处理文档，而不是通过 HTTP 请求
                parseResult = await processDocumentFile(fileBufferForParse, {
                    originalname: filenameForParse,
                    mimetype: mimetypeForParse,
                    generateImages: shouldUploadImages, // 根据请求参数决定是否生成图片
                    cleanupTempFile: true,
                    timeout: timeoutMs
                });

                console.log("========================parseResult", parseResult);

                if (parseResult && parseResult.fileId) {
                    derivedFileId = parseResult.fileId;
                    console.log('------------------文档解析结果的fileId-------------------', parseResult.fileId);
                } else {
                    console.warn('[文档解析] 文档处理成功，但未返回 fileId');
                }
            }
        } catch (error) {
            console.warn('[文档解析] 调用失败，忽略并继续:', error && error.message ? error.message : error);
            if (error && error.stack) console.warn('[文档解析] 错误堆栈:', error.stack);

            // 更精确的错误类型判断
            if (error.name === 'AbortError' || error.message?.includes('timeout') || error.message?.includes('超时')) {
                const timeoutMs = Number(process.env.DOCUMENT_PARSE_TIMEOUT_MS || 1500000);
                console.warn(`[文档解析] 处理超时，耗时超过 ${timeoutMs / 60000} 分钟`);
                console.warn('[文档解析] 建议：1. 增加超时时间 2. 优化文档内容 3. 减少文件大小');
            } else if (error.message?.includes('Invalid file') || error.message?.includes('No file')) {
                console.warn('[文档解析] 文件格式错误:', error.message);
            } else {
                console.warn('[文档解析] 其他错误:', error.message);
            }
        }

        // file_id 优先使用解析结果，其次兼容传入 图片的上传
        const fileId = derivedFileId;
        if (!fileId) {
            return res.status(400).json({ success: false, message: '缺少 file_id（请通过文档解析获取或提供）' });
        }
        // 规范化前缀，去掉首尾斜杠
        const normalizedFileId = String(fileId).replace(/^\/+|\/+$/g, '');

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


        try {
            try {
                // 检查目录是否存在
                const imageDirPath = `public/visual_game/images/${normalizedFileId}`;
                const fullImagePath = path.join(process.cwd(), imageDirPath);

                if (fs.existsSync(fullImagePath) && fs.statSync(fullImagePath).isDirectory()) {
                    // 映射为内部需要的字段 fileId，并按给定格式提供 localRoot 与 bucketName
                    const uploadParams = {
                        localRoot: `public/visual_game/images/${normalizedFileId}`,
                        fileId: normalizedFileId,
                        userId: String(userIdForPrefix),
                        bucketName: 'interactive-fiction-game-init',
                        deleteBeforeUpload: false
                    };
                    await uploadLocalFolderToMinio(uploadParams);
                } else {
                    console.log(`[图片上传到 MinIO] 路径 ${imageDirPath} 不存在，跳过图片上传`);
                }
            } catch (e) {
                console.warn('[图片上传到 MinIO] 跳过或失败:', e && e.message ? e.message : e);

            }
            try {
                await uploadInitJsonFilesToMinio({
                    userId: String(userIdForPrefix),
                    fileId: normalizedFileId,
                    bucketName: 'interactive-fiction-game-init',
                    visual: 'true'
                });
                console.log('[初始化 JSON 上传到 MinIO] ======成功=======');
            } catch (e) {
                console.warn('[初始化 JSON 上传到 MinIO] 跳过或失败:', e && e.message ? e.message : e);
            }
        } catch (e) {
            console.warn('[初始化文件上传到 MinIO] 跳过或失败:', e && e.message ? e.message : e);
        }


        //通过接口获取标题
        // /api/visual/edit/6cff974c-30d5-4b17-a95d-0afdccaaedc1/complete
        const baseUrl = process.env.SELF_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const resp = await fetch(`${baseUrl}/api/visual/edit/${normalizedFileId}/complete`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await resp.json();
        // 将上传后的 URL 与 files 添加到 payload
        const finalPayload = {
            title: data.worldSetting.title,
            subtitle: data.worldSetting.title,
            description: data.worldSetting.background,
            creator_user_id: userIdForPrefix,
            file_id: normalizedFileId,
            cover_url: null,
            doc_url: docUrl,
            version: 'new',
            files: `interactive-fiction-game-init/${userIdForPrefix}/${normalizedFileId}`,
            author_name: authorName
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


// 创建会话session
export async function visualSessionCreate(req, res) {
    try {
        const { presetId, fileId } = req.body || {};
        const userId = req.user?.userId;
        console.log("============================session:userId", userId);
        console.log("============================session:presetId", presetId);
        if (!fileId && !presetId) {
            return res.status(400).json({
                success: false,
                message: '缺少必填参数'
            });
        }


        const usedId = fileId || presetId;
        const normalizedFileId = String(usedId).trim();
        const normalizedUserId = String(userId).trim();
        if (!normalizedFileId || !normalizedUserId) {
            return res.status(400).json({
                success: false,
                message: 'fileId 或 userId 不能为空字符串'
            });
        }
        // 如果games_saves路径下存在${filedId}的文件夹的话，就不再拉取初始化文件，直接看existingSession是否存在
        let initFilesPath = null;
        const gameSavesPath = `visual_saves/${normalizedFileId}`;
        const folderExists = fs.existsSync(gameSavesPath) && fs.statSync(gameSavesPath).isDirectory();

        if (!folderExists) {
            try {
                console.log("----------------------------拉取初始化文件-----------------------------")
                initFilesPath = await downloadInitFilesAndReturnFiles(normalizedFileId, 'visual_saves');
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
            console.log("========================${baseUrl}/api/visual/session/create", `${baseUrl}/api/visual/session/create`);

            try {
                let response = await fetch(`${baseUrl}/api/visual/session/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        presetId: normalizedFileId
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
                const filesValue = initFilesPath || `visual_saves/${normalizedFileId}`;

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
                    await completeGameSessionByParams(backendSessionResp.sessionId, 'public/visual_game/sessions', normalizedFileId);
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
            console.log("--------------------------------不是第一次游戏会话---------------------------")
            // 检查拉取后的文件夹是否有 avatars 文件夹(是否是无图模式)，如果没有则删除整个文件夹（无图模式的逻辑增加）
            const npcsPath = path.join(gameSavesPath, 'npcs');
            const scenesPath = path.join(gameSavesPath, 'scenes');
            const avatarExists = fs.existsSync(npcsPath) && fs.statSync(npcsPath).isDirectory();
            const iconExists = fs.existsSync(scenesPath) && fs.statSync(scenesPath).isDirectory();
            console.log("==============================iconExists", iconExists);
            console.log("==========================avatarExists", avatarExists);
            if (!avatarExists && !iconExists) {
                console.log(`[sessionCreate] visual_saves/${normalizedFileId} 文件夹下没有图片文件夹，删除该文件夹`);
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
            const sessionDataPath = `public/visual_game/sessions/${existingSession.session_id}`;
            const sessionDataFolderExists = fs.existsSync(sessionDataPath) && fs.statSync(sessionDataPath).isDirectory();

            if (sessionDataFolderExists) {
                console.log(`[sessionCreate] public/visual_game/sessions/${existingSession.session_id} 文件夹已存在，跳过下载步骤`);
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
                sessionDataSync = await uploadGameSessionDataBySessionId(existingSession.session_id, 'public/visual_game/sessions');
            } catch (error) {
                console.warn('[sessionCreate] 拉取已存在会话的游戏数据失败', error && error.message ? error.message : error);
            }
            // // 复制预设游戏的images同步 images 资源目录
            // try {
            //     copyGameImagesToSession(normalizedFileId, existingSession.session_id);
            // } catch (error) {
            //     console.warn('[sessionCreate] 同步 images 目录失败', error && error.message ? error.message : error);
            // }
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

// 上传游戏封面图片接口
export async function uploadGameCover(req, res) {
    try {
        // 获取当前用户信息
    const user = req.user?.userId;
        if (!user) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
        }

        // 检查请求类型
        const contentType = req.headers['content-type'] || '';
        if (!contentType.startsWith('multipart/form-data')) {
      return res.status(400).json({ success: false, error: 'Invalid Content-Type' });
        }

        // 获取表单数据
        const fileId = req.body.fileId;
        const coverFile = req.file;
        // 验证参数
        // if (!fileId) {
        //   return res.status(400).json({ success: false, error: 'Missing fileId parameter' });
        // }

        if (!coverFile) {
      return res.status(400).json({ success: false, error: 'No cover image uploaded' });
        }

        // 检查游戏是否存在且属于当前用户
        const game = await getGameByFileId(fileId);
        if (!game) {
      return res.status(404).json({ success: false, error: 'Game not found' });
        }

        // 验证权限（只有创建者可以修改）
        if (String(game.creator_user_id) !== String(user)) {
      return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        // 上传图片到 MinIO
        try {
            const coverFileBuffer = coverFile.buffer || fs.readFileSync(coverFile.path);
            const coverFileName = coverFile.originalname;

            // 指定上传到指定 bucket/prefix：interactive-fiction-game-init/<userId>/<fileId>/cover
            const destPath = `interactive-fiction-game-init/${game.creator_user_id}/${fileId}/cover`;
            const result = await uploadImage(coverFileBuffer, coverFileName, coverFile.mimetype, destPath);

            // 原始逻辑 + 正则去除前缀
            const coverUrl = result && result.url ? result.url.replace(/^http(s)?:\/\/.+?:\d+\/(.+)$/, '$2') : null;

            // 更新数据库中的 cover_url 字段
            await updateGameCoverUrl(fileId, coverUrl);

            // 清理临时文件
            if (coverFile.path && !coverFile.buffer) {
                try {
                    fs.unlinkSync(coverFile.path);
                } catch (err) {
                    console.warn('Failed to clean up temporary file:', err);
                }
            }

            return res.json({
                success: true,
                message: 'Cover image uploaded successfully',
                data: {
                    coverUrl,
                    result
                }
            });
        } catch (error) {
            console.error('[封面图片上传] 上传失败:', error);
            console.error('[封面图片上传] 错误堆栈:', error.stack);
      return res.status(500).json({ success: false, message: '封面图片上传失败: ' + error.message });
        }
    } catch (error) {
        console.error('uploadGameCover error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || '服务器内部错误'
        });
    }
}


//=================
//通用函数
//=================

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


// 游戏会话存储，上传数据并写入/更新 （本地的上传路径为local_path）
export async function completeGameSessionByParams(session_id, local_path, file_id) {
    // 先通过 session_id 查询是否存在记录（session_id 是唯一键）
    const existingSession = await getGameSessionBySessionId(session_id);

    // 通过 session_id 获取 user_id（如果 existingSession 存在，则从 existingSession 中获取）
    const user_id = existingSession ? existingSession.user_id : null;

    if (!user_id) {
        throw new Error('未找到对应的用户（根据 session_id）');
    }

    // 本地上传源路径：<local_path>/<session_id>
    const localRoot = (local_path && String(local_path).trim()) ? String(local_path).trim() : 'public/visual_game/sessions';
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
        console.log("======================游戏初始会话存储成功=================");
    } catch (e) {
        console.error('uploadSessionJsonFilesToMinio error:', e);
        throw new Error('MinIO 上传失败: ' + (e && e.message ? e.message : String(e)));
    }

    if (existingSession) {
        // 如果存在相同的 session_id，更新 status、files 和 ended_at 字段
        return await updateGameSessionStatusAndFiles(existingSession.id, 'completed', filesValue, new Date());
    }

    // 创建新的 game_session 记录
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

// ==================
// 任务管理相关函数
// ==================

// 判断是否应该上传图片
function shouldUploadImages(generateImages) {
    const normalizedGenerateImages =
        typeof generateImages === 'string'
            ? generateImages.trim().toLowerCase()
            : generateImages;
    return !(
        normalizedGenerateImages === false ||
        normalizedGenerateImages === 0 ||
        normalizedGenerateImages === 'false' ||
        normalizedGenerateImages === '0'
    );
}

// 估算剩余时间
function estimateRemainingTime(task) {
    if (task.progress === 0) return '约3-5分钟';
    if (task.progress < 30) return '约2-4分钟';
    if (task.progress < 70) return '约1-2分钟';
    if (task.progress < 90) return '约30秒-1分钟';
    return '即将完成';
}

// 带进度的文档处理
async function processDocumentWithProgress(fileBuffer, options, onProgress) {
    let currentProgress = 0;
    
    try {
        await onProgress(10, '开始解析文档...');
        
        const parseResult = await processDocumentFile(fileBuffer, {
            ...options,
            cleanupTempFile: true
        });
        
        await onProgress(70, '文档解析完成');
        
        return parseResult;
    } catch (error) {
        await onProgress(0, `解析失败: ${error.message}`);
        throw error;
    }
}

// 上传文档到MinIO
async function uploadDocumentToMinio(fileBuffer, fileId, userId, options) {
    const tempFilePath = path.join(process.cwd(), 'temp', `${fileId}_${Date.now()}.tmp`);
    
    try {
        // 确保临时目录存在
        const tempDir = path.dirname(tempFilePath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // 写入临时文件
        fs.writeFileSync(tempFilePath, fileBuffer);
        
        // 创建文件对象
        const docFile = {
            path: tempFilePath,
            buffer: fileBuffer,
            originalname: options.originalname || 'document.pdf',
            mimetype: options.mimetype || 'application/pdf'
        };
        
        // 上传到MinIO
        const result = await uploadfileToMinio(docFile, fileId, String(userId));
        const docUrl = result && result.url ? result.url.replace(/^http(s)?:\/\/.+?:\d+\/(.+)$/, '$2') : null;
        
        // 清理临时文件
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        
        return docUrl;
    } catch (error) {
        // 清理临时文件
        if (fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (e) {
                // 忽略清理错误
            }
        }
        throw error;
    }
}

// 上传图片到MinIO
async function uploadImagesToMinio(fileId, userId) {
    try {
        const imageDirPath = `public/visual_game/images/${fileId}`;
        const fullImagePath = path.join(process.cwd(), imageDirPath);

        if (fs.existsSync(fullImagePath) && fs.statSync(fullImagePath).isDirectory()) {
            const uploadParams = {
                localRoot: `public/visual_game/images/${fileId}`,
                fileId: fileId,
                userId: String(userId),
                bucketName: 'interactive-fiction-game-init',
                deleteBeforeUpload: false
            };
            await uploadLocalFolderToMinio(uploadParams);
        } else {
            console.log(`[图片上传到 MinIO] 路径 ${imageDirPath} 不存在，跳过图片上传`);
            // 如果路径不存在，不抛出错误，只是跳过
            return;
        }
    } catch (error) {
        console.warn('[图片上传到 MinIO] 跳过或失败:', error && error.message ? error.message : error);
        // 图片上传失败不应该阻止整个流程，只记录警告
    }
}

// 上传初始化JSON到MinIO
async function uploadInitJsonToMinio(fileId, userId) {
    try {
        await uploadInitJsonFilesToMinio({
            userId: String(userId),
            fileId: fileId,
            bucketName: 'interactive-fiction-game-init',
            visual: 'true'
        });
        console.log('[初始化 JSON 上传到 MinIO] ======成功=======');
    } catch (error) {
        console.warn('[初始化 JSON 上传到 MinIO] 跳过或失败:', error && error.message ? error.message : error);
        throw error;
    }
}

// 获取游戏信息
async function getGameInfo(fileId) {
    try {
        const baseUrl = process.env.SELF_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const resp = await fetch(`${baseUrl}/api/visual/edit/${fileId}/complete`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!resp.ok) {
            throw new Error(`获取游戏信息失败: ${resp.status}`);
        }
        
        return await resp.json();
    } catch (error) {
        console.error('[获取游戏信息] 失败:', error);
        throw error;
    }
}

// 创建游戏记录
async function createGameRecord(fileId, userId, docUrl, gameInfo) {
    const user = await getUserByUserId(userId);
    const authorName = user?.phoneNumber || null;
    
    const finalPayload = {
        title: gameInfo.worldSetting.title,
        subtitle: gameInfo.worldSetting.title,
        description: gameInfo.worldSetting.background,
        creator_user_id: userId,
        file_id: fileId,
        cover_url: null,
        doc_url: docUrl,
        version: 'new',
        files: `interactive-fiction-game-init/${userId}/${fileId}`,
        author_name: authorName
    };

    const row = await createGame(finalPayload);
    console.log('-------------------------数据库插入数据结果------------------------', row);
    
    return row;
}

// 更新用户fileIds
async function updateUserFileIds(userId, fileId) {
    try {
        const user = await getUserByUserId(userId);
        if (user) {
            let fileIds = [];

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

            if (!fileIds.includes(fileId)) {
                fileIds.push(fileId);
                await updateUser(user.userId, {
                    fileIds: JSON.stringify(fileIds)
                });
                console.log(`用户 ${userId} 的 fileIds 已更新:`, fileIds);
            }
        }
    } catch (error) {
        console.error('更新用户 fileIds 失败:', error);
        throw error;
    }
}

// 启动文档处理协程
function startDocumentProcessingCoroutine(taskId, userId, fileBuffer, options, startProgress = 0) {
    const coroutine = co(function* () {
        try {
            let currentProgress = startProgress;
            
            if (currentProgress < 10) {
                yield taskManager.updateProgress(taskId, 10, '初始化任务');
            }
            
            // 步骤1: 解析文档
            if (currentProgress < 50) {
                yield taskManager.updateProgress(taskId, 30, '开始解析文档');
                
                const parseResult = yield processDocumentWithProgress(
                    fileBuffer,
                    options,
                    async (progress, message) => {
                        const overallProgress = 30 + progress * 0.4;
                        return taskManager.updateProgress(taskId, overallProgress, message);
                    }
                );
                
                if (!parseResult?.fileId) {
                    throw new Error('文档解析失败');
                }
                
                const fileId = String(parseResult.fileId).replace(/^\/+|\/+$/g, '');
                
                yield taskManager.updateProgress(taskId, 70, '文档解析完成', { fileId });
                currentProgress = 70;
            }
            
            // 获取fileId
            const task = yield taskManager.getTask(taskId);
            const fileId = task.fileId || task.result?.fileId;
            
            if (!fileId) {
                throw new Error('无法获取fileId');
            }
            
            // 步骤2: 上传文档到MinIO
            if (currentProgress < 75) {
                yield taskManager.updateProgress(taskId, 75, '上传文档到存储');
                const docUrl = yield uploadDocumentToMinio(fileBuffer, fileId, userId, options);
                yield taskManager.updateProgress(taskId, 75, '文档上传完成', { docUrl });
            }
            
            // 步骤3: 上传图片
            if (currentProgress < 80) {
                yield taskManager.updateProgress(taskId, 80, '上传图片资源');
                try {
                    yield uploadImagesToMinio(fileId, userId);
                } catch (error) {
                    console.warn('[上传图片] 失败，继续执行:', error.message);
                }
            }
            
            // 步骤4: 上传初始化JSON
            if (currentProgress < 85) {
                yield taskManager.updateProgress(taskId, 85, '生成配置文件');
                yield uploadInitJsonToMinio(fileId, userId);
            }
            
            // 步骤5: 获取游戏信息
            if (currentProgress < 90) {
                yield taskManager.updateProgress(taskId, 90, '获取游戏信息');
                const gameInfo = yield getGameInfo(fileId);
                yield taskManager.updateProgress(taskId, 90, '游戏信息获取完成', { gameInfo });
            }
            
            // 步骤6: 创建游戏记录
            if (currentProgress < 95) {
                yield taskManager.updateProgress(taskId, 95, '创建游戏记录');
                const task = yield taskManager.getTask(taskId);
                const docUrl = task.docUrl || task.result?.docUrl;
                const gameInfo = task.gameInfo || task.result?.gameInfo;
                
                if (!gameInfo) {
                    throw new Error('缺少游戏信息');
                }
                
                const gameRecord = yield createGameRecord(fileId, userId, docUrl, gameInfo);
                yield taskManager.updateProgress(taskId, 95, '游戏记录创建完成', { gameRecord });
            }
            
            // 步骤7: 更新用户信息
            if (currentProgress < 100) {
                yield taskManager.updateProgress(taskId, 98, '更新用户信息');
                yield updateUserFileIds(userId, fileId);
            }
            
            // 完成任务
            const finalTask = yield taskManager.getTask(taskId);
            yield taskManager.completeTask(taskId, {
                gameId: finalTask.gameRecord?.id || 'generated_id',
                fileId: fileId,
                title: finalTask.gameInfo?.worldSetting?.title || '处理完成',
                recovered: startProgress > 0
            });
            
            console.log(`[协程 ${taskId}] 处理完成`);
            
        } catch (error) {
            console.error(`[协程 ${taskId}] 失败:`, error);
            yield taskManager.failTask(taskId, error);
        }
    });
    
    coroutine.then(() => {
        console.log(`[协程 ${taskId}] 协程结束`);
    }).catch(error => {
        console.error(`[协程 ${taskId}] 协程异常:`, error);
    });
}

// 服务启动时恢复未完成的任务
export async function resumeInterruptedTasks() {
    console.log('[服务启动] 恢复中断的任务...');
    
    try {
        const allTasks = Array.from(taskManager.tasks.values())
            .filter(task => 
                task.state === 'processing' || 
                task.state === 'pending' ||
                (task.state === 'failed' && Date.now() - task.updatedAt < 3600000)
            );
        
        console.log(`[服务启动] 发现 ${allTasks.length} 个中断的任务`);
        
        for (const task of allTasks) {
            console.log(`[服务恢复] 恢复任务: ${task.taskId} (${task.progress}%)`);
            
            const fileBuffer = await taskManager.restoreFileData(task);
            
            if (fileBuffer) {
                startDocumentProcessingCoroutine(
                    task.taskId,
                    task.userId,
                    fileBuffer,
                    task.options || {},
                    task.progress
                );
            } else {
                console.log(`[服务恢复] 任务 ${task.taskId} 缺少文件数据，标记为失败`);
                await taskManager.failTask(task.taskId, '服务重启导致文件数据丢失');
            }
        }
    } catch (error) {
        console.error('[服务启动] 恢复任务失败:', error);
    }
}

/**
 * POST /api/optical/document/upload-async
 * 异步上传文档接口（新版本，立即返回任务ID）
 * 文档处理在后台异步进行，即使关闭页面也会继续处理
 */
export async function uploadAndProcessDocumentAsync(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: '未登录' });
        }

        // 获取文件
        let docFile = req.file;
        if (!docFile && Array.isArray(req.files)) {
            docFile = req.files.find(f => f.fieldname === 'document');
        }
        
        if (!docFile) {
            return res.status(400).json({ success: false, message: '请上传文档' });
        }

        // 读取文件
        const fileBuffer = docFile.buffer || fs.readFileSync(docFile.path);
        
        const generateImages = req.body?.generateImages;
        const options = {
            originalname: docFile.originalname,
            mimetype: docFile.mimetype,
            generateImages: shouldUploadImages(generateImages)
        };

        // 生成任务ID
        const taskId = `doc_${Date.now()}_${uuidv4().substring(0, 8)}`;
        
        // 创建持久化任务
        await taskManager.createTask(taskId, userId, fileBuffer, options);
        
        // 启动协程处理文档
        startDocumentProcessingCoroutine(taskId, userId, fileBuffer, options);
        
        // 立即返回
        return res.json({
            success: true,
            taskId,
            message: '文档处理已开始，即使关闭页面也会继续处理',
            checkUrl: `/api/visual/tasks/${taskId}`,
            resumeHint: '重新打开页面可以恢复进度查看'
        });
    } catch (error) {
        console.error('上传失败:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * GET /api/optical/tasks/:taskId
 * 查询任务状态
 * 返回任务的当前状态、进度、结果等信息
 */
export async function getTaskStatus(req, res) {
    try {
        const { taskId } = req.params;
        const userId = req.user?.userId;
        
        if (!taskId) {
            return res.status(400).json({ success: false, message: '需要任务ID' });
        }
        
        const task = await taskManager.getTask(taskId);
        if (!task) {
            return res.status(404).json({ 
                success: false, 
                message: '任务不存在或已过期',
                hint: '任务可能已完成或被清理（超过24小时）'
            });
        }
        
        // 验证权限
        if (task.userId !== userId) {
            return res.status(403).json({ success: false, message: '无权查看此任务' });
        }
        
        // 检查任务是否中断太久
        const isStale = Date.now() - task.updatedAt > 30 * 60 * 1000; // 30分钟
        const isProcessing = task.state === 'processing' || task.state === 'pending';
        
        if (isStale && isProcessing) {
            return res.json({
                success: true,
                taskId: task.taskId,
                state: 'interrupted',
                progress: task.progress,
                message: '任务可能已中断，正在尝试恢复...',
                interrupted: true,
                updatedAt: task.updatedAt
            });
        }
        
        return res.json({
            success: true,
            taskId: task.taskId,
            state: task.state,
            progress: task.progress,
            message: task.message,
            fileId: task.fileId,
            result: task.result,
            error: task.error,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            canResume: task.state === 'interrupted' || task.state === 'failed',
            estimatedTime: estimateRemainingTime(task)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * POST /api/optical/tasks/:taskId/resume
 * 恢复中断的任务
 * 重新启动已中断或失败的任务处理
 */
export async function resumeTask(req, res) {
    try {
        const { taskId } = req.params;
        const userId = req.user?.userId;
        
        const task = await taskManager.getTask(taskId);
        if (!task) {
            return res.status(404).json({ success: false, message: '任务不存在' });
        }
        
        if (task.userId !== userId) {
            return res.status(403).json({ success: false, message: '无权操作此任务' });
        }
        
        // 只有中断或失败的任务可以恢复
        if (task.state !== 'interrupted' && task.state !== 'failed') {
            return res.status(400).json({ 
                success: false, 
                message: '只有中断或失败的任务可以恢复' 
            });
        }
        
        // 恢复文件数据
        const fileBuffer = await taskManager.restoreFileData(task);
        if (!fileBuffer) {
            return res.status(400).json({ 
                success: false, 
                message: '无法恢复文件数据，请重新上传' 
            });
        }
        
        // 重新启动协程
        startDocumentProcessingCoroutine(
            taskId,
            userId,
            fileBuffer,
            task.options || {},
            task.progress
        );
        
        // 更新任务状态
        await taskManager.updateProgress(
            taskId, 
            task.progress, 
            '正在恢复处理...',
            { state: 'processing' }
        );
        
        return res.json({
            success: true,
            taskId,
            message: '任务已开始恢复',
            progress: task.progress
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * GET /api/optical/tasks
 * 获取用户任务列表
 * 返回当前用户的所有任务，按状态分类（处理中、已完成、失败、中断）
 */
export async function getUserTasks(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: '未登录' });
        }
        
        const tasks = await taskManager.getUserTasks(userId);
        
        // 分类显示
        const categorized = {
            processing: [],
            completed: [],
            failed: [],
            interrupted: []
        };
        
        tasks.forEach(task => {
            if (task.state === 'processing' || task.state === 'pending') {
                // 检查是否中断（30分钟无更新）
                if (Date.now() - task.updatedAt > 30 * 60 * 1000) {
                    categorized.interrupted.push(task);
                } else {
                    categorized.processing.push(task);
                }
            } else if (task.state === 'completed') {
                categorized.completed.push(task);
            } else if (task.state === 'failed') {
                categorized.failed.push(task);
            }
        });
        
        return res.json({
            success: true,
            tasks: categorized,
            summary: {
                total: tasks.length,
                processing: categorized.processing.length,
                completed: categorized.completed.length,
                failed: categorized.failed.length,
                interrupted: categorized.interrupted.length
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

const exported = {downloadInitFilesAndReturnFiles};
export default exported;