import {
  incrementPvCount,
  incrementUvCountWithDeduplication,
  incrementConversionCount,
  incrementConversionCountWithDeduplication,
  incrementLikeCountWithDeduplication,
  initGameStats,
  getGameStats,
  removeUserIdFromConversionSet
} from '../service/gamesStatusService.js';
import {
  addReaction,
  removeReaction,
  checkUserReaction,
  updateGameReactionCounts
} from '../service/gameLikeService.js';

import { getTotalStatisticsByFileId } from '../service/gameStatisticService.js';
import { getGameFilesByFileId } from '../service/gamesService.js';
import { getUserById, getUserByUserId } from '../service/authService.js';
import { lte } from 'zod';
/**
 * 页面访问接口 - 同时增加 PV 和 UV
 * 当用户点击/访问游戏详情页时调用
 * POST /api/auth/games-stats/visit
 * 请求体: { fileId: "xxx", userId: "xxx" }
 */
export async function incrementVisit(req, res) {
  try {
    const { fileId, userId } = req.body || req.params || {};
    
    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：fileId'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：userId'
      });
    }

    // 如果统计数据不存在，先初始化
    const existingStats = await getGameStats(fileId);
    if (!existingStats) {
      await initGameStats(fileId);
    }

    // 同时增加 PV 和 UV 统计
    const [newPvCount, uvResult] = await Promise.all([
      incrementPvCount(fileId, 1),
      incrementUvCountWithDeduplication(fileId, userId)
    ]);
    
    // 从转化 Set 中删除该 userId（如果存在）
    try {
      await removeUserIdFromConversionSet(fileId, userId);
    } catch (err) {
      // 如果删除失败，记录错误但不影响主流程
      console.error('删除转化 Set 中的 userId 失败:', err);
    }
    
    return res.json({
      success: true,
      data: {
        fileId,
        pvCount: newPvCount,
        uvCount: uvResult.uvCount,
        isNewVisitor: uvResult.incremented,
        message: uvResult.incremented ? '新访客，PV 和 UV 已增加' : '今日已访问过，PV 已增加，UV 未增加'
      }
    });
  } catch (err) {
    console.error('gamesStatusController.incrementVisit error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || '增加访问统计失败'
    });
  }
}

/**
 * 开始游戏接口 - 增加转化统计（Conversion Count，带去重逻辑）
 * 当用户点击"开始游戏"按钮时调用
 * POST /api/auth/games-stats/conversion
 * 请求体: { fileId: "xxx", userId: "xxx" }
 */
export async function incrementConversion(req, res) {
  try {
    const { fileId, userId } = req.body || req.params || {};
    
    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：fileId'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：userId'
      });
    }

    // 如果统计数据不存在，先初始化
    const existingStats = await getGameStats(fileId);
    if (!existingStats) {
      await initGameStats(fileId);
    }

    // 增加转化统计（带去重逻辑，一个用户只能转化一次）
    const conversionResult = await incrementConversionCountWithDeduplication(fileId, userId);
    
    return res.json({
      success: true,
      data: {
        fileId,
        conversionCount: conversionResult.conversionCount,
        isNewConversion: conversionResult.incremented,
        message: conversionResult.incremented ? '转化统计已增加' : '该用户已转化过，转化数未增加'
      }
    });
  } catch (err) {
    console.error('gamesStatusController.incrementConversion error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || '增加转化统计失败'
    });
  }
}

/**
 * 点赞/取消点赞接口 - 切换点赞状态（带去重逻辑）
 * 如果用户已点赞，则取消点赞（点赞数减1）
 * 如果用户未点赞，则点赞（点赞数加1）
 * POST /api/auth/games-stats/like
 * 请求体: { fileId: "xxx", userId: "xxx" }
 */
export async function incrementLike(req, res) {
  try {
    const { fileId } = req.body || req.params || {};
    const userId = req.user?.userId;
    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：fileId'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：userId'
      });
    }

    // 如果统计数据不存在，先初始化
    const existingStats = await getGameStats(fileId);
    if (!existingStats) {
      await initGameStats(fileId);
    }

    // 检查用户当前的点赞状态
    const currentReaction = await checkUserReaction(fileId, userId);
    let isLiked = false;
    
    if (currentReaction && currentReaction.reaction === 1) {
      // 用户已点赞，取消点赞
      await removeReaction(fileId, userId);
      isLiked = false;
    } else {
      // 用户未点赞或之前是不喜欢，添加点赞
      await addReaction(fileId, userId, 1); // 1 表示喜欢
      isLiked = true;
    }

    // 更新 games 表中的点赞统计
    await updateGameReactionCounts(fileId);
    
    // 同时更新原有的统计系统
    const likeResult = await incrementLikeCountWithDeduplication(fileId, userId);
    
    return res.json({
      success: true,
      data: {
        fileId,
        likeCount: likeResult.likeCount,
        isLiked: isLiked,
        message: isLiked ? '点赞成功' : '已取消点赞'
      }
    });
  } catch (err) {
    console.error('gamesStatusController.incrementLike error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || '增加点赞统计失败'
    });
  }
}


/**
 * 获取游戏数据接口
 * GET /api/auth/games-stats/data/:fileId
 * 通过fileId获取游戏数据:pv likeCount rating_avg，复用了getGameFilesByFileId方法
 */
export async function getGameData(req, res) {
  try {
    const { fileId } = req.params;
    
    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：fileId'
      });
    }

    const gameStatsData = await getTotalStatisticsByFileId(fileId);
    const gameBasicData = await getGameFilesByFileId(fileId);
    
    if (!gameStatsData || !gameBasicData) {
      return res.status(404).json({
        success: false,
        message: '游戏数据不存在'
      });
    }
    
    return res.json({
      success: true,
      data: {
        pv: gameStatsData.total_pv_count,
        likeCount: gameStatsData.total_like_count,
        ratingAvg: gameBasicData.ratingAvg
      }
    });
  } catch (err) {
    console.error('gamesStatusController.getGameData error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || '获取游戏数据失败'
    });
  }
}

// 数据的总统计量接口
export async function getGameDataByUser (req, res) {
  // 传入userId
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: '缺少 userId'
    });
  }
 // 通过userId查询到拥有的fileId(查询user表的fileIds字段获取)
 // 查询user表的fileIds字段获取
  const user = await getUserByUserId(userId);
  if (!user) {
    return res.status(400).json({
      success: false,
      message: '用户不存在'
    });
  }
  const fileIds = user.fileIds;
  if (!fileIds || fileIds.length === 0) {
    return res.json({ success: true, data: [] });
  }
  let fileIdsArray = [];
  fileIdsArray = JSON.parse(fileIds);
  const fieldCount = fileIdsArray.length;
 // 来一个for循环遍历fileIds,调用getGameData获取单个file的数据
 const gameDataList = [];
  for (const fileId of fileIdsArray) {
    try {
      const gameStatsData = await getTotalStatisticsByFileId(fileId);
    //  console.log("-------------------------------------------", gameStatsData);
      // const gameBasicData = await getGameFilesByFileId(fileId);
       //console.log("-------------------------------------------", gameStatsData);
      if (gameStatsData) {
        gameDataList.push({
          pv: gameStatsData.total_pv_count,
          uv: gameStatsData.total_uv_count,
          likeCount: gameStatsData.total_like_count,
          totalAmount:gameStatsData.total_amount
        });
      }
    } catch (err) {
      console.error(`获取 fileId ${fileId} 的数据失败:`, err);
      // 继续处理下一个 fileId
    }
  }
  const totalStats = gameDataList.reduce((acc, item) => {
    //console.log("-----------------------totalAmount-----------------------",item.totalAmount);
    return {
      pv: acc.pv + (item.pv || 0),
      uv: acc.uv + (item.uv || 0),
      likeCount: acc.likeCount + (item.likeCount || 0),
      Count: fieldCount,
      totalAmount: acc.totalAmount + item.totalAmount
    };
  }, { pv: 0, uv: 0, likeCount: 0, totalAmount: 0 });
  return res.json({ success: true, data: totalStats });
}

export default {
  incrementVisit,
  incrementConversion,
  incrementLike,
  getGameData,
  getGameDataByUser
};

