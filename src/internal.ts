import { Context, h, HTTP, Dict, Logger } from 'koishi'
import { FormData, File } from 'formdata-node'
import { fileFromPath } from 'formdata-node/file-from-path';
import path from 'path';
import * as mime from 'mime-types';
import fs from 'fs'; 

import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';

const logger = new Logger('yunhu')

export default class Internal {
  constructor(private http: HTTP, private token: string, private apiendpoint: string) { }

  sendMessage(payload: Dict) {
    return this.http.post(`/bot/send?token=${this.token}`, payload)
  }

  async uploadImage(image: string | Buffer | any): Promise<string> {
    const form = new FormData()
    let fileName = 'image.png'; 
    let mimeType = 'image/png'; 

    if (image && typeof image === 'object' && image.type === 'image') {
      fileName = image.attrs?.filename || fileName;
      mimeType = image.attrs?.mime || mimeType;
      if (image.attrs?.url) {
        const response = await this.http.get(image.attrs.url, { responseType: 'arraybuffer' });
        const file = new File([Buffer.from(response)], fileName, { type: mimeType });
        form.append('image', file);
      } else if (image.attrs?.data) {
        const file = new File([image.attrs.data], fileName, { type: mimeType });
        form.append('image', file);
      } else {
        throw new Error('图片元素缺少 url 或 data 属性');
      }
    } else if (Buffer.isBuffer(image)) {
      const file = new File([image], fileName, { type: mimeType });
      form.append('image', file);
    } else if (typeof image === 'string') {
      if (image.startsWith('data:image/')) {
        const parts = image.split(',');
        const base64Data = parts[1];
        const inferredMime = parts[0].match(/data:(.*?);base64/)?.[1];
        if (inferredMime) {
          mimeType = inferredMime;
          fileName = `image.${mime.extension(inferredMime) || 'png'}`;
        }
        const buffer = Buffer.from(base64Data, 'base64');
        const file = new File([buffer], fileName, { type: mimeType });
        form.append('image', file);
      } else if (image.startsWith('http://') || image.startsWith('https://')) {
        const response = await this.http.get(image, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(new Uint8Array(response));
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
        const file = new File([buffer], fileName, { type: mimeType });
        form.append('image', file);
      } else { // 本地文件路径
        const resolvedPath = path.resolve(image);
        fileName = path.basename(resolvedPath);
        const inferredMime = mime.lookup(resolvedPath);
        if (inferredMime) {
          mimeType = inferredMime;
        }
        const file = await fileFromPath(resolvedPath);
        form.append('image', file);
      }
    } else {
      throw new Error('上传图片只支持路径、URL、base64、Buffer 或 h.Element 类型');
    }
    try {
      for (const [key, value] of form.entries()) {
        // logger.info('图片字段:', key);
        // logger.info('图片值:', value);
      }

      const uploadUrl = `${this.apiendpoint}/image/upload?token=${this.token}`;
      // logger.info(`尝试使用 axios 发送图片请求到: ${uploadUrl}`);

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
}