import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDown, Sparkles } from 'lucide-react'

export interface ScrollToBottomPillProps {
  visible: boolean
  isStreaming?: boolean
  unreadCount?: number
  onClick: () => void
  reducedMotion?: boolean | null
  className?: string
}

export const ScrollToBottomPill: React.FC<ScrollToBottomPillProps> = ({
  visible,
  isStreaming = false,
  unreadCount = 0,
  onClick,
  reducedMotion = false,
  className
}) => {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className={`scroll-to-bottom-pill-wrapper ${className || ''}`}
          initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.94 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: reducedMotion
              ? { duration: 0 }
              : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }
          }}
          exit={{
            opacity: 0,
            y: 6,
            scale: 0.94,
            transition: reducedMotion ? { duration: 0 } : { duration: 0.1, ease: [0.4, 0, 0.2, 1] }
          }}
        >
          <button
            type="button"
            className={`scroll-to-bottom-pill ${isStreaming ? 'is-streaming' : ''}`}
            onClick={onClick}
            aria-label="滚动到底部查看最新消息"
          >
            {isStreaming ? (
              <>
                <Sparkles size={13} className="scroll-to-bottom-icon is-pulsing" />
                <span className="scroll-to-bottom-text">正在生成最新内容</span>
                <ArrowDown size={12} className="scroll-to-bottom-arrow is-bouncing" />
              </>
            ) : unreadCount > 0 ? (
              <>
                <ArrowDown size={13} className="scroll-to-bottom-arrow" />
                <span className="scroll-to-bottom-text">{unreadCount} 条新消息</span>
              </>
            ) : (
              <>
                <ArrowDown size={13} className="scroll-to-bottom-arrow" />
                <span className="scroll-to-bottom-text">回到底部</span>
              </>
            )}
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
