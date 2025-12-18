import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  getOrderByOutTradeNo,
  validateOrderAmount,
  isOrderPaid,
  updateOrderToPaid
} from './service/gameOrdersService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// ====================  配置信息===================
const config = {
  apiv3Key: 'iZl1yniv4ZMeXIVdTnNUQRwtcGDCoF3E',
  wechatPayCertPath: path.join(__dirname, 'certs/pub_key.pem'),
  wechatPayPublicKeySerial: 'PUB_KEY_ID_0117327352542025111900291582001201', // 替换为你的真实序列号
  timestampExpire: 300,
  db: null,
};

if (!config.apiv3Key) {
  console.warn('[wechat-notify] WX_API_V3_KEY 未设置，无法解密回调数据');
}

let wechatPublicKey = null;
try {
  wechatPublicKey = fs.readFileSync(config.wechatPayCertPath, 'utf8');
} catch (err) {
  console.warn(`[wechat-notify] 未能读取微信平台公钥：${err.message}`);
}

function verifyWechatSignature({ timestamp, nonce, signature }, bodyStr) {
  if (!wechatPublicKey) {
    throw new Error('缺少微信支付平台公钥，无法校验签名');
  }
  const signStr = `${timestamp}\n${nonce}\n${bodyStr}\n`;
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signStr, 'utf8');
  const verified = verifier.verify(wechatPublicKey, signature, 'base64');
  if (!verified) {
    throw new Error('签名验证失败');
  }
}

function decryptWechatResource(resource) {
  if (!config.apiv3Key) {
    throw new Error('未配置 WX_API_V3_KEY，无法解密');
  }
  const { ciphertext, nonce, associated_data: associatedData } = resource || {};
  if (!ciphertext || !nonce) {
    throw new Error('回调数据缺少必要的解密字段');
  }
  const cipherBuffer = Buffer.from(ciphertext, 'base64');
  const authTag = cipherBuffer.slice(cipherBuffer.length - 16);
  const data = cipherBuffer.slice(0, cipherBuffer.length - 16);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(config.apiv3Key, 'utf8'),
    Buffer.from(nonce, 'utf8')
  );
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  }
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  const decryptedStr = decrypted.toString('utf8');
  return JSON.parse(decryptedStr);
}

// ==================== 接收微信的原始请求数据 ===================
router.use(express.raw({ type: '*/*' }));

// ==================== 3. 回调接口（notify_url就是这个地址）===================
// 地址：https://your-domain.com/api/wechat/notify（必须是HTTPS）
router.post('/notify', express.raw({ type: '*/*', limit: '256kb' }) , async (req, res) => {
  try {
    console.log('========== 收到微信支付回调 ==========');
    const headers = req.headers ?? {};
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      console.error('请求体不是 Buffer，确认已配置 express.raw 中间件');
      return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[请求体无效]]></return_msg></xml>');
    }

    const bodyStr = rawBody.toString('utf8');
    console.log('回调请求头：', {
      'wechatpay-serial': headers['wechatpay-serial'],
      'wechatpay-nonce': headers['wechatpay-nonce'],
      'wechatpay-timestamp': headers['wechatpay-timestamp'],
      'wechatpay-signature': headers['wechatpay-signature'] ? '存在' : '不存在',
      'x-test-mode': headers['x-test-mode'] || '未开启'
    });

    let payResult;

    if (headers['x-test-mode'] === 'true') {
      try {
        payResult = JSON.parse(bodyStr);
        console.log('【测试模式】收到自定义 JSON 回调：', payResult);
      } catch (err) {
        console.error('测试模式 JSON 解析失败：', err);
        return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[JSON解析失败]]></return_msg></xml>');
      }
    } else {
      const nonce = headers['wechatpay-nonce'];
      const timestamp = headers['wechatpay-timestamp'];
      const signature = headers['wechatpay-signature'];
      if (!nonce || !timestamp || !signature) {
        console.error('回调信息缺少必要字段');
        return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[缺少必要字段]]></return_msg></xml>');
      }

      try {
        verifyWechatSignature({ nonce, timestamp, signature }, bodyStr);
      } catch (verifyErr) {
        console.error(verifyErr.message);
        return res.send(`<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[${verifyErr.message}]]></return_msg></xml>`);
      }

      let bodyJson;
      try {
        bodyJson = JSON.parse(bodyStr);
      } catch (err) {
        console.error('回调 JSON 解析失败：', err);
        return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[JSON解析失败]]></return_msg></xml>');
      }

      try {
        payResult = decryptWechatResource(bodyJson.resource);
        console.log('解密后的支付回调信息：', payResult);
      } catch (decryptErr) {
        console.error('回调数据解密失败：', decryptErr);
        return res.send(`<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[${decryptErr.message}]]></return_msg></xml>`);
      }
    }

    // --------------------------------------------
    const outTradeNo = payResult.out_trade_no; // 商户订单号（比如 OD20251120001）
    const transactionId = payResult.transaction_id; // 微信支付订单号（唯一）
    const totalFee = payResult.amount.payer_total; // 支付金额（单位：分，比如100=1元）
    const tradeState = payResult.trade_state; // 支付状态（SUCCESS=成功，FAIL=失败）
    const payerOpenid = payResult.payer?.openid; // 支付用户的openid

    console.log(`订单 ${outTradeNo} 支付状态：${tradeState}，金额：${totalFee}分`);

    // ---------------------- 第五步：执行业务逻辑（比如更新订单状态）----------------------
    if (tradeState === 'SUCCESS') {
      console.log("---------------------回调成功------------------");
      // 1. 查数据库，确认outTradeNo是你系统中存在的未支付订单
      // 2. 验证totalFee和订单金额一致
      // 3. 更新订单状态为"已支付"，记录transactionId
      if (tradeState === 'SUCCESS') {
        // 1. 查询订单
        const order = await getOrderByOutTradeNo(outTradeNo);
        console.log("===============================order",order);
        console.log('订单信息：', order);
        if (!order) {
          console.error(`订单不存在: ${outTradeNo}`);
          return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[订单不存在]]></return_msg></xml>');
        }

        // 2. 检查是否已支付
        if (order.payment_status === 'paid') {
          console.log(`订单已处理: ${outTradeNo}`);
          return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
        }

        // 3. 验证金额
        if (order.total_amount !== totalFee) {
          console.error(`订单金额不匹配, 订单=${order.total_amount}, 回调=${totalFee}`);
          return res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[金额不匹配]]></return_msg></xml>');
        }

        // 4. 更新订单状态同时更新用户积分数额
        await updateOrderToPaid(outTradeNo, {
          wechat_transaction_id: transactionId,
          wechat_openid: payerOpenid || null,
          notify_data: payResult
        });

        // 5. TODO: 给用户发货/发游戏权限
        console.log(`订单 ${outTradeNo} 已标记为已支付`);
      }
    }

    // ----------------------向微信返回成功响应----------------------
    // 微信要求：处理完回调后，必须返回这个XML格式，否则会反复重试（最多重试24小时）
    res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');

  } catch (error) {
    console.error('回调处理失败：', error);
    console.error('错误堆栈：', error.stack);
    // 处理失败也要返回FAIL，微信会重试
    res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[处理失败]]></return_msg></xml>');
  }
});

export default router;
