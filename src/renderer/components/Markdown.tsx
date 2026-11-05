import { memo, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js/lib/common'

function CodeBlock({ className, raw }: { className?: string; raw: string }) {
  const ref = useRef<HTMLElement | null>(null)
  const [copied, setCopied] = useState(false)
  const lang = /language-([\w-]+)/.exec(className ?? '')?.[1]

  useEffect(() => {
    if (ref.current && lang) {
      try {
        hljs.highlightElement(ref.current)
      } catch {
        /* unknown language */
      }
    }
  }, [raw, lang])

  const copy = (): void => {
    navigator.clipboard.writeText(raw).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      },
      () => {}
    )
  }

  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span>{lang ?? 'text'}</span>
        <button className="codeblock-copy" onClick={copy} title="Copy code">
          {copied ? 'copied ✓' : 'copy'}
        </button>
      </div>
      <pre>
        <code ref={ref as never} className={className}>
          {raw}
        </code>
      </pre>
    </div>
  )
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pre: ({ children }: any) => <>{children}</>,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code: ({ className, children }: any) => {
            const raw = String(children)
            const isBlock = !!className?.includes('language-') || raw.includes('\n')
            if (!isBlock) return <code className="md-inline">{raw}</code>
            return <CodeBlock className={className} raw={raw.replace(/\n$/, '')} />
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
