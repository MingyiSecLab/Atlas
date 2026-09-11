import { ModelIcon, ProviderIcon } from '@lobehub/icons'
import { Sparkles } from 'lucide-react'
import React, { useMemo } from 'react'
import { extractModelPureName, normalizeProviderKey } from './model-brand-utils'

export interface ProviderBrandIconProps {
  providerId: string
  name?: string
  url?: string
  models?: string[]
  size?: number
  type?: 'avatar' | 'mono' | 'color' | 'combine'
  shape?: 'square' | 'circle'
  className?: string
  style?: React.CSSProperties
}

export const ProviderBrandIcon: React.FC<ProviderBrandIconProps> = ({
  providerId,
  url,
  models,
  size = 32,
  type = 'avatar',
  shape = 'square',
  className,
  style
}) => {
  const resolvedKey = useMemo(
    () => normalizeProviderKey(providerId, url, models),
    [providerId, url, models]
  )

  return (
    <ProviderIcon
      provider={resolvedKey}
      size={size}
      type={type}
      shape={shape}
      className={className}
      style={style}
    />
  )
}

export interface ModelBrandIconProps {
  model?: string
  size?: number
  type?: 'avatar' | 'mono' | 'color' | 'combine'
  shape?: 'square' | 'circle'
  className?: string
  style?: React.CSSProperties
}

export const ModelBrandIcon: React.FC<ModelBrandIconProps> = ({
  model,
  size = 14,
  type = 'color',
  shape = 'square',
  className,
  style
}) => {
  const modelName = useMemo(() => {
    if (!model) return ''
    return extractModelPureName(model)
  }, [model])

  if (!model || model === '自动选择' || model === '未选择模型') {
    return (
      <Sparkles
        size={size}
        className={className}
        style={{ color: '#854d0e', flexShrink: 0, ...style }}
        aria-hidden="true"
      />
    )
  }

  return (
    <span
      className={`model-brand-icon-wrap${className ? ` ${className}` : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style
      }}
    >
      <ModelIcon
        model={modelName || model}
        size={size}
        type={type}
        shape={shape}
        style={{ flexShrink: 0 }}
      />
    </span>
  )
}
