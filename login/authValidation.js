// “运行时数据校验与解析”库。用于在运行时验证和解析数据。
import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    phoneNumber: z.string().optional(),
    email: z.string().email().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    avatarUrl: z.string().optional(),
    nickname: z.string().optional(),
  }).refine((data) => data.phoneNumber || data.email, {
    message: 'Either phoneNumber or email is required',
  }),
});

export const loginSchema = z.object({
  body: z.object({
    phoneNumber: z.string().optional(),
    email: z.string().email().optional(),
    password: z.string(),
  }).refine((data) => data.phoneNumber || data.email, {
    message: 'Either phoneNumber or email is required',
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const sendVerificationCodeSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
  }),
});

export const verifyVerificationCodeSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    code: z.string().min(1, 'Verification code is required'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters long'),
    confirmNewPassword: z.string().min(6, 'Confirm password must be at least 6 characters long'),
  }).refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'New password and confirm password do not match',
    path: ['confirmNewPassword'],
  }),
});


