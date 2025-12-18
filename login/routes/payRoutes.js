import { Router } from 'express';
import WxPay from 'wechatpay-node-v3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import {
    createOrder,
    getOrderByOutTradeNo,
    updateOrderStatus,
    updateOrderQrUrl,
    getPendingOrderByUserId
} from '../service/gameOrdersService.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CERTIFICATE_DIR = path.resolve(__dirname, '.././certs');

const WX_PAY_CONFIG = {
    appid: process.env.WX_APPID,
    mchid: process.env.WX_MCHID,
    publicKey: fs.readFileSync(path.join(CERTIFICATE_DIR, 'apiclient_cert.pem')),
    privateKey: fs.readFileSync(path.join(CERTIFICATE_DIR, 'apiclient_key.pem')),
    serial_no: process.env.WX_SERIAL_NO,
    key: process.env.WX_API_V3_KEY
};

let payClient = null;
try {
    payClient = new WxPay(WX_PAY_CONFIG);
    console.log('[wechat-pay] 客户端初始化成功');
} catch (error) {
    console.error('[wechat-pay] 客户端初始化失败:', error.message);
}

async function createNativeTransaction() {
    if (!payClient) {
        throw new Error('微信支付客户端未初始化完成');
    }

    const params = {
        description: '测试商品-原生扫码支付',
        out_trade_no: `native_${Date.now()}`,
        notify_url: 'https://kurangames.com/api/wechat/notify',
        amount: { total: 1 },
        scene_info: { payer_client_ip: '127.0.0.1' }
    };
    console.log("=========params", params);
    const result = await payClient.transactions_native(params);
    console.log("--------------------", result);
    console.log('[wechat-pay] 原生支付订单创建成功:', {
        outTradeNo: params.out_trade_no,
        codeUrl: result.data.code_url
    });
    return { ...result, out_trade_no: params.out_trade_no };
}

router.post('/create-native', async (req, res) => {
    try {
        // 1. 正确解析参数（前端传 { amount: 99, type: 'diamond' }，type可选，标识充值类型）
        const { amount } = req.body; // type：diamond/会员/member等
        const userId = req.user?.userId;
        
        // 2. 完善参数校验
        if (!userId || amount === undefined || amount === null) {
            return res.status(400).json({ code: 400, message: '缺少必要参数（userId/amount）' });
        }
        // 解析金额为数字（防止前端传字符串）
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount)) {
            throw new Error('支付金额必须是有效数字');
        }
        // 充值金额上下限管控（根据业务调整，比如1元~1000元）
        const totalAmount = Math.round(parsedAmount * 100);
        const MIN_AMOUNT = 1 * 10; // 1角（分）
        const MAX_AMOUNT = 1000 * 100; // 1000元（分）
        if (totalAmount < MIN_AMOUNT || totalAmount > MAX_AMOUNT) {
            return res.status(400).json({ 
                code: 400, 
                message: `充值金额错误` 
            });
        }

        // 3. 幂等性校验：同一用户1分钟内只能有1个待支付订单（防止重复支付）
        const existingOrder = await getPendingOrderByUserId(userId);
        if (existingOrder) {
            return res.json({
                code: 200,
                message: '已存在待支付充值订单',
                data: {
                    outTradeNo: existingOrder.out_trade_no,
                    qrDataUrl: existingOrder. qr_data_url,
                }
            });
        }

        // 4. 生成订单号
        const outTradeNo = generateOrderNo();

        // 5. 调整顺序：先创建本地待支付订单，再调用微信接口（数据一致性）
        const qrDataUrlTemp = '';
        await createOrder({
            out_trade_no: outTradeNo,
            user_id: userId,
            description: `游戏充值`, // 补充充值类型，方便对账
            total_amount: totalAmount,
            status: 'pending', // 新增订单状态：待支付
            qr_data_url: qrDataUrlTemp,
            created_at: new Date()
        });

        // 6. 调用微信接口
        const params = {
            description: `游戏充值`, // 微信账单显示充值类型，方便对账
            out_trade_no: outTradeNo,
            notify_url: 'https://kurangames.com/api/wechat/notify',
            amount: { total: totalAmount },
            scene_info: { payer_client_ip: req.ip || '127.0.0.1' }
        };
        const result = await payClient.transactions_native(params);
        console.log("==========================微信调用结果",result);
        console.log("===========================result.status",result.status);
        if (result.status !== 200) {
            // 微信接口失败，更新订单状态为创建失败
            await updateOrderStatus(outTradeNo, 'failed', result.data?.message);
            throw new Error(`微信支付单创建失败：${result.data?.message}`);
        }
        const codeUrl = result.data?.code_url;
        if (!codeUrl) {
            await updateOrderStatus(outTradeNo, 'failed', '微信返回缺少code_url');
            throw new Error(`微信返回异常：${JSON.stringify(result.data)}`);
        }

        // 7. 生成二维码并更新订单
        const qrDataUrl = await QRCode.toDataURL(codeUrl);
        await updateOrderQrUrl(outTradeNo, qrDataUrl);

        // 8. 返回结果
        return res.json({
            code: 200,
            message: '充值订单创建成功',
            data: { outTradeNo, qrDataUrl }
        });

    } catch (error) {
        console.error('[wechat-pay] create-native error:', error);
        return res.status(500).json({
            code: 500,
            message: '支付订单创建失败',
            error: process.env.NODE_ENV === 'production' ? '系统异常，请稍后重试' : error.message
        });
    }
});

// 生成二维码图片接口
router.get('/qrcode', async (req, res) => {
    try {
        const { codeUrl } = req.query;
        if (!codeUrl) {
            return res.status(400).json({
                code: 400,
                message: '缺少 codeUrl 参数'
            });
        }

        // 生成二维码的 Data URL（base64 格式）
        const qrDataUrl = await QRCode.toDataURL(codeUrl);

        res.json({
            code: 200,
            message: '二维码生成成功',
            data: {
                qrCode: qrDataUrl
            }
        });
    } catch (error) {
        console.error('[wechat-pay] qrcode error:', error);
        res.status(500).json({
            code: 500,
            message: '二维码生成失败',
            error: error.message
        });
    }
});

// 订单查询
router.get('/query', async (req, res) => {
    try {
        if (!payClient) {
            return res.status(503).json({
                code: 503,
                message: '微信支付客户端未初始化'
            });
        }

        const { outTradeNo, transactionId } = req.query;
        if (!outTradeNo && !transactionId) {
            return res.status(400).json({
                code: 400,
                message: '必须提供 outTradeNo 或 transactionId'
            });
        }

        // const queryParams = transactionId
        //     ? { transaction_id: transactionId }
        //     : { out_trade_no: outTradeNo };

        // const result = await payClient.query(queryParams);
        // console.log("---------------------------", result.data.payer?.openid);
        // console.log("---------------------------", result.data.trade_state_desc);

        // 数据库插入
        // await updateOrderToPaid(outTradeNo, {
        //     wechat_transaction_id: result.data.trade_state_desc,
        //     wechat_openid: result.data.payer?.openid || null,
        //     notify_data: result.data
        // });
        //改为查询数据库
        const order = await getOrderByOutTradeNo(outTradeNo);
        console.log('订单信息：', order);
        if (!order) {
            return res.status(404).json({
                code: 404,
                message: '订单不存在'
            });
        }
        const paymentStatus = order.payment_status;
       // console.log('订单信息：', paymentStatus);

        return res.json({
            code: 200,
            message: '查询成功',
            data: paymentStatus
        });
    } catch (error) {
        console.error('[wechat-pay] query error:', error);
        return res.status(500).json({
            code: 500,
            message: '订单查询失败',
            error: error.message
        });
    }
});

/**
 * 生成支付订单号
 * 规则：前缀 + 时间戳(到秒) + 6位随机数
 * 示例：G20250203123045 839274
 *
 * @returns {string} 订单号
 */
function generateOrderNo() {
    // 当前时间：YYYYMMDDHHmmss
    const now = new Date();

    const pad = (n) => n.toString().padStart(2, '0');

    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());
    const hour = pad(now.getHours());
    const minute = pad(now.getMinutes());
    const second = pad(now.getSeconds());

    const timeStr = `${year}${month}${day}${hour}${minute}${second}`;

    // 6 位随机数（000000 - 999999）
    const random = Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, '0');

    // 最终订单号：例如 G20250203123045839274
    const orderNo = `${timeStr}${random}`;

    return orderNo;
}

export default router;

