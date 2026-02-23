import { createContext } from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import { ChevronRight, Brain } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Badge } from './badge'

// Context for sharing state between components
type ChainOfThoughtContextValue = {
  open?: boolean
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue>({})

// Root container
type ChainOfThoughtProps = React.ComponentProps<
  typeof CollapsiblePrimitive.Root
>

function ChainOfThought({ ...props }: ChainOfThoughtProps) {
  return (
    <ChainOfThoughtContext.Provider value={{ open: props.open }}>
      <CollapsiblePrimitive.Root
        data-slot="chain-of-thought"
        className="my-2 bg-transparent p-3 "
        {...props}
      />
    </ChainOfThoughtContext.Provider>
  )
}

// Header with collapsible trigger
type ChainOfThoughtHeaderProps = React.ComponentProps<
  typeof CollapsiblePrimitive.CollapsibleTrigger
> & {
  children?: React.ReactNode
}

function ChainOfThoughtHeader({
  children = '思考过程',
  className,
  ...props
}: ChainOfThoughtHeaderProps) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="chain-of-thought-header"
      className={cn(
        'group flex w-full items-center gap-2 text-sm font-medium text-(--text-secondary)',
        'hover:text-(--interactive-primary-hover) transition-colors',
        className
      )}
      {...props}
    >
      <Brain className="h-4 w-4" />
      <span>{children}</span>
      <ChevronRight className="h-4 w-4 ml-auto transition-transform duration-200 group-data-[state=open]:rotate-90" />
    </CollapsiblePrimitive.CollapsibleTrigger>
  )
}

// Content wrapper
type ChainOfThoughtContentProps = React.ComponentProps<
  typeof CollapsiblePrimitive.CollapsibleContent
>

function ChainOfThoughtContent({
  className,
  ...props
}: ChainOfThoughtContentProps) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="chain-of-thought-content"
      className={cn(
        'overflow-hidden',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2',
        className
      )}
      {...props}
    />
  )
}

// Individual step
type StepStatus = 'complete' | 'active' | 'pending'

type ChainOfThoughtStepProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode
  label?: string
  description?: string
  status?: StepStatus
  hideConnector?: boolean
}

function ChainOfThoughtStep({
  icon,
  description,
  hideConnector = false,
  children,
  className,
  ...props
}: ChainOfThoughtStepProps) {
  return (
    <div
      data-slot="chain-of-thought-step"
      className={cn('flex gap-3 py-1 first:pt-3', className)}
      {...props}
    >
      {/* Icon column */}
      <div className="flex flex-col items-center py-0.5">
        <div
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full'
          )}
        >
          {icon}
        </div>
        {/* Connector line - hidden for last step */}
        {!hideConnector && <div className="w-px flex-1 bg-border min-h-4" />}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 pb-2">
        {description && (
          <div className="text-xs text-(--text-secondary)">
            {description}
          </div>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  )
}

// Search results container
type ChainOfThoughtSearchResultsProps = React.HTMLAttributes<HTMLDivElement>

function ChainOfThoughtSearchResults({
  className,
  ...props
}: ChainOfThoughtSearchResultsProps) {
  return (
    <div
      data-slot="chain-of-thought-search-results"
      className={cn('flex flex-wrap gap-1.5', className)}
      {...props}
    />
  )
}

// Individual search result badge
type ChainOfThoughtSearchResultProps = {
  href?: string
  icon?: React.ReactNode
  url?: string
  children?: React.ReactNode
  className?: string
}

function ChainOfThoughtSearchResult({
  href,
  icon,
  url,
  className,
  children,
}: ChainOfThoughtSearchResultProps) {
  const content = (
    <Badge variant="secondary" className={cn('gap-1.5 hover:bg-(--surface-hover) cursor-pointer', className)}>
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
      {url && <span className="truncate text-(--text-tertiary)">{url}</span>}
    </Badge>
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="no-underline max-w-full"
      >
        {content}
      </a>
    )
  }

  return content
}

// Image display
type ChainOfThoughtImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  caption?: string
}

function ChainOfThoughtImage({
  src,
  alt,
  caption,
  className,
  ...props
}: ChainOfThoughtImageProps) {
  return (
    <div data-slot="chain-of-thought-image" className="space-y-2">
      <img
        src={src}
        alt={alt}
        className={cn(
          'max-w-full rounded-lg border border-border',
          className
        )}
        {...props}
      />
      {caption && (
        <div className="text-xs text-(--text-secondary)">{caption}</div>
      )}
    </div>
  )
}

export {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
  ChainOfThoughtImage,
}
export type { StepStatus, ChainOfThoughtStepProps }

