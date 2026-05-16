import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react"
import {
  fetchSageQuote,
  streamSageChat,
  verifySagePayment,
} from "../api"
import {
  DEFAULT_API_BASE,
  type SageChatMessage,
  type SagePaymentWidgetOptions,
  type SageQuoteResponse,
  type SageVerifyPaymentResponse,
} from "../types"

export interface SagePaymentWidgetProps extends SagePaymentWidgetOptions {
  className?: string
  style?: CSSProperties
  title?: string
}

type Phase = "idle" | "quoting" | "payment_required" | "verifying" | "streaming" | "error"

export function SagePaymentWidget(props: SagePaymentWidgetProps): JSX.Element {
  const {
    apiBase = DEFAULT_API_BASE,
    tenant,
    initialMessages = [],
    placeholder = "Ask Sage about Ergo or agent payments...",
    className,
    style,
    title = "Ask Sage",
  } = props

  const [messages, setMessages] = useState<SageChatMessage[]>(initialMessages)
  const [input, setInput] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [quoteResponse, setQuoteResponse] = useState<SageQuoteResponse | null>(null)
  const [activeQuestion, setActiveQuestion] = useState("")
  const [noteBoxId, setNoteBoxId] = useState("")
  const [receipt, setReceipt] = useState<SageVerifyPaymentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tier, setTier] = useState<"free" | "premium" | null>(null)

  const busy = phase === "quoting" || phase === "verifying" || phase === "streaming"
  const apiOpts = useMemo(() => ({ apiBase, tenant }), [apiBase, tenant])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const question = input.trim()
    if (!question || busy) return

    const userMessage: SageChatMessage = { role: "user", content: question }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    props.onMessage?.(userMessage, nextMessages)
    setInput("")
    setError(null)
    setReceipt(null)
    setQuoteResponse(null)
    setActiveQuestion(question)
    setNoteBoxId("")
    setTier(null)
    setPhase("quoting")

    try {
      const quote = await fetchSageQuote({
        ...apiOpts,
        question,
        history: messages,
      })
      if (quote.premium) {
        if (!quote.quote) throw new Error("Sage marked this question premium but did not return a quote.")
        setQuoteResponse(quote)
        setPhase("payment_required")
        return
      }
      await streamAnswer(nextMessages)
    } catch (err) {
      fail(err)
    }
  }

  async function verifyAndContinue() {
    const quote = quoteResponse?.quote
    const note = noteBoxId.trim()
    if (!quote || !activeQuestion || !note || busy) return
    setError(null)
    setPhase("verifying")
    try {
      const verified = await verifySagePayment({
        ...apiOpts,
        quote,
        question: activeQuestion,
        noteBoxId: note,
      })
      setReceipt(verified)
      props.onReceipt?.(verified)
      await streamAnswer(messages, verified.paymentToken)
    } catch (err) {
      setPhase("payment_required")
      fail(err, false)
    }
  }

  async function streamAnswer(baseMessages: SageChatMessage[], paymentToken?: string) {
    setPhase("streaming")
    let text = ""
    const placeholderMessage: SageChatMessage = { role: "assistant", content: "" }
    setMessages([...baseMessages, placeholderMessage])

    const result = await streamSageChat({
      ...apiOpts,
      messages: baseMessages,
      paymentToken,
      onEvent(event) {
        if (event.type === "tier") {
          setTier(event.tier)
          props.onTier?.(event.tier)
        }
        if (event.type === "delta") {
          text += event.text
          setMessages([...baseMessages, { role: "assistant", content: text }])
        }
      },
    })

    if (!result.ok) {
      if (result.paymentRequired) {
        const quote = await fetchSageQuote({
          ...apiOpts,
          question: activeQuestion,
          history: baseMessages.slice(0, -1),
        })
        setQuoteResponse(quote)
        setPhase("payment_required")
        return
      }
      throw new Error(result.error ?? "Sage chat failed.")
    }

    if (result.text && result.text !== text) {
      setMessages([...baseMessages, { role: "assistant", content: result.text }])
    }
    setPhase("idle")
  }

  function fail(err: unknown, setErrorPhase: boolean = true) {
    const message = err instanceof Error ? err.message : "Sage request failed."
    setError(message)
    if (setErrorPhase) setPhase("error")
    props.onError?.(err)
  }

  const quote = quoteResponse?.quote

  return (
    <section className={className} style={{ ...rootStyle, ...style }}>
      <header style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>{tenant?.label ?? "Ergo agent economy"}</div>
          <h2 style={titleStyle}>{title}</h2>
        </div>
        <span style={badgeStyle}>{tier ? tier.toUpperCase() : "SAGE"}</span>
      </header>

      <div style={messagesStyle} aria-live="polite">
        {messages.length === 0 ? (
          <div style={emptyStyle}>Free questions answer immediately. Premium questions return an Accord Note quote.</div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              style={message.role === "user" ? userBubbleStyle : assistantBubbleStyle}
            >
              {message.content || (message.role === "assistant" && phase === "streaming" ? "Thinking..." : "")}
            </div>
          ))
        )}
      </div>

      {quote ? (
        <div style={paymentStyle}>
          <div style={paymentHeaderStyle}>
            <strong>Payment required</strong>
            <span>{quote.price} ERG testnet</span>
          </div>
          <Field label="Quote" value={quote.quoteId} />
          <Field label="Receiver" value={quote.receiverAddress} copy />
          <Field label="Reserve box" value={quote.reserveBoxId} copy />
          <Field label="Task hash" value={quote.taskHash} copy />
          <label style={labelStyle}>
            Note box id
            <input
              value={noteBoxId}
              onChange={(e) => setNoteBoxId(e.currentTarget.value)}
              placeholder="Paste 64-char Ergo box id"
              style={inputStyle}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            onClick={verifyAndContinue}
            disabled={!noteBoxId.trim() || busy}
            style={primaryButtonStyle}
          >
            {phase === "verifying" ? "Verifying..." : "Verify payment"}
          </button>
        </div>
      ) : null}

      {receipt ? (
        <a href={receipt.receiptUrl} target="_blank" rel="noopener noreferrer" style={receiptStyle}>
          Receipt: {shortId(receipt.receiptId)}
        </a>
      ) : null}

      {error ? <div style={errorStyle}>{error}</div> : null}

      <form onSubmit={submit} style={formStyle}>
        <input
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          placeholder={placeholder}
          disabled={busy}
          style={inputStyle}
        />
        <button type="submit" disabled={!input.trim() || busy} style={sendButtonStyle}>
          {phase === "quoting" ? "Quoting..." : phase === "streaming" ? "Streaming..." : "Send"}
        </button>
      </form>
    </section>
  )
}

function Field({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
  return (
    <div style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <code style={fieldValueStyle}>{value}</code>
      {copy ? (
        <button type="button" style={copyButtonStyle} onClick={() => copyText(value)}>
          Copy
        </button>
      ) : null}
    </div>
  )
}

function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(value)
  }
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value
}

const rootStyle: CSSProperties = {
  background: "#070707",
  color: "#f8fafc",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 8,
  padding: 16,
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  boxSizing: "border-box",
  width: "100%",
  maxWidth: 520,
}

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
}

const eyebrowStyle: CSSProperties = {
  color: "#fb923c",
  fontSize: 11,
  letterSpacing: ".16em",
  textTransform: "uppercase",
  marginBottom: 4,
}

const titleStyle: CSSProperties = {
  fontSize: 18,
  lineHeight: 1.2,
  margin: 0,
}

const badgeStyle: CSSProperties = {
  color: "#0f172a",
  background: "#fdba74",
  borderRadius: 4,
  padding: "4px 7px",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: ".12em",
}

const messagesStyle: CSSProperties = {
  minHeight: 180,
  maxHeight: 360,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "12px 0",
}

const emptyStyle: CSSProperties = {
  color: "#94a3b8",
  border: "1px dashed rgba(148,163,184,.28)",
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
}

const bubbleBase: CSSProperties = {
  borderRadius: 6,
  padding: "9px 10px",
  fontSize: 14,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
}

const userBubbleStyle: CSSProperties = {
  ...bubbleBase,
  alignSelf: "flex-end",
  maxWidth: "88%",
  background: "#fb923c",
  color: "#111827",
}

const assistantBubbleStyle: CSSProperties = {
  ...bubbleBase,
  alignSelf: "flex-start",
  maxWidth: "92%",
  background: "rgba(255,255,255,.07)",
  color: "#e5e7eb",
}

const paymentStyle: CSSProperties = {
  border: "1px solid rgba(251,146,60,.35)",
  background: "rgba(251,146,60,.08)",
  borderRadius: 8,
  padding: 12,
  display: "grid",
  gap: 8,
}

const paymentHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  color: "#fed7aa",
  fontSize: 13,
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  color: "#cbd5e1",
  fontSize: 12,
}

const fieldStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "88px 1fr auto",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
}

const fieldLabelStyle: CSSProperties = {
  color: "#94a3b8",
}

const fieldValueStyle: CSSProperties = {
  color: "#f8fafc",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 11,
}

const copyButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,.16)",
  background: "rgba(255,255,255,.06)",
  color: "#f8fafc",
  borderRadius: 4,
  padding: "4px 7px",
  cursor: "pointer",
}

const formStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
  marginTop: 12,
}

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,.16)",
  background: "#050505",
  color: "#f8fafc",
  borderRadius: 6,
  padding: "10px 11px",
  fontSize: 14,
}

const sendButtonStyle: CSSProperties = {
  border: 0,
  background: "#fb923c",
  color: "#111827",
  borderRadius: 6,
  padding: "0 14px",
  fontWeight: 800,
  cursor: "pointer",
}

const primaryButtonStyle: CSSProperties = {
  ...sendButtonStyle,
  padding: "10px 12px",
}

const receiptStyle: CSSProperties = {
  display: "block",
  marginTop: 10,
  color: "#67e8f9",
  fontSize: 13,
  textDecoration: "none",
}

const errorStyle: CSSProperties = {
  color: "#fecaca",
  background: "rgba(239,68,68,.12)",
  border: "1px solid rgba(239,68,68,.25)",
  borderRadius: 6,
  padding: 10,
  marginTop: 10,
  fontSize: 13,
}
