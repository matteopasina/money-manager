import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles, Send, Trash2 } from 'lucide-react'
import { api, type AssistantCleanup, type AssistantReview, type ChatMessage } from '../api/client'
import { fmtAmount } from '../utils/money'

async function fetchPageContext(pathname: string): Promise<string> {
  const parts: string[] = [`Page: ${pathname}`]
  try {
    const [accounts, txns, budgets] = await Promise.all([
      api.accounts.list(false),
      api.transactions.list({}),
      api.budgets.list().catch(() => null),
    ])
    if (accounts.length) {
      parts.push('Accounts:\n' + accounts.map(a =>
        `  - ${a.name} (${a.currency}, ${a.account_type}, ${a.active ? 'active' : 'inactive'})`
      ).join('\n'))
    }
    const recent = txns.slice(0, 30)
    if (recent.length) {
      parts.push('Recent transactions (latest 30):\n' + recent.map(t =>
        `  - ${t.date} | ${t.account} | ${t.description} | ${t.amount} ${t.category ? `[${t.category}]` : ''}`
      ).join('\n'))
    }
    if (budgets) {
      parts.push(`Budgets: ${budgets.totals.spent} spent, ${budgets.totals.remaining} remaining, currency ${budgets.currency}`)
    }
  } catch { /* keep the helper usable even if context fetching fails */ }
  return parts.join('\n\n')
}

function promptGroups() {
  return [
    {
      label: 'Review',
      prompts: [
        'Give me a quick financial review',
        'What changed most recently?',
        'What deserves attention this week?',
      ],
    },
    {
      label: 'Spending',
      prompts: [
        'Summarize spending by category this month',
        'Find recurring subscriptions',
        'Show transactions that need categorization',
      ],
    },
    {
      label: 'Planning',
      prompts: [
        'Review my budget risks',
        'Explain my path to financial independence',
        'Do I have enough liquid cash?',
      ],
    },
  ]
}

function renderInlineMarkdown(text: string, keyPrefix = 'inline'): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*.+?\*\*|`.+?`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-${match.index}`}>{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(<code key={`${keyPrefix}-${match.index}`}>{token.slice(1, -1)}</code>)
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

function renderMessageMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const lines = text.split('\n')
  let paragraph: string[] = []
  let listItems: string[] = []
  let listType: 'ul' | 'ol' | null = null

  function flushParagraph() {
    if (!paragraph.length) return
    const value = paragraph.join(' ').trim()
    if (value) {
      nodes.push(<p key={`p-${nodes.length}`}>{renderInlineMarkdown(value, `p-${nodes.length}`)}</p>)
    }
    paragraph = []
  }

  function flushList() {
    if (!listType || !listItems.length) return
    const Tag = listType
    nodes.push(
      <Tag key={`list-${nodes.length}`}>
        {listItems.map((item, i) => (
          <li key={i}>{renderInlineMarkdown(item, `li-${nodes.length}-${i}`)}</li>
        ))}
      </Tag>
    )
    listItems = []
    listType = null
  }

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      return
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      const level = heading[1].length
      nodes.push(
        <div key={`h-${lineIndex}`} className={`helper-md-heading level-${level}`}>
          {renderInlineMarkdown(heading[2], `h-${lineIndex}`)}
        </div>
      )
      return
    }

    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      if (listType && listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(bullet[1])
      return
    }

    const numbered = line.match(/^\d+\.\s+(.+)$/)
    if (numbered) {
      flushParagraph()
      if (listType && listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(numbered[1])
      return
    }

    flushList()
    paragraph.push(line)
  })

  flushParagraph()
  flushList()

  return nodes.length ? nodes : [text]
}

export default function FinancialHelper() {
  const location = useLocation()
  const navigate = useNavigate()
  const routeState = location.state as { prompt?: string; sourcePath?: string } | null
  const initialPrompt = routeState?.prompt ?? ''
  const initialSourcePath = routeState?.sourcePath ?? location.pathname
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [apiHistory, setApiHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState('')
  const [tab, setTab] = useState<'chat' | 'review' | 'cleanup'>('review')
  const [review, setReview] = useState<AssistantReview | null>(null)
  const [cleanup, setCleanup] = useState<AssistantCleanup | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(true)
  const sentInitial = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const groups = useMemo(() => promptGroups(), [])

  useEffect(() => {
    api.settings.all().then(s => setModel(s.llm_model || '')).catch(() => {})
    Promise.all([
      api.assistant.review()
        .then(setReview)
        .catch((e: unknown) => setReviewError(e instanceof Error ? e.message : String(e))),
      api.assistant.cleanup()
        .then(setCleanup)
        .catch((e: unknown) => setCleanupError(e instanceof Error ? e.message : String(e))),
    ]).finally(() => setAnalysisLoading(false))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendQuestion = useCallback(async (question: string, contextPath = location.pathname) => {
    const q = question.trim()
    if (!q || loading || !model) return
    setTab('chat')
    setInput('')
    const userMsg: ChatMessage = { role: 'user', content: q }
    const newDisplay = [...messages, userMsg]
    const newHistory = [...apiHistory, userMsg]
    setMessages(newDisplay)
    setApiHistory(newHistory)
    setLoading(true)
    try {
      const page_context = await fetchPageContext(contextPath)
      const res = await api.chat({ messages: newHistory, model, page_context })
      setMessages([...newDisplay, { role: 'assistant', content: res.reply }])
      setApiHistory(res.messages)
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e)
      setMessages([...newDisplay, { role: 'assistant', content: `Error: ${err}` }])
    } finally {
      setLoading(false)
    }
  }, [apiHistory, loading, location.pathname, messages, model])

  useEffect(() => {
    if (!initialPrompt || sentInitial.current) return
    setTab('chat')
    if (!model) {
      setInput(initialPrompt)
      return
    }
    sentInitial.current = true
    void sendQuestion(initialPrompt, initialSourcePath)
    navigate(location.pathname, { replace: true })
  }, [model, initialPrompt, initialSourcePath, navigate, location.pathname, sendQuestion])

  function clear() {
    setMessages([])
    setApiHistory([])
  }

  const empty = messages.length === 0 && !loading

  const money = (value: number) => `${review?.currency ?? cleanup?.currency ?? 'EUR'} ${Math.round(value).toLocaleString('en-US')}`

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Financial Helper</h1>
          <p>Ask for reviews, drill into spending, and pressure-test plans.</p>
        </div>
        <button className="btn btn-secondary" onClick={clear} disabled={!messages.length && !apiHistory.length}>
          <Trash2 size={15} /> Clear
        </button>
      </div>

      <div className="helper-tabs">
        {[
          ['review', 'Review'],
          ['cleanup', 'Cleanup'],
          ['chat', 'Chat'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(value as typeof tab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`helper-shell${tab === 'chat' ? '' : ' full'}`}>
        {tab === 'chat' && (
          <aside className="helper-rail">
            <div className="helper-rail-head">
              <Sparkles size={18} />
              <div>
                <div className="helper-rail-title">Start here</div>
                <div className="helper-rail-sub">Pick a thread to pull.</div>
              </div>
            </div>

            {!model && (
              <div className="helper-notice">
                No model configured. Set one in Preferences.
              </div>
            )}

            {groups.map(group => (
              <div key={group.label} className="helper-prompt-group">
                <div className="helper-prompt-label">{group.label}</div>
                {group.prompts.map(prompt => (
                  <button
                    key={prompt}
                    className="helper-prompt"
                    onClick={() => sendQuestion(prompt)}
                    disabled={loading || !model}
                  >
                    <span>{prompt}</span>
                    <ArrowRight size={13} />
                  </button>
                ))}
              </div>
            ))}
          </aside>
        )}

        {tab === 'review' && (
          <section className="helper-chat">
            <div className="helper-messages">
              {analysisLoading && <div className="helper-empty"><span className="spinner" /></div>}
              {!analysisLoading && reviewError && (
                <div className="helper-empty">
                  <Sparkles size={22} />
                  <div className="helper-empty-title">Review unavailable.</div>
                  <div className="helper-empty-copy">{reviewError}</div>
                </div>
              )}
              {!analysisLoading && !review && !reviewError && (
                <div className="helper-empty">
                  <Sparkles size={22} />
                  <div className="helper-empty-title">No review yet.</div>
                  <div className="helper-empty-copy">Add transactions and balances to generate a monthly review.</div>
                </div>
              )}
              {!analysisLoading && review && (
                <div className="helper-analysis">
                  <div className="helper-analysis-header">
                    <div>
                      <div className="helper-kicker">Monthly review</div>
                      <h2>{review.period}</h2>
                    </div>
                    <span>{review.guardrail}</span>
                  </div>

                  <div className="helper-metric-grid">
                    <div><span>Income</span><strong>{money(review.summary.income)}</strong></div>
                    <div><span>Spending</span><strong>{money(review.summary.spending)}</strong></div>
                    <div><span>Net cash flow</span><strong>{money(review.summary.net_cash_flow)}</strong></div>
                    <div><span>Savings rate</span><strong>{review.summary.savings_rate === null ? 'n/a' : `${review.summary.savings_rate}%`}</strong></div>
                  </div>

                  <div className="helper-section-grid">
                    {review.sections.map(section => (
                      <div key={section.title} className={`helper-analysis-card ${section.severity}`}>
                        <div className="helper-analysis-title">{section.title}</div>
                        <p>{section.body}</p>
                        {section.actions.slice(0, 2).map(action => (
                          <button key={action.label} className="btn-link" onClick={() => sendQuestion(action.label)}>
                            {action.label} →
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div className="helper-two-col">
                    <div className="helper-table-card">
                      <div className="helper-analysis-title">Top categories</div>
                      {review.top_categories.map(row => (
                        <div key={row.category} className="helper-row">
                          <span>{row.category}</span>
                          <strong>{money(row.spent)}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="helper-table-card">
                      <div className="helper-analysis-title">Changes vs previous month</div>
                      {review.category_changes.slice(0, 5).map(row => (
                        <div key={row.category} className="helper-row">
                          <span>{row.category}</span>
                          <strong>{row.change >= 0 ? '+' : ''}{money(row.change)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'cleanup' && (
          <section className="helper-chat">
            <div className="helper-messages">
              {analysisLoading && <div className="helper-empty"><span className="spinner" /></div>}
              {!analysisLoading && cleanupError && (
                <div className="helper-empty">
                  <Sparkles size={22} />
                  <div className="helper-empty-title">Cleanup unavailable.</div>
                  <div className="helper-empty-copy">{cleanupError}</div>
                </div>
              )}
              {!analysisLoading && !cleanup && !cleanupError && (
                <div className="helper-empty">
                  <Sparkles size={22} />
                  <div className="helper-empty-title">No cleanup data.</div>
                  <div className="helper-empty-copy">The cleanup queue could not be loaded yet.</div>
                </div>
              )}
              {!analysisLoading && cleanup && (
                <div className="helper-analysis">
                  <div className="helper-analysis-header">
                    <div>
                      <div className="helper-kicker">Cleanup queue</div>
                      <h2>{cleanup.total} transactions</h2>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => sendQuestion('Help me clean up uncategorized transactions.')}>
                      Ask helper
                    </button>
                  </div>

                  {cleanup.groups.length === 0 ? (
                    <div className="helper-empty">
                      <Sparkles size={22} />
                      <div className="helper-empty-title">Nothing to clean up.</div>
                    </div>
                  ) : (
                    <div className="helper-cleanup-list">
                      {cleanup.groups.map(group => (
                        <div key={group.merchant} className="helper-cleanup-card">
                          <div>
                            <div className="helper-analysis-title">{group.merchant}</div>
                            <p>{group.count} transaction{group.count === 1 ? '' : 's'} · {money(group.total_spend)}</p>
                            {group.suggested_category && <span className="badge">Suggested: {group.suggested_category}</span>}
                          </div>
                          <div className="helper-evidence-list">
                            {group.evidence.slice(0, 3).map(tx => (
                              <div key={tx.id} className="helper-row">
                                <span>{tx.date} · {tx.description}</span>
                                <strong>{fmtAmount(tx.amount)}</strong>
                              </div>
                            ))}
                          </div>
                          {group.actions.map(action => (
                            <button key={action.label} className="btn-link" onClick={() => sendQuestion(`${action.label}. Show me the evidence before I apply it.`)}>
                              {action.label} →
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'chat' && (
          <section className="helper-chat">
          <div className="helper-messages">
            {empty && (
              <div className="helper-empty">
                <Sparkles size={22} />
                <div className="helper-empty-title">Ready when you are.</div>
                <div className="helper-empty-copy">
                  I can read your accounts, balances, budgets, and transactions through the app tools.
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`helper-message ${m.role}`}>
                {renderMessageMarkdown(m.content)}
              </div>
            ))}
            {loading && (
              <div className="helper-message assistant">
                <span className="spinner" style={{ width: 15, height: 15 }} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="helper-composer">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendQuestion(input)}
              placeholder={model ? 'Ask about your finances…' : 'Configure a model in Preferences first'}
              disabled={loading || !model}
            />
            <button className="btn btn-primary" onClick={() => sendQuestion(input)} disabled={loading || !model || !input.trim()}>
              <Send size={15} /> Send
            </button>
          </div>
        </section>
        )}
      </div>
    </div>
  )
}
