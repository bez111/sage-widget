import {
  createSagePaymentIntent,
  fetchSageReceipt,
  fetchSageQuote,
  serializeSagePaymentIntent,
  streamSageChat,
  verifySagePayment,
} from "../api"
import {
  DEFAULT_API_BASE,
  type SageChatMessage,
  type SagePaymentIntent,
  type SagePaymentPhase,
  type SagePaymentWidgetOptions,
  type SageQuoteResponse,
  type SageReceiptBundle,
  type SageVerifyPaymentResponse,
} from "../types"

export interface MountSagePaymentWidgetHandle {
  send: (question: string) => Promise<void>
  destroy: () => void
  current: () => SageChatMessage[]
  status: () => {
    phase: SagePaymentPhase
    tier: "free" | "premium" | null
    quote: SageQuoteResponse["quote"] | null
    paymentIntent: SagePaymentIntent | null
    receipt: SageVerifyPaymentResponse | null
    receiptBundle: SageReceiptBundle | null
    error: string | null
    messages: SageChatMessage[]
    activeQuestion: string | null
  }
}

export function mountSagePaymentWidget(
  target: Element,
  opts: SagePaymentWidgetOptions = {},
): MountSagePaymentWidgetHandle {
  const apiBase = opts.apiBase ?? DEFAULT_API_BASE
  let destroyed = false
  let messages = [...(opts.initialMessages ?? [])]
  let phase: SagePaymentPhase = "idle"
  let inputValue = ""
  let noteBoxId = ""
  let activeQuestion = ""
  let quoteResponse: SageQuoteResponse | null = null
  let paymentIntent: SagePaymentIntent | null = null
  let receipt: SageVerifyPaymentResponse | null = null
  let receiptBundle: SageReceiptBundle | null = null
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
    paymentIntent = null
    receipt = null
    receiptBundle = null
    error = null
    tier = null
    const userMessage: SageChatMessage = { role: "user", content: question }
    messages = [...messages, userMessage]
    opts.onMessage?.(userMessage, messages)
    transition("quoting")
    render()
    try {
      const quote = await fetchSageQuote({
        apiBase,
        tenant: opts.tenant,
        question,
        history: messages.slice(0, -1),
      })
      if (destroyed) return
      opts.onQuote?.(quote)
      if (quote.premium) {
        if (!quote.quote) throw new Error("Sage marked this question premium but did not return a quote.")
        quoteResponse = quote
        paymentIntent = createSagePaymentIntent({
          apiBase,
          tenant: opts.tenant,
          question,
          quote: quote.quote,
        })
        opts.onPaymentIntent?.(paymentIntent)
        transition("payment_required")
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
    transition("verifying")
    error = null
    render()
    let verified: SageVerifyPaymentResponse
    try {
      verified = await verifySagePayment({
        apiBase,
        tenant: opts.tenant,
        quote,
        question: activeQuestion,
        noteBoxId: note,
      })
    } catch (err) {
      transition("payment_required")
      fail(err, false)
      return
    }

    if (destroyed) return
    receipt = verified
    opts.onReceipt?.(verified)
    quoteResponse = null
    paymentIntent = null
    noteBoxId = ""
    transition("streaming")
    try {
      receiptBundle = await fetchSageReceipt(verified.receiptId, { apiBase, tenant: opts.tenant })
      opts.onReceiptBundle?.(receiptBundle)
      emitStatus("streaming")
    } catch (bundleErr) {
      opts.onError?.(bundleErr)
    }
    try {
      await streamAnswer(messages, verified.paymentToken)
    } catch (err) {
      fail(err)
    }
  }

  async function streamAnswer(baseMessages: SageChatMessage[], paymentToken?: string) {
    transition("streaming")
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
      if (result.paymentRequired) {
        const quote = await fetchSageQuote({
          apiBase,
          tenant: opts.tenant,
          question: activeQuestion,
          history: baseMessages.slice(0, -1),
        })
        opts.onQuote?.(quote)
        quoteResponse = quote
        paymentIntent = quote.quote
          ? createSagePaymentIntent({
              apiBase,
              tenant: opts.tenant,
              question: activeQuestion,
              quote: quote.quote,
            })
          : null
        if (paymentIntent) opts.onPaymentIntent?.(paymentIntent)
        transition("payment_required")
        render()
        return
      }
      throw new Error(result.error ?? "Sage chat failed.")
    }
    if (result.text && result.text !== text) {
      messages = [...baseMessages, { role: "assistant", content: result.text }]
    }
    transition("idle")
    render()
  }

  async function launchWallet() {
    if (!paymentIntent || !opts.walletLauncher || isBusy()) return
    error = null
    try {
      const result = await opts.walletLauncher(paymentIntent)
      if (result?.ok === false) {
        throw new Error(result.error ?? "Wallet flow did not produce a Note.")
      }
      if (result?.noteBoxId) noteBoxId = result.noteBoxId
    } catch (err) {
      error = err instanceof Error ? err.message : "Wallet flow failed."
      opts.onError?.(err)
    }
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
    title.textContent = opts.title ?? "Ask Sage"
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
      a.textContent = `Receipt: ${shortId(receipt.receiptId)}${
        receiptBundle ? ` · ${receiptBundle.completeness}` : ""
      }`
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
      button.disabled = !inputValue.trim() || isBusy()
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

    const helper = document.createElement("p")
    helper.textContent =
      opts.paymentInstructions?.helperText ??
      "Issue an Ergo testnet Note for this quote, then paste the created Note box id."
    applyStyles(helper, helperStyle)
    if (opts.paymentInstructions?.walletUrl) {
      const link = document.createElement("a")
      link.href = opts.paymentInstructions.walletUrl
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      link.textContent = " Wallet guide"
      applyStyles(link, inlineLinkStyle)
      helper.appendChild(link)
    }
    panel.appendChild(helper)

    panel.append(
      field("Quote", quote.quoteId),
      field("Receiver", quote.receiverAddress),
      field("Reserve box", quote.reserveBoxId),
      field("Task hash", quote.taskHash),
    )

    const testnetWarning =
      opts.testnetWarning === false
        ? null
        : opts.testnetWarning ??
          "Testnet proof flow. The widget never signs funds; connect your own reviewed wallet layer before handling real value."
    if (testnetWarning) {
      const warning = document.createElement("div")
      warning.textContent = testnetWarning
      applyStyles(warning, warningStyle)
      panel.appendChild(warning)
    }

    if (opts.showPaymentIntent !== false && paymentIntent) {
      const intent = document.createElement("div")
      applyStyles(intent, intentStyle)
      const intentTop = document.createElement("div")
      applyStyles(intentTop, intentHeaderStyle)
      const label = document.createElement("strong")
      label.textContent = "Payment intent"
      const copy = document.createElement("button")
      copy.type = "button"
      copy.textContent = "Copy JSON"
      copy.addEventListener("click", () => copyText(serializeSagePaymentIntent(paymentIntent!)))
      applyStyles(copy, copyButtonStyle)
      intentTop.append(label, copy)
      const code = document.createElement("code")
      code.textContent = serializeSagePaymentIntent(paymentIntent)
      applyStyles(code, intentCodeStyle)
      intent.append(intentTop, code)
      panel.appendChild(intent)
    }

    if (opts.walletLauncher && paymentIntent) {
      const wallet = document.createElement("button")
      wallet.type = "button"
      wallet.textContent = opts.paymentInstructions?.walletLauncherLabel ?? "Open wallet flow"
      wallet.disabled = isBusy()
      wallet.addEventListener("click", () => void launchWallet())
      applyStyles(wallet, secondaryButtonStyle)
      panel.appendChild(wallet)
    }

    const label = document.createElement("label")
    label.textContent = opts.paymentInstructions?.noteBoxLabel ?? "Note box id"
    applyStyles(label, labelStyle)
    const input = document.createElement("input")
    input.value = noteBoxId
    input.placeholder = "Paste 64-char Ergo box id"
    input.disabled = isBusy()
    input.addEventListener("input", () => {
      noteBoxId = input.value
      verify.disabled = !noteBoxId.trim() || isBusy()
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
    const copy = document.createElement("button")
    copy.type = "button"
    copy.textContent = "Copy"
    copy.addEventListener("click", () => copyText(value))
    applyStyles(copy, copyButtonStyle)
    row.append(label, code, copy)
    return row
  }

  function isBusy(): boolean {
    return phase === "quoting" || phase === "verifying" || phase === "streaming"
  }

  function fail(err: unknown, setErrorPhase: boolean = true) {
    error = err instanceof Error ? err.message : "Sage request failed."
    if (setErrorPhase) transition("error")
    else emitStatus(phase)
    opts.onError?.(err)
    render()
  }

  function transition(next: SagePaymentPhase) {
    phase = next
    opts.onPhase?.(next)
    emitStatus(next)
  }

  function emitStatus(next: SagePaymentPhase) {
    opts.onStatus?.({
      phase: next,
      tier,
      quote: quoteResponse?.quote ?? null,
      paymentIntent,
      receipt,
      receiptBundle,
      error,
      messages,
      activeQuestion: activeQuestion || null,
    })
  }

  render()

  return {
    send,
    destroy() {
      destroyed = true
      root.remove()
    },
    current: () => messages,
    status: () => ({
      phase,
      tier,
      quote: quoteResponse?.quote ?? null,
      paymentIntent,
      receipt,
      receiptBundle,
      error,
      messages,
      activeQuestion: activeQuestion || null,
    }),
  }
}

function applyStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, styles)
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value
}

function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(value)
  }
}

const rootStyle: Partial<CSSStyleDeclaration> = {
  background: "#070707",
  color: "#f8fafc",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: "8px",
  padding: "16px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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

const helperStyle: Partial<CSSStyleDeclaration> = {
  color: "#fdba74",
  fontSize: "12px",
  lineHeight: "1.45",
  margin: "0",
}

const inlineLinkStyle: Partial<CSSStyleDeclaration> = {
  color: "#67e8f9",
  textDecoration: "none",
}

const labelStyle: Partial<CSSStyleDeclaration> = {
  display: "grid",
  gap: "6px",
  color: "#cbd5e1",
  fontSize: "12px",
}

const fieldStyle: Partial<CSSStyleDeclaration> = {
  display: "grid",
  gridTemplateColumns: "minmax(70px, 88px) minmax(0, 1fr) auto",
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

const copyButtonStyle: Partial<CSSStyleDeclaration> = {
  border: "1px solid rgba(255,255,255,.16)",
  background: "rgba(255,255,255,.06)",
  color: "#f8fafc",
  borderRadius: "4px",
  padding: "4px 7px",
  cursor: "pointer",
}

const formStyle: Partial<CSSStyleDeclaration> = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
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

const secondaryButtonStyle: Partial<CSSStyleDeclaration> = {
  border: "1px solid rgba(103,232,249,.28)",
  background: "rgba(103,232,249,.08)",
  color: "#cffafe",
  borderRadius: "6px",
  padding: "10px 12px",
  fontWeight: "800",
  cursor: "pointer",
}

const warningStyle: Partial<CSSStyleDeclaration> = {
  color: "#fde68a",
  background: "rgba(245,158,11,.1)",
  border: "1px solid rgba(245,158,11,.24)",
  borderRadius: "6px",
  padding: "8px 9px",
  fontSize: "12px",
  lineHeight: "1.45",
}

const intentStyle: Partial<CSSStyleDeclaration> = {
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.04)",
  borderRadius: "6px",
  padding: "10px",
  display: "grid",
  gap: "8px",
}

const intentHeaderStyle: Partial<CSSStyleDeclaration> = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "8px",
  color: "#e2e8f0",
  fontSize: "12px",
}

const intentCodeStyle: Partial<CSSStyleDeclaration> = {
  display: "block",
  maxHeight: "130px",
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "#cbd5e1",
  fontSize: "10px",
  lineHeight: "1.45",
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
