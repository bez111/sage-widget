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

export interface MountSagePaymentWidgetHandle {
  send: (question: string) => Promise<void>
  destroy: () => void
  current: () => SageChatMessage[]
}

type Phase = "idle" | "quoting" | "payment_required" | "verifying" | "streaming" | "error"

export function mountSagePaymentWidget(
  target: Element,
  opts: SagePaymentWidgetOptions = {},
): MountSagePaymentWidgetHandle {
  const apiBase = opts.apiBase ?? DEFAULT_API_BASE
  let destroyed = false
  let messages = [...(opts.initialMessages ?? [])]
  let phase: Phase = "idle"
  let inputValue = ""
  let noteBoxId = ""
  let activeQuestion = ""
  let quoteResponse: SageQuoteResponse | null = null
  let receipt: SageVerifyPaymentResponse | null = null
  let error: string | null = null
  let tier: "free" | "premium" | null = null

  const root = document.createElement("section")
  root.setAttribute("data-sage-payment-widget", "true")
  applyStyles(root, rootStyle)
  target.appendChild(root)

  async function send(questionRaw: string) {
    const question = questionRaw.trim()
    if (!question || isBusy()) return
    activeQuestion = question
    inputValue = ""
    noteBoxId = ""
    quoteResponse = null
    receipt = null
    error = null
    tier = null
    const userMessage: SageChatMessage = { role: "user", content: question }
    messages = [...messages, userMessage]
    opts.onMessage?.(userMessage, messages)
    phase = "quoting"
    render()
    try {
      const quote = await fetchSageQuote({
        apiBase,
        tenant: opts.tenant,
        question,
        history: messages.slice(0, -1),
      })
      if (destroyed) return
      if (quote.premium) {
        if (!quote.quote) throw new Error("Sage marked this question premium but did not return a quote.")
        quoteResponse = quote
        phase = "payment_required"
        render()
        return
      }
      await streamAnswer(messages)
    } catch (err) {
      fail(err)
    }
  }

  async function verifyAndContinue() {
    const quote = quoteResponse?.quote
    const note = noteBoxId.trim()
    if (!quote || !activeQuestion || !note || isBusy()) return
    phase = "verifying"
    error = null
    render()
    try {
      const verified = await verifySagePayment({
        apiBase,
        tenant: opts.tenant,
        quote,
        question: activeQuestion,
        noteBoxId: note,
      })
      if (destroyed) return
      receipt = verified
      opts.onReceipt?.(verified)
      await streamAnswer(messages, verified.paymentToken)
    } catch (err) {
      phase = "payment_required"
      fail(err, false)
    }
  }

  async function streamAnswer(baseMessages: SageChatMessage[], paymentToken?: string) {
    phase = "streaming"
    messages = [...baseMessages, { role: "assistant", content: "" }]
    render()
    let text = ""
    const result = await streamSageChat({
      apiBase,
      tenant: opts.tenant,
      messages: baseMessages,
      paymentToken,
      onEvent(event) {
        if (destroyed) return
        if (event.type === "tier") {
          tier = event.tier
          opts.onTier?.(event.tier)
          render()
        }
        if (event.type === "delta") {
          text += event.text
          messages = [...baseMessages, { role: "assistant", content: text }]
          render()
        }
      },
    })
    if (destroyed) return
    if (!result.ok) {
      throw new Error(result.error ?? "Sage chat failed.")
    }
    if (result.text && result.text !== text) {
      messages = [...baseMessages, { role: "assistant", content: result.text }]
    }
    phase = "idle"
    render()
  }

  function render() {
    root.innerHTML = ""

    const header = document.createElement("header")
    applyStyles(header, headerStyle)
    const titleWrap = document.createElement("div")
    const eyebrow = document.createElement("div")
    eyebrow.textContent = opts.tenant?.label ?? "Ergo agent economy"
    applyStyles(eyebrow, eyebrowStyle)
    const title = document.createElement("h2")
    title.textContent = "Ask Sage"
    applyStyles(title, titleStyle)
    titleWrap.append(eyebrow, title)
    const badge = document.createElement("span")
    badge.textContent = tier ? tier.toUpperCase() : "SAGE"
    applyStyles(badge, badgeStyle)
    header.append(titleWrap, badge)
    root.appendChild(header)

    const log = document.createElement("div")
    applyStyles(log, messagesStyle)
    if (messages.length === 0) {
      const empty = document.createElement("div")
      empty.textContent = "Free questions answer immediately. Premium questions return an Accord Note quote."
      applyStyles(empty, emptyStyle)
      log.appendChild(empty)
    } else {
      messages.forEach((message) => {
        const bubble = document.createElement("div")
        bubble.textContent =
          message.content || (message.role === "assistant" && phase === "streaming" ? "Thinking..." : "")
        applyStyles(bubble, message.role === "user" ? userBubbleStyle : assistantBubbleStyle)
        log.appendChild(bubble)
      })
    }
    root.appendChild(log)

    if (quoteResponse?.quote) {
      root.appendChild(renderPaymentPanel(quoteResponse.quote))
    }

    if (receipt) {
      const a = document.createElement("a")
      a.href = receipt.receiptUrl
      a.target = "_blank"
      a.rel = "noopener noreferrer"
      a.textContent = `Receipt: ${shortId(receipt.receiptId)}`
      applyStyles(a, receiptStyle)
      root.appendChild(a)
    }

    if (error) {
      const err = document.createElement("div")
      err.textContent = error
      applyStyles(err, errorStyle)
      root.appendChild(err)
    }

    const form = document.createElement("form")
    applyStyles(form, formStyle)
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      void send(inputValue)
    })
    const input = document.createElement("input")
    input.value = inputValue
    input.placeholder = opts.placeholder ?? "Ask Sage about Ergo or agent payments..."
    input.disabled = isBusy()
    input.addEventListener("input", () => {
      inputValue = input.value
    })
    applyStyles(input, inputStyle)
    const button = document.createElement("button")
    button.type = "submit"
    button.textContent = phase === "quoting" ? "Quoting..." : phase === "streaming" ? "Streaming..." : "Send"
    button.disabled = isBusy()
    applyStyles(button, sendButtonStyle)
    form.append(input, button)
    root.appendChild(form)
  }

  function renderPaymentPanel(quote: NonNullable<SageQuoteResponse["quote"]>): HTMLElement {
    const panel = document.createElement("div")
    applyStyles(panel, paymentStyle)

    const top = document.createElement("div")
    applyStyles(top, paymentHeaderStyle)
    const strong = document.createElement("strong")
    strong.textContent = "Payment required"
    const price = document.createElement("span")
    price.textContent = `${quote.price} ERG testnet`
    top.append(strong, price)
    panel.appendChild(top)

    panel.append(
      field("Quote", quote.quoteId),
      field("Receiver", quote.receiverAddress),
      field("Reserve box", quote.reserveBoxId),
      field("Task hash", quote.taskHash),
    )

    const label = document.createElement("label")
    label.textContent = "Note box id"
    applyStyles(label, labelStyle)
    const input = document.createElement("input")
    input.value = noteBoxId
    input.placeholder = "Paste 64-char Ergo box id"
    input.disabled = isBusy()
    input.addEventListener("input", () => {
      noteBoxId = input.value
    })
    applyStyles(input, inputStyle)
    label.appendChild(input)
    panel.appendChild(label)

    const verify = document.createElement("button")
    verify.type = "button"
    verify.textContent = phase === "verifying" ? "Verifying..." : "Verify payment"
    verify.disabled = !noteBoxId.trim() || isBusy()
    verify.addEventListener("click", () => void verifyAndContinue())
    applyStyles(verify, primaryButtonStyle)
    panel.appendChild(verify)

    return panel
  }

  function field(labelText: string, value: string): HTMLElement {
    const row = document.createElement("div")
    applyStyles(row, fieldStyle)
    const label = document.createElement("span")
    label.textContent = labelText
    applyStyles(label, fieldLabelStyle)
    const code = document.createElement("code")
    code.textContent = value
    applyStyles(code, fieldValueStyle)
    row.append(label, code)
    return row
  }

  function isBusy(): boolean {
    return phase === "quoting" || phase === "verifying" || phase === "streaming"
  }

  function fail(err: unknown, setErrorPhase: boolean = true) {
    error = err instanceof Error ? err.message : "Sage request failed."
    if (setErrorPhase) phase = "error"
    opts.onError?.(err)
    render()
  }

  render()

  return {
    send,
    destroy() {
      destroyed = true
      root.remove()
    },
    current: () => messages,
  }
}

function applyStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, styles)
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value
}

const rootStyle: Partial<CSSStyleDeclaration> = {
  background: "#070707",
  color: "#f8fafc",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: "8px",
  padding: "16px",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  boxSizing: "border-box",
  width: "100%",
  maxWidth: "520px",
}

const headerStyle: Partial<CSSStyleDeclaration> = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "12px",
}

const eyebrowStyle: Partial<CSSStyleDeclaration> = {
  color: "#fb923c",
  fontSize: "11px",
  letterSpacing: ".16em",
  textTransform: "uppercase",
  marginBottom: "4px",
}

const titleStyle: Partial<CSSStyleDeclaration> = {
  fontSize: "18px",
  lineHeight: "1.2",
  margin: "0",
}

const badgeStyle: Partial<CSSStyleDeclaration> = {
  color: "#0f172a",
  background: "#fdba74",
  borderRadius: "4px",
  padding: "4px 7px",
  fontSize: "10px",
  fontWeight: "800",
  letterSpacing: ".12em",
}

const messagesStyle: Partial<CSSStyleDeclaration> = {
  minHeight: "180px",
  maxHeight: "360px",
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "12px 0",
}

const emptyStyle: Partial<CSSStyleDeclaration> = {
  color: "#94a3b8",
  border: "1px dashed rgba(148,163,184,.28)",
  borderRadius: "6px",
  padding: "12px",
  fontSize: "13px",
}

const bubbleBase: Partial<CSSStyleDeclaration> = {
  borderRadius: "6px",
  padding: "9px 10px",
  fontSize: "14px",
  lineHeight: "1.45",
  whiteSpace: "pre-wrap",
}

const userBubbleStyle: Partial<CSSStyleDeclaration> = {
  ...bubbleBase,
  alignSelf: "flex-end",
  maxWidth: "88%",
  background: "#fb923c",
  color: "#111827",
}

const assistantBubbleStyle: Partial<CSSStyleDeclaration> = {
  ...bubbleBase,
  alignSelf: "flex-start",
  maxWidth: "92%",
  background: "rgba(255,255,255,.07)",
  color: "#e5e7eb",
}

const paymentStyle: Partial<CSSStyleDeclaration> = {
  border: "1px solid rgba(251,146,60,.35)",
  background: "rgba(251,146,60,.08)",
  borderRadius: "8px",
  padding: "12px",
  display: "grid",
  gap: "8px",
}

const paymentHeaderStyle: Partial<CSSStyleDeclaration> = {
  display: "flex",
  justifyContent: "space-between",
  color: "#fed7aa",
  fontSize: "13px",
}

const labelStyle: Partial<CSSStyleDeclaration> = {
  display: "grid",
  gap: "6px",
  color: "#cbd5e1",
  fontSize: "12px",
}

const fieldStyle: Partial<CSSStyleDeclaration> = {
  display: "grid",
  gridTemplateColumns: "88px 1fr",
  alignItems: "center",
  gap: "8px",
  fontSize: "12px",
}

const fieldLabelStyle: Partial<CSSStyleDeclaration> = {
  color: "#94a3b8",
}

const fieldValueStyle: Partial<CSSStyleDeclaration> = {
  color: "#f8fafc",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "11px",
}

const formStyle: Partial<CSSStyleDeclaration> = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "8px",
  marginTop: "12px",
}

const inputStyle: Partial<CSSStyleDeclaration> = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,.16)",
  background: "#050505",
  color: "#f8fafc",
  borderRadius: "6px",
  padding: "10px 11px",
  fontSize: "14px",
}

const sendButtonStyle: Partial<CSSStyleDeclaration> = {
  border: "0",
  background: "#fb923c",
  color: "#111827",
  borderRadius: "6px",
  padding: "0 14px",
  fontWeight: "800",
  cursor: "pointer",
}

const primaryButtonStyle: Partial<CSSStyleDeclaration> = {
  ...sendButtonStyle,
  padding: "10px 12px",
}

const receiptStyle: Partial<CSSStyleDeclaration> = {
  display: "block",
  marginTop: "10px",
  color: "#67e8f9",
  fontSize: "13px",
  textDecoration: "none",
}

const errorStyle: Partial<CSSStyleDeclaration> = {
  color: "#fecaca",
  background: "rgba(239,68,68,.12)",
  border: "1px solid rgba(239,68,68,.25)",
  borderRadius: "6px",
  padding: "10px",
  marginTop: "10px",
  fontSize: "13px",
}
