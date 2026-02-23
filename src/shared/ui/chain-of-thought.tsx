import { createContext } from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import { ChevronRight, Check, Loader2, Brain, Circle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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
        'group flex w-full items-center gap-2 text-sm font-medium text-(--text-primary)',
        'hover:text-(--text-secondary) transition-colors',
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
  icon: LucideIcon
  label: string
  description?: string
  status?: StepStatus
  hideConnector?: boolean
}

function ChainOfThoughtStep({
  icon: Icon,
  label,
  description,
  status = 'complete',
  hideConnector = false,
  children,
  className,
  ...props
}: ChainOfThoughtStepProps) {
  const StatusIcon =
    status === 'complete' ? Check : status === 'active' ? Loader2 : Circle

  return (
    <div
      data-slot="chain-of-thought-step"
      className={cn('flex gap-3 py-2 first:pt-3', className)}
      {...props}
    >
      {/* Icon column */}
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            {
              'bg-(--surface-hover) text-(--text-secondary)':
                status === 'complete',
              'bg-(--interactive-primary) text-white': status === 'active',
              'bg-(--surface-muted) text-(--text-tertiary)':
                status === 'pending',
            }
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        {/* Connector line - hidden for last step */}
        {!hideConnector && <div className="w-px flex-1 bg-border min-h-4" />}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2">
          <span
            className={cn('text-sm font-medium', {
              'text-(--text-primary)': status === 'complete',
              'text-(--interactive-primary)': status === 'active',
              'text-(--text-tertiary)': status === 'pending',
            })}
          >
            {label}
          </span>
          {StatusIcon && (
            <StatusIcon
              className={cn('h-3.5 w-3.5', {
                'text-success': status === 'complete',
                'animate-spin text-(--interactive-primary)':
                  status === 'active',
              })}
            />
          )}
        </div>
        {description && (
          <div className="mt-1 text-xs text-(--text-secondary)">
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
  children?: React.ReactNode
  className?: string
}

function ChainOfThoughtSearchResult({
  href,
  className,
  children,
}: ChainOfThoughtSearchResultProps) {
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('no-underline', className)}
      >
        <Badge variant="secondary" className="hover:bg-(--surface-hover) cursor-pointer">
          {children}
        </Badge>
      </a>
    )
  }

  return (
    <Badge variant="secondary" className={className}>
      {children}
    </Badge>
  )
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

