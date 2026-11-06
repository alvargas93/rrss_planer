import * as React from 'react'
import Markdown from 'react-markdown'
import { AlertTriangle } from 'lucide-react'
import type { AiMessage } from '@shared/domain/ai'
import { cn } from '@renderer/lib/utils'
import { ActionResultCard } from './ActionResultCard'

/** Texto con formato ligero (negritas, listas, párrafos). Sin HTML ni enlaces externos. */
export function RichText({
  text,
  className
}: {
  text: string
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'text-sm leading-6 [&_a]:text-accent [&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1 [&_code]:text-[13px] [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5',
        className
      )}
    >
      <Markdown
        skipHtml
        allowedElements={[
          'p',
          'strong',
          'em',
          'ul',
          'ol',
          'li',
          'h1',
          'h2',
          'h3',
          'code',
          'pre',
          'blockquote',
          'br',
          'hr'
        ]}
      >
        {text}
      </Markdown>
    </div>
  )
}

export function MessageBubble({
  message,
  streamingText
}: {
  message: AiMessage | null
  /** Si se pasa, es una respuesta que aún está llegando. */
  streamingText?: string
}): React.JSX.Element {
  const isUser = message?.role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[92%] rounded-lg px-3.5 py-2',
          isUser ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-text'
        )}
      >
        {streamingText !== undefined ? (
          <>
            <RichText text={streamingText} />
            <span
              className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent align-middle"
              aria-hidden
            />
          </>
        ) : (
          message?.blocks.map((block, index) => {
            if (block.type === 'text') {
              return isUser ? (
                <p key={index} className="text-sm leading-6 whitespace-pre-wrap">
                  {block.text}
                </p>
              ) : (
                <RichText key={index} text={block.text} />
              )
            }
            if (block.type === 'error') {
              return (
                <p key={index} className="flex items-start gap-2 text-sm text-warning">
                  <AlertTriangle size={16} className="mt-1 shrink-0" aria-hidden />
                  {block.message}
                </p>
              )
            }
            return <ActionResultCard key={index} block={block} />
          })
        )}
        {message && message.role === 'assistant' && message.costUsd > 0 && (
          <p className="mt-1 text-right text-[10px] text-subtle">
            {message.inputTokens + message.outputTokens} tokens · {message.costUsd.toFixed(4)} $
          </p>
        )}
      </div>
    </div>
  )
}
