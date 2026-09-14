/* eslint-disable react-refresh/only-export-components */
import {
  type ReasoningGroupComponent,
  type ReasoningMessagePartComponent,
  useAuiState,
  useScrollLock
} from '@assistant-ui/react'
import { memo, useCallback, useRef } from 'react'
import {
  ANIMATION_DURATION,
  ReasoningContent,
  ReasoningFade,
  ReasoningRoot as ReasoningRootBase,
  type ReasoningRootProps,
  ReasoningText,
  ReasoningTrigger,
  reasoningVariants
} from './reasoning'

export type { ReasoningRootProps } from './reasoning'

function ReasoningRoot({ ref, onAnimationStart, ...props }: ReasoningRootProps): React.ReactNode {
  const collapsibleRef = useRef<HTMLDivElement | null>(null)
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION)

  const handleAnimationStart = useCallback(() => {
    lockScroll()
    onAnimationStart?.()
  }, [lockScroll, onAnimationStart])

  const composedRef = useCallback(
    (node: HTMLDivElement | null) => {
      collapsibleRef.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref]
  )

  return <ReasoningRootBase ref={composedRef} onAnimationStart={handleAnimationStart} {...props} />
}

const ReasoningImpl: ReasoningMessagePartComponent = ({ text }) => (
  <span className="whitespace-pre-wrap">{text}</span>
)

const ReasoningGroupImpl: ReasoningGroupComponent = ({ children, startIndex, endIndex }) => {
  const isReasoningStreaming = useAuiState((s) => {
    if (s.message.status?.type !== 'running') return false
    for (let index = startIndex; index <= endIndex; index++) {
      if (s.message.parts[index]?.status.type === 'running') return true
    }
    return false
  })

  return (
    <ReasoningRoot streaming={isReasoningStreaming}>
      <ReasoningTrigger active={isReasoningStreaming} />
      <ReasoningContent aria-busy={isReasoningStreaming}>
        <ReasoningText>{children}</ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  )
}

const Reasoning = memo(ReasoningImpl) as unknown as ReasoningMessagePartComponent & {
  Root: typeof ReasoningRoot
  Trigger: typeof ReasoningTrigger
  Content: typeof ReasoningContent
  Text: typeof ReasoningText
  Fade: typeof ReasoningFade
}

Reasoning.displayName = 'Reasoning'
Reasoning.Root = ReasoningRoot
Reasoning.Trigger = ReasoningTrigger
Reasoning.Content = ReasoningContent
Reasoning.Text = ReasoningText
Reasoning.Fade = ReasoningFade

const ReasoningGroup = memo(ReasoningGroupImpl)
ReasoningGroup.displayName = 'ReasoningGroup'

export {
  Reasoning,
  ReasoningContent,
  ReasoningFade,
  ReasoningGroup,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
  reasoningVariants
}
