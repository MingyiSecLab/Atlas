import React from 'react'
import { BranchPickerPrimitive } from '@assistant-ui/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface BranchPickerProps {
  hideWhenSingleBranch?: boolean
}

export const BranchPicker: React.FC<BranchPickerProps> = ({ hideWhenSingleBranch = true }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch={hideWhenSingleBranch}
      className="aui-branch-picker"
    >
      <BranchPickerPrimitive.Previous
        className="aui-branch-picker-btn"
        aria-label="上一个回答分支"
        title="上一版本"
      >
        <ChevronLeft size={12} />
      </BranchPickerPrimitive.Previous>

      <span className="aui-branch-picker-text">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>

      <BranchPickerPrimitive.Next
        className="aui-branch-picker-btn"
        aria-label="下一个回答分支"
        title="下一版本"
      >
        <ChevronRight size={12} />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  )
}
