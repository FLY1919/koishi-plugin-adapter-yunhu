import { Context, h, HTTP, Dict, Logger } from 'koishi'
import { FormData, File } from 'formdata-node'
import { fileFromPath } from 'formdata-node/file-from-path';
import path from 'path';
import * as mime from 'mime-types';
import fs from 'fs';
import sharp from 'sharp';

import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';

const logger = new Logger('yunhu')

//排版类型
type FormatType = "text" | "markdown" | "html"


export default class Internal {
  constructor(private http: HTTP, private token: string, private apiendpoint: string) { }

  sendMessage(payload: Dict) {
    return this.http.post(`/bot/send?token=${this.token}`, payload)
  }


 async uploadImage(image: string | Buffer | any): Promise<string> {
  const form = new FormData()
  let fileName = 'image.png';
  let mimeType = 'image/png';
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB限制

  // 添加图片压缩函数 - 确保压缩到10MB以下
  const compressImage = async (buffer: Buffer, originalMime: string): Promise<{ buffer: Buffer, mimeType: string }> => {
    const originalSize = buffer.length;
    const originalMB = (originalSize / (1024 * 1024)).toFixed(2);
    
    // 记录原始图片信息
    logger.info(`原始图片类型: ${originalMime}, 大小: ${originalMB}MB`);
    
    // 如果已经是10MB以下，直接返回（保持原格式）
    if (originalSize <= MAX_SIZE) {
      logger.info(`图片小于10MB，保持原始格式`);
      return { buffer, mimeType: originalMime };
    }

    logger.warn(`检测到大图片（${originalMB}MB），开始压缩...`);
    
    try {
      let compressBuffer = buffer;
      let compressMime = originalMime;
      let sharpInstance = sharp(buffer);

      // 动图保持原格式压缩
      const isGif = originalMime.includes('gif');
      if (!isGif) {
        // 非动图转换为JPG格式
        compressMime = 'image/jpeg';
        sharpInstance = sharpInstance.jpeg({ 
          quality: 80, 
          progressive: true,
          mozjpeg: true  // 启用更高效的JPEG压缩
        });
        logger.info(`非动图类型，转换为JPG格式压缩`);
      } else {
        logger.info(`动图类型，保持GIF格式压缩`);
      }

      // 计算缩放比例
      const targetRatio = Math.sqrt(MAX_SIZE / originalSize) * 0.95; // 留5%缓冲
      
      // 获取原始尺寸
      const metadata = await sharp(buffer).metadata();
      const originalWidth = metadata.width || 1920;
      const originalHeight = metadata.height || 1080;
      
      // 计算新尺寸
      const newWidth = Math.floor(originalWidth * targetRatio);
      const newHeight = Math.floor(originalHeight * targetRatio);
      
      logger.info(`一次性压缩尺寸: ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight}`);

      // 执行压缩
      compressBuffer = await sharpInstance
        .resize(newWidth, newHeight)
        .toBuffer();

      // 记录压缩结果
      const compressedSize = compressBuffer.length;
      const compressedMB = (compressedSize / (1024 * 1024)).toFixed(2);
      
      if (compressedSize <= MAX_SIZE) {
        logger.info(`压缩成功！大小: ${compressedMB}MB, 格式: ${compressMime}`);
        return { buffer: compressBuffer, mimeType: compressMime };
      }
      
      // 如果仍超过限制（极少数情况）
      const finalMB = (compressedSize / (1024 * 1024)).toFixed(2);
      logger.error(`压缩后图片仍超过限制 (${finalMB}MB)`);
      throw new Error(`无法将图片压缩至10MB以下`);
      
    } catch (error) {
      logger.error('图片压缩失败:', error);
      throw new Error('图片压缩失败，无法上传');
    }
  };

  // 处理图片数据
  let imageBuffer: Buffer | null = null;
  
  if (image && typeof image === 'object' && image.type === 'image') {
    fileName = image.attrs?.filename || fileName;
    mimeType = image.attrs?.mime || mimeType;
    if (image.attrs?.url) {
      const response = await this.http.get(image.attrs.url, { responseType: 'arraybuffer' });
      imageBuffer = Buffer.from(response);
    } else if (image.attrs?.data) {
      imageBuffer = image.attrs.data;
    } else {
      throw new Error('图片元素缺少 url 或 data 属性');
    }
  } else if (Buffer.isBuffer(image)) {
    imageBuffer = image;
  } else if (typeof image === 'string') {
    if (image.startsWith('data:image/')) {
      const parts = image.split(',');
      const base64Data = parts[1];
      const inferredMime = parts[0].match(/data:(.*?);base64/)?.[1];
      if (inferredMime) {
        mimeType = inferredMime;
        fileName = `image.${mime.extension(inferredMime) || 'png'}`;
      }
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else if (image.startsWith('http://') || image.startsWith('https://')) {
      const response = await this.http.get(image, { responseType: 'arraybuffer' });
      imageBuffer = Buffer.from(new Uint8Array(response));
      const urlParts = image.split('/');
      fileName = urlParts[urlParts.length - 1].split('?')[0];
      const ext = path.extname(fileName);
      if (ext) {
        const inferredMime = mime.lookup(ext);
        if (inferredMime) {
          mimeType = inferredMime;
        }
      }
      if (fileName.indexOf('.') === -1 && mime.extension(mimeType)) {
        fileName += `.${mime.extension(mimeType)}`;
      } else if (fileName.indexOf('.') === -1) {
        fileName = `image.png`;
      }
    } else { // 本地文件路径
      const resolvedPath = path.resolve(image);
      fileName = path.basename(resolvedPath);
      const inferredMime = mime.lookup(resolvedPath);
      if (inferredMime) {
        mimeType = inferredMime;
      }
      const file = await fileFromPath(resolvedPath);
      imageBuffer = Buffer.from(await file.arrayBuffer());
    }
  } else {
    throw new Error('上传图片只支持路径、URL、base64、Buffer 或 h.Element 类型');
  }

  // 记录原始图片信息
  const originalSize = imageBuffer.length;
  const originalMB = (originalSize / (1024 * 1024)).toFixed(2);
  logger.info(`准备上传图片: 类型=${mimeType}, 大小=${originalMB}MB`);
  
  // 强制压缩超过10MB的图片
  if (originalSize > MAX_SIZE) {
    const result = await compressImage(imageBuffer, mimeType);
    imageBuffer = result.buffer;
    mimeType = result.mimeType;
    
    // 更新文件名为正确格式
    if (mimeType === 'image/jpeg') {
      fileName = fileName.replace(/\.[^.]+$/, '.jpg');
    } else if (mimeType.includes('gif')) {
      fileName = fileName.replace(/\.[^.]+$/, '.gif');
    }
  }

  // 创建文件对象
  const file = new File([imageBuffer], fileName, { type: mimeType });
  
  // 最终大小验证
  if (file.size > MAX_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`压缩失败！图片大小${sizeMB}MB仍超过10MB限制`);
  }
  
  // 记录最终上传信息
  const finalMB = (file.size / (1024 * 1024)).toFixed(2);
  logger.info(`最终上传图片: 类型=${mimeType}, 大小=${finalMB}MB`);
  
  form.append('image', file);

  // 上传逻辑保持不变
  try {
    const uploadUrl = `${this.apiendpoint}/image/upload?token=${this.token}`;

    const axiosConfig: AxiosRequestConfig = {
      headers: {},
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    };

    const response = await axios.post(uploadUrl, form, axiosConfig);
    const res = response.data;

    if (res.code !== 1) {
      throw new Error(`图片上传失败：${res.msg}，响应码${res.code}`);
    }
    
    logger.info(`图片上传成功: key=${res.data.imageKey}`);
    return res.data.imageKey;

  } catch (error: any) {
    logger.error(`图片上传请求失败: ${error.message}`);
    if (axios.isAxiosError(error) && error.response) {
      logger.error(`Axios 响应状态: ${error.response.status}`);
      logger.error(`Axios 响应体:`, error.response.data);
      logger.error(`Axios 响应头:`, error.response.headers);
    }
    for (const [key, value] of form.entries()) {
      logger.info(key, value);
    }
    throw new Error(`图片上传失败：${error.message}`);
  }
}
  async uploadVideo(video: string | Buffer | any): Promise<string> {
    const form = new FormData();
    let fileName = 'video.mp4';
    let mimeType = 'video/mp4';

    if (video && typeof video === 'object' && video.type === 'video') {
      fileName = video.attrs?.filename || fileName;
      mimeType = video.attrs?.mime || mimeType;
      if (video.attrs?.url) {
        const response = await this.http.get(video.attrs.url, { responseType: 'arraybuffer' });
        const file = new File([Buffer.from(response)], fileName, { type: mimeType });
        form.append('video', file);
      } else if (video.attrs?.data) {
        const file = new File([video.attrs.data], fileName, { type: mimeType });
        form.append('video', file);
      } else {
        throw new Error('视频元素缺少 url 或 data 属性');
      }
    } else if (Buffer.isBuffer(video)) {
      const file = new File([video], fileName, { type: mimeType });
      form.append('video', file);
    } else if (typeof video === 'string') {
      if (video.startsWith('data:video/')) {
        const parts = video.split(',');
        const base64Data = parts[1];
        const inferredMime = parts[0].match(/data:(.*?);base64/)?.[1] || 'video/mp4';
        if (inferredMime) {
          mimeType = inferredMime;
          fileName = `video.${mime.extension(inferredMime) || 'mp4'}`;
        }
        const buffer = Buffer.from(base64Data, 'base64');
        const file = new File([buffer], fileName, { type: mimeType });
        form.append('video', file);
      } else if (video.startsWith('http://') || video.startsWith('https://')) {
        const response = await this.http.get(video, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(new Uint8Array(response));
        const urlParts = video.split('/');
        fileName = urlParts[urlParts.length - 1].split('?')[0];
        if (fileName.indexOf('.') === -1) {
          fileName += '.mp4';
        }
        const file = new File([buffer], fileName, { type: mimeType });
        form.append('video', file);
      } else {
        const file = await fileFromPath(path.resolve(video));
        form.append('video', file);
      }
    } else {
      throw new Error('上传视频只支持路径、URL、base64、Buffer 或 h.Element 类型');
    }

    try {
      for (const [key, value] of form.entries()) {
        // logger.info('视频字段:', key);
        // logger.info('视频值:', value);
      }
      const uploadUrl = `${this.apiendpoint}/video/upload?token=${this.token}`;
      // logger.info(`尝试使用 axios 发送视频请求到: ${uploadUrl}`);

      const axiosConfig: AxiosRequestConfig = {
        headers: {},
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      };

      const response = await axios.post(uploadUrl, form, axiosConfig);
      const res = response.data;

      if (res.code !== 1) {
        throw new Error(`视频上传失败：${res.msg}，响应码${res.code}`);
      }
      return res.data.videoKey;

    } catch (error: any) {
      // logger.error(`视频上传请求失败: ${error.message}`);
      if (axios.isAxiosError(error) && error.response) {
        // logger.error(`Axios 响应状态: ${error.response.status}`);
        // logger.error(`Axios 响应体:`, error.response.data);
      }
      for (const [key, value] of form.entries()) {
        // logger.info(key, value);
      }
      throw new Error(`视频上传失败：${error.message}`);
    }
  }

  async uploadFile(fileData: string | Buffer | any): Promise<string> {
    const form = new FormData();
    let fileName = 'file.dat';
    let mimeType = 'application/octet-stream';

    if (fileData && typeof fileData === 'object' && fileData.type === 'file') {
      fileName = fileData.attrs?.filename || fileName;
      mimeType = fileData.attrs?.mime || mimeType;
      if (fileData.attrs?.url) {
        const response = await this.http.get(fileData.attrs.url, { responseType: 'arraybuffer' });
        const file = new File([Buffer.from(response)], fileName, { type: mimeType });
        form.append('file', file);
      } else if (fileData.attrs?.data) {
        const file = new File([fileData.attrs.data], fileName, { type: mimeType });
        form.append('file', file);
      } else {
        throw new Error('文件元素缺少 url 或 data 属性');
      }
    } else if (Buffer.isBuffer(fileData)) {
      const file = new File([fileData], fileName, { type: mimeType });
      form.append('file', file);
    } else if (typeof fileData === 'string') {
      if (fileData.startsWith('data:')) {
        const parts = fileData.split(',');
        const base64Data = parts[1];
        const inferredMime = parts[0].match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
        if (inferredMime) {
          mimeType = inferredMime;
          fileName = `file.${mime.extension(inferredMime) || 'dat'}`;
        }
        const buffer = Buffer.from(base64Data, 'base64');
        const file = new File([buffer], fileName, { type: mimeType });
        form.append('file', file);
      } else if (fileData.startsWith('http://') || fileData.startsWith('https://')) {
        const response = await this.http.get(fileData, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(new Uint8Array(response));
        const urlParts = fileData.split('/');
        fileName = urlParts[urlParts.length - 1].split('?')[0];
        if (fileName.indexOf('.') === -1) {
          fileName += '.dat';
        }
        const file = new File([buffer], fileName, { type: mimeType });
        form.append('file', file);
      } else {
        const file = await fileFromPath(path.resolve(fileData));
        form.append('file', file);
      }
    } else {
      throw new Error('上传文件只支持路径、URL、base64、Buffer 或 h.Element 类型');
    }

    try {
      for (const [key, value] of form.entries()) {
        // logger.info('文件字段:', key);
        // logger.info('文件值:', value);
      }

      const uploadUrl = `${this.apiendpoint}/file/upload?token=${this.token}`;
      // logger.info(`尝试使用 axios 发送文件请求到: ${uploadUrl}`);

      const axiosConfig: AxiosRequestConfig = {
        headers: {},
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      };

      const response = await axios.post(uploadUrl, form, axiosConfig);
      const res = response.data;

      if (res.code !== 1) {
        throw new Error(`文件上传失败：${res.msg}，响应码${res.code}`);
      }
      return res.data.fileKey;

    } catch (error: any) {
      // logger.error(`文件上传请求失败: ${error.message}`);
      if (axios.isAxiosError(error) && error.response) {
        // logger.error(`Axios 响应状态: ${error.response.status}`);
        // logger.error(`Axios 响应体:`, error.response.data);
      }
      for (const [key, value] of form.entries()) {
        // logger.info(key, value);
      }
      throw new Error(`文件上传失败：${error.message}`);
    }
  }

  async deleteMessage(chatId: string, msgId: string) {
    const chatType = chatId.split(':')[1];
    const payload = { msgId, chatId, chatType }
    logger.info(`撤回消息: ${JSON.stringify(payload)}`);
    return this.http.post(`/bot/recall?token=${this.token}`, payload)
  }


  async setBoard(chatId: string, contentType: FormatType, content: string, options: { memberId?: string, expireTime?: number } = {}) {
    const chatType = chatId.split(':')[1];
    const payload = { chatId, chatType, contentType, content,
      ...(options.memberId !== undefined && {memberId:options.memberId}),
      ...(options.expireTime !== undefined && {memberId:options.expireTime})
    }
    
    return this.http.post(`/bot/board?token=${this.token}`, payload)
  }

  async setAllBoard(chatId: string, contentType: FormatType, content: string, options: {expireTime?: number } = {}) {
    const chatType = chatId.split(':')[1];
    const payload = { chatId, chatType, contentType, content,
      ...(options.expireTime !== undefined && {memberId:options.expireTime})
    }
    return this.http.post(`/bot/board-all?token=${this.token}`, payload)
  }
}
