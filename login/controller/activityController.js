import { deductUserPoints, getUserByUserId, addUserPoints, findUserByInviteCode } from '../service/authService.js';
import { addPointActivity, getUserTotalPoints, checkUserActivityCompleted } from '../service/userPointService.js';
import {    checkAlreadyInvited, recordInviteRelation } from '../service/userInviteService.js';
import { generateShortId } from '../util/idUtil.js';
import { generateInviteCode } from '../util/inviteCodeGenerator.js';
import crypto from 'crypto';

/**
 * 扣减积分接口
option:-2;selfDefined:-3
 */
export const deductPointsOption = async (req, res) => {
    try {
        const { type } = req.body;
        const userId = req.user?.userId;

        // 参数校验
        if (!type || !userId) {
            return res.status(400).json({
                success: false,
                message: '缺少必填参数：type 和 userId'
            });
        }

        // 根据 type 确定扣减的积分数量
        let pointsToDeduct = 0;
        let activityType = '';
        let description = '';

        if (type === 'option') {
            pointsToDeduct = 2;
            activityType = 'deduct_option';
            description = '选项扣减积分';
        } else if (type === 'selfDefined') {
            pointsToDeduct = 3;
            activityType = 'deduct_self_defined';
            description = '自定义扣减积分';
        } else {
            return res.status(400).json({
                success: false,
                message: '无效的 type 参数，只支持 option 或 selfDefined'
            });
        }

        // 检查用户当前积分是否足够
        // const currentPoints = await getUserTotalPoints(userId);
        const user = await getUserByUserId(userId);
        const currentPoints = user.points;
        console.log("======================currentPoints=======================",currentPoints);
        if (currentPoints < pointsToDeduct) {
            return res.status(400).json({
                success: false,
                message: `积分不足，当前积分：${currentPoints}，需要扣减：${pointsToDeduct}`
            });
        }

        // 生成活动ID
        const activityId = generateShortId();

        try {
            await addPointActivity(
                userId,
                activityType,
                -pointsToDeduct,
                description,
                1,
                activityId
            );
            await deductUserPoints(userId, pointsToDeduct);
        } catch (error) {
            console.error('扣减积分操作失败:', error);
            throw error;
        }

        const remainingUser = await getUserByUserId(userId);
        const remainingPoints = remainingUser?.points;

        return res.status(200).json({
            success: true,
            message: '积分扣减成功',
            data: {
                deductedPoints: pointsToDeduct,
                remainingPoints: remainingPoints,
                type: type
            }
        });

    } catch (error) {
        console.error('扣减积分失败:', error);
        return res.status(500).json({
            success: false,
            message: '扣减积分失败',
            error: error.message
        });
    }
};


// 点击签到
export const signin = async (req, res) => {
    try {
        const userId = req.user?.userId;

        // 参数校验
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: '用户未登录'
            });
        }

        // 检查用户今天是否已经签到
        const hasSignedIn = await checkUserActivityCompleted(userId, 'signin');

        if (hasSignedIn) {
            return res.status(200).json({
                success: false,
                message: '今日已签到',
                data: {
                    signedIn: true,
                    points: 9
                }
            });
        }

        // 未签到，执行签到操作
        const pointsToAdd = 9;
        const activityType = 'signin';
        const description = '每日签到';
        const activityId = generateShortId();

        try {
            await addPointActivity(
                userId,
                activityType,
                pointsToAdd,
                description,
                1,
                activityId
            );
            await addUserPoints(userId, pointsToAdd);
        } catch (error) {
            console.error('签到积分操作失败:', error);
            throw error;
        }

        // 获取签到后的积分
        const user = await getUserByUserId(userId);
        const remainingPoints = user?.points;

        return res.status(200).json({
            success: true,
            message: '签到成功',
            data: {
                signedIn: true,
                pointsAdded: pointsToAdd,
                remainingPoints: remainingPoints
            }
        });

    } catch (error) {
        console.error('签到失败:', error);
        return res.status(500).json({
            success: false,
            message: '签到失败',
            error: error.message
        });
    }
};

// 看完广告
export const watchAd = async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: '用户未登录'
            });
        }

        // 直接执行观看广告操作（不限制次数）
        const pointsToAdd = 8;
        const activityType = 'watch_ad';
        const description = '观看广告';
        const activityId = generateShortId();

        try {
            await addPointActivity(
                userId,
                activityType,
                pointsToAdd,
                description,
                1,
                activityId
            );
            await addUserPoints(userId, pointsToAdd);
        } catch (error) {
            console.error('广告积分操作失败:', error);
            throw error;
        }
        // 获取观看后的积分
        const user = await getUserByUserId(userId);
        const remainingPoints = user?.points;

        return res.status(200).json({
            success: true,
            message: '观看广告成功',
            data: {
                watched: true,
                pointsAdded: pointsToAdd,
                remainingPoints: remainingPoints
            }
        });

    } catch (error) {
        console.error('观看广告失败:', error);
        return res.status(500).json({
            success: false,
            message: '观看广告失败',
            error: error.message
        });
    }
};


// 输入邀请码
// 获取我的邀请码接口
export const getMyInviteCode = async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: '用户未登录'
            });
        }

        // 获取用户信息
        const user = await getUserByUserId(userId);
        if (!user || !user.phoneNumber) {
            return res.status(400).json({
                success: false,
                message: '用户未绑定手机号'
            });
        }

        // 基于手机号生成固定邀请码
        const inviteCode = generateInviteCode(user.phoneNumber);

        // 获取邀请统计
        //const inviteCount = await getInviteSuccessCount(userId);

        return res.status(200).json({
            success: true,
            data: {
                inviteCode: inviteCode,
                phoneNumber: user.phoneNumber
            }
        });

    } catch (error) {
        console.error('获取邀请码失败:', error);
        return res.status(500).json({
            success: false,
            message: '获取邀请码失败',
            error: error.message
        });
    }
};

// 输入邀请码接口
export const useInviteCode = async (req, res) => {
    try {

        const { inviteCode } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: '用户未登录'
            });
        }

        if (!inviteCode) {
            return res.status(400).json({
                success: false,
                message: '请输入邀请码'
            });
        }

        // 检查用户是否已经使用过邀请码
        const hasUsedInviteCode = await checkUserActivityCompleted(userId, 'use_invite_code');
        if (hasUsedInviteCode) {
            return res.status(400).json({
                success: false,
                message: '您已经使用过邀请码了'
            });
        }

        // 获取当前用户信息
        const currentUser = await getUserByUserId(userId);
        if (!currentUser) {
            return res.status(400).json({
                success: false,
                message: '用户不存在'
            });
        }

        // 验证邀请码格式（7位）
        if (inviteCode.length !== 7) {
            return res.status(400).json({
                success: false,
                message: '邀请码格式不正确'
            });
        }

        const inviter = await findUserByInviteCode(inviteCode);
        if (!inviter) {
            return res.status(400).json({
                success: false,
                message: '邀请码无效'
            });
        }

        // 检查不能邀请自己
        if (inviter.userId === userId) {
            return res.status(400).json({
                success: false,
                message: '不能使用自己的邀请码'
            });
        }

        // 检查是否已经邀请过这个用户
        const alreadyInvited = await checkAlreadyInvited(inviter.id, userId);
        if (alreadyInvited) {
            return res.status(400).json({
                success: false,
                message: '已经通过此邀请码注册过了'
            });
        }

        const pointsToAdd = 30;

        // 1. 记录被邀请人的积分活动
        const userActivityId = generateShortId();
        await addPointActivity(
            userId,
            'use_invite_code',
            pointsToAdd,
            '使用邀请码',
            1,
            userActivityId
        );

        // 2. 给被邀请人加积分
        await addUserPoints(userId, pointsToAdd);

        // 3. 记录邀请人的积分活动
        const inviterActivityId = generateShortId();
        await addPointActivity(
            inviter.userId,
            'invite_success',
            pointsToAdd,
            `成功邀请用户 ${userId}`,
            1,
            inviterActivityId
        );

        // 4. 给邀请人加积分
        await addUserPoints(inviter.userId, pointsToAdd);

        // 5. 记录邀请关系
        await recordInviteRelation(inviter.userId, userId, inviteCode);

        // 获取使用后的积分
        const updatedUser = await getUserByUserId(userId);
        const remainingPoints = updatedUser?.points;

        return res.status(200).json({
            success: true,
            message: '邀请码使用成功',
            data: {
                pointsAdded: pointsToAdd,
                remainingPoints: remainingPoints,
                inviterName: inviter.nickname || '用户'
            }
        });

    } catch (error) {
        console.error('使用邀请码失败:', error);
        return res.status(500).json({
            success: false,
            message: '使用邀请码失败',
            error: error.message
        });
    }
};


// 点击加群
export const joinGroup = async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: '用户未登录'
            });
        }

        // 检查用户今天是否已经点击过加群
        const hasJoinedGroup = await checkUserActivityCompleted(userId, 'join_group');

        if (hasJoinedGroup) {
            return res.status(200).json({
                success: true,
                message: '今日已领取加群奖励',
                data: {
                    joined: true,
                    points: 20,
                    qqGroupNumber: process.env.QQ_GROUP_NUMBER || '123456789' // 从环境变量读取QQ群号
                }
            });
        }

        // 未点击，执行加群操作
        const pointsToAdd = 20;
        const activityType = 'join_group';
        const description = '点击加群';
        const activityId = generateShortId();

        try {
            await addPointActivity(
                userId,
                activityType,
                pointsToAdd,
                description,
                1,
                activityId
            );
            await addUserPoints(userId, pointsToAdd);
        } catch (error) {
            console.error('加群积分操作失败:', error);
            throw error;
        }

        // 获取加群后的积分
        const user = await getUserByUserId(userId);
        const remainingPoints = user?.points;

        return res.status(200).json({
            success: true,
            message: '加群成功',
            data: {
                joined: true,
                pointsAdded: pointsToAdd,
                remainingPoints: remainingPoints,
                qqGroupNumber: '123456789' // 返回QQ群号
            }
        });

    } catch (error) {
        console.error('加群失败:', error);
        return res.status(500).json({
            success: false,
            message: '加群失败',
            error: error.message
        });
    }
};


//============
//常用函数
//============
// 生成邀请码（手机号的7位哈希值）


export default {
    deductPointsOption,
    signin,
    watchAd,
    // getMyInviteCode,
    useInviteCode,
    joinGroup
};