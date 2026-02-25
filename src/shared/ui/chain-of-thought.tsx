import { createContext } from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import { ChevronRight } from 'lucide-react'
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

function ChainOfThought({ defaultOpen = true, ...props }: ChainOfThoughtProps) {
  return (
    <ChainOfThoughtContext.Provider value={{ open: props.open ?? defaultOpen }}>
      <CollapsiblePrimitive.Root
        data-slot="chain-of-thought"
        defaultOpen={defaultOpen}
        className="my-4 bg-transparent px-1 py-2"
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
      title="点击展开或收起"
      className={cn(
        'group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 -mx-2 text-sm text-(--text-secondary)',
        'hover:bg-(--surface-hover) hover:text-(--interactive-primary-hover)',
        'transition-colors duration-150',
        className
      )}
      {...props}
    >
      <span>{children}</span>
      <ChevronRight
        aria-hidden
        className="h-4 w-4 ml-auto shrink-0 opacity-70 transition-transform duration-200 group-data-[state=open]:rotate-90 group-hover:opacity-100"
      />
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
  status = 'complete',
  hideConnector = false,
  children,
  className,
  ...props
}: ChainOfThoughtStepProps) {
  const dotStatusStyles = {
    complete: 'opacity-100',
    active: 'opacity-100 ring-1 ring-(--content-accent-muted)',
    pending: 'opacity-40',
  }

  const wrapperStatusStyles = {
    complete: '',
    active: '',
    pending: 'opacity-60',
  }

  const nodeContent = icon ?? (
    <div
      className={cn(
        'h-1.5 w-1.5 rounded-full bg-current transition-opacity',
        dotStatusStyles[status]
      )}
    />
  )

  return (
    <div
      data-slot="chain-of-thought-step"
      className={cn('flex gap-4 py-2 first:pt-4 animate-in fade-in duration-200', className)}
      {...props}
    >
      {/* Node column */}
      <div className="flex flex-col items-center pt-0.5">
        <div
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-(--text-secondary)',
            icon && wrapperStatusStyles[status]
          )}
        >
          {nodeContent}
        </div>
        {/* Connector line - lighter, hidden for last step */}
        {!hideConnector && (
          <div className="w-px flex-1 min-h-4 mt-0.5 bg-(--border-primary) opacity-50" />
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 pb-4">
        {description && (
          <div className="text-xs text-(--text-secondary) leading-relaxed">
            {description}
          </div>
        )}
        {children && <div className={description ? 'mt-2' : ''}>{children}</div>}
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
      className={cn('flex flex-wrap gap-2', className)}
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
    <Badge variant="outline" className={cn('gap-1.5 px-2 py-0.5 text-[11px] max-w-full font-normal border-(--border-primary) hover:bg-(--surface-hover) cursor-pointer transition-colors', className)}>
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate min-w-0">{children}</span>
      {url && <span className="shrink-0 text-(--text-tertiary)">{(() => { try { return new URL(url).host } catch { return url } })()}</span>}
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
          'max-w-full rounded-lg border border-(--border-primary) opacity-90',
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

