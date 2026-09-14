import React from 'react'
import { UploadCloud } from 'lucide-react'

export interface AttachmentDropzoneProps {
  isActive: boolean
}

export const AttachmentDropzone: React.FC<AttachmentDropzoneProps> = ({ isActive }) => {
  if (!isActive) return null

  return (
    <div className="aui-dropzone-overlay" role="region" aria-label="拖拽文件上传区">
      <div className="aui-dropzone-content">
        <div className="aui-dropzone-icon">
          <UploadCloud size={32} />
        </div>
        <p className="aui-dropzone-title">松开鼠标添加文件</p>
        <p className="aui-dropzone-subtitle">支持 JPG、PNG、GIF、WebP 格式图片</p>
      </div>
    </div>
  )
}
