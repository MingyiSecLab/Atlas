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
          className={`pointer-events-none absolute bottom-[calc(var(--chat-composer-height,120px)+1rem)] left-1/2 z-20 -translate-x-1/2 ${className || ''}`}
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
            className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-card/90 px-3.5 text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition-all hover:bg-accent hover:text-accent-foreground active:scale-95 cursor-pointer"
            onClick={onClick}
            aria-label="滚动到底部查看最新消息"
          >
            {isStreaming ? (
              <>
                <Sparkles size={13} className="text-primary animate-pulse" />
                <span className="font-medium text-foreground">正在生成最新内容</span>
                <ArrowDown size={12} className="text-muted-foreground animate-bounce" />
              </>
            ) : unreadCount > 0 ? (
              <>
                <ArrowDown size={13} className="text-primary" />
                <span>{unreadCount} 条新消息</span>
              </>
            ) : (
              <>
                <ArrowDown size={13} className="text-muted-foreground" />
                <span>回到底部</span>
              </>
            )}
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
