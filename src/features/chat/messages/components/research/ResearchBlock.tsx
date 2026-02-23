import { memo } from 'react'
import type { ResearchItem as ResearchItemData } from '@/features/chat/types/chat'
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
} from '@/shared/ui/chain-of-thought'
import { adaptResearchItemsToSteps } from './adapters'

type ResearchBlockProps = {
  items: ResearchItemData[]
  blockIndex: number
  messageIndex: number
  isActive?: boolean
}

export const ResearchBlock = memo(function ResearchBlock({
  items,
  blockIndex,
  messageIndex,
  isActive = false,
}: ResearchBlockProps) {
  const steps = adaptResearchItemsToSteps(items, isActive)

  return (
    <ChainOfThought defaultOpen={true}>
      <ChainOfThoughtHeader>思考过程</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((step, index) => {
          const stepKey = `${messageIndex}-${blockIndex}-${index}`
          const isLastStep = index === steps.length - 1

          return (
            <ChainOfThoughtStep
              key={stepKey}
              icon={step.icon}
              label={step.label}
              description={step.description}
              status={step.status}
              hideConnector={isLastStep}
            >
              {/* Search results as clickable badges */}
              {step.searchResults && step.searchResults.length > 0 && (
                <ChainOfThoughtSearchResults>
                  {step.searchResults.map((result, resultIndex) => (
                    <ChainOfThoughtSearchResult
                      key={`${stepKey}-result-${resultIndex}`}
                      href={result.url}
                    >
                      {result.title}
                    </ChainOfThoughtSearchResult>
                  ))}
                </ChainOfThoughtSearchResults>
              )}
            </ChainOfThoughtStep>
          )
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
})
