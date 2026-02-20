'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { callAIAgent, type AIAgentResponse } from '@/lib/aiAgent'
import parseLLMJson from '@/lib/jsonParser'
import { KnowledgeBaseUpload } from '@/components/KnowledgeBaseUpload'
import { FiMessageSquare, FiHome, FiCheckCircle, FiSettings, FiSend, FiBell, FiUser, FiDollarSign, FiAlertCircle, FiX, FiChevronDown, FiChevronUp, FiExternalLink, FiClock, FiFileText, FiShield } from 'react-icons/fi'
import { HiOutlineTicket, HiOutlineDocumentText } from 'react-icons/hi'
import { BiSupport } from 'react-icons/bi'

// ===================== CONSTANTS =====================
const CUSTOMER_SUPPORT_AGENT_ID = '69988c23bf6ce2c35b435ab9'
const APPROVAL_HANDLER_AGENT_ID = '69988c245d2326ad4d26cbc6'
const RAG_ID = '69988bfb3dc9e9e52825cb31'

// ===================== TYPES =====================
interface Citation {
  source: string
  excerpt: string
}

interface Ticket {
  ticket_id: string
  category: 'billing' | 'technical' | 'account' | 'general'
  subject: string
  status: 'open' | 'in_progress' | 'pending_approval' | 'resolved'
  priority: 'low' | 'medium' | 'high'
  created_at?: string
}

interface LeadInfo {
  name: string
  email: string
  use_case: string
}

interface UpsellOffer {
  product_name: string
  price: string
  description: string
  checkout_url: string
}

interface ApprovalRequest {
  request_type: 'refund' | 'account_change'
  reason: string
  order_id: string
  desired_outcome: string
  summary: string
  ticket_id?: string
  customer_name?: string
  timestamp?: string
}

interface RevenueEntry {
  amount: number
  product: string
  pro_fund_allocation: number
  timestamp?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  timestamp: string
  citations?: Citation[]
  ticket?: Ticket | null
  lead_info?: LeadInfo | null
  upsell_offer?: UpsellOffer | null
  approval_request?: ApprovalRequest | null
  revenue_entry?: RevenueEntry | null
}

interface ResolvedApproval {
  request: ApprovalRequest
  decision: 'approved' | 'denied'
  customer_response: string
  resolution_notes: string
  operator_notes: string
  action_taken: string
  resolved_at: string
}

interface AppSettings {
  greeting: string
  concierge_checkout_url: string
  addon_checkout_url: string
  sheets_url: string
  pro_fund_percentage: number
  pro_fund_threshold: number
  conversion_count_threshold: number
  time_window_days: number
}

type NavSection = 'dashboard' | 'chat' | 'approvals' | 'settings'

// ===================== HELPERS =====================
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

const DEFAULT_SETTINGS: AppSettings = {
  greeting: 'Welcome to Corey Support! How can I help you today?',
  concierge_checkout_url: 'https://checkout.stripe.com/concierge-setup',
  addon_checkout_url: 'https://checkout.stripe.com/addon-pack',
  sheets_url: '',
  pro_fund_percentage: 20,
  pro_fund_threshold: 120,
  conversion_count_threshold: 3,
  time_window_days: 14,
}

// ===================== SAMPLE DATA =====================
const SAMPLE_TICKETS: Ticket[] = [
  { ticket_id: 'TKT-001', category: 'billing', subject: 'Refund request for order #4521', status: 'pending_approval', priority: 'high', created_at: 'Feb 19, 2026' },
  { ticket_id: 'TKT-002', category: 'technical', subject: 'API integration not working', status: 'in_progress', priority: 'medium', created_at: 'Feb 19, 2026' },
  { ticket_id: 'TKT-003', category: 'account', subject: 'Password reset issue', status: 'open', priority: 'low', created_at: 'Feb 20, 2026' },
  { ticket_id: 'TKT-004', category: 'general', subject: 'Feature request: dark mode', status: 'resolved', priority: 'low', created_at: 'Feb 18, 2026' },
]

const SAMPLE_REVENUE: RevenueEntry[] = [
  { amount: 97, product: 'Concierge Setup', pro_fund_allocation: 19.40, timestamp: 'Feb 20, 10:30 AM' },
  { amount: 25, product: 'Add-On Pack', pro_fund_allocation: 5.00, timestamp: 'Feb 19, 3:15 PM' },
  { amount: 97, product: 'Concierge Setup', pro_fund_allocation: 19.40, timestamp: 'Feb 18, 11:00 AM' },
]

const SAMPLE_APPROVALS: ApprovalRequest[] = [
  { request_type: 'refund', reason: 'Product did not meet expectations', order_id: '#4521', desired_outcome: 'Full refund of $97', summary: 'Customer requesting full refund for Concierge Setup package. Purchased 5 days ago, claims features did not match description.', customer_name: 'Sarah Mitchell', ticket_id: 'TKT-001', timestamp: 'Feb 19, 2:45 PM' },
  { request_type: 'account_change', reason: 'Needs enterprise tier upgrade', order_id: '#4530', desired_outcome: 'Upgrade to enterprise with prorated billing', summary: 'Long-term customer requesting enterprise upgrade with prorated billing for remainder of current billing cycle.', customer_name: 'James Anderson', ticket_id: 'TKT-005', timestamp: 'Feb 20, 9:20 AM' },
]

const SAMPLE_CHAT: ChatMessage[] = [
  { id: 's1', role: 'agent', content: 'Welcome to Corey Support! How can I help you today?', timestamp: 'Feb 20, 9:00 AM' },
  { id: 's2', role: 'user', content: 'I need help with my recent order. The product setup guide seems incomplete.', timestamp: 'Feb 20, 9:01 AM' },
  { id: 's3', role: 'agent', content: 'I understand your concern about the setup guide. Let me pull up the relevant documentation for you.\n\nBased on our knowledge base, here are the steps you might be missing:\n\n1. **Initial Configuration** - Navigate to Settings > Setup Wizard\n2. **API Key Generation** - Found under Developer Tools\n3. **Integration Testing** - Use our sandbox environment first\n\nWould you like me to walk you through any of these steps in detail?', timestamp: 'Feb 20, 9:02 AM', citations: [{ source: 'Setup Guide v3.2', excerpt: 'The setup wizard provides step-by-step configuration for new users...' }] },
  { id: 's4', role: 'user', content: 'That helps! Can you also tell me about the Concierge Setup package?', timestamp: 'Feb 20, 9:05 AM' },
  { id: 's5', role: 'agent', content: 'Great question! Our Concierge Setup package provides hands-on assistance to get you fully configured. Here is what is included:', timestamp: 'Feb 20, 9:05 AM', upsell_offer: { product_name: 'Concierge Setup', price: '$97', description: 'Full hands-on setup assistance including API configuration, integration testing, and 30-day priority support.', checkout_url: 'https://checkout.stripe.com/concierge-setup' } },
]

// ===================== ERROR BOUNDARY =====================
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ===================== SUB-COMPONENTS =====================

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-amber-100 text-amber-800',
    pending_approval: 'bg-orange-100 text-orange-800',
    resolved: 'bg-green-100 text-green-800',
    denied: 'bg-red-100 text-red-800',
    escalated: 'bg-purple-100 text-purple-800',
  }
  const label = (status ?? '').replace(/_/g, ' ')
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${colorMap[status] ?? 'bg-secondary text-secondary-foreground'}`}>
      {label}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const colorMap: Record<string, string> = {
    billing: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    technical: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    account: 'bg-violet-50 text-violet-700 border border-violet-200',
    general: 'bg-stone-50 text-stone-700 border border-stone-200',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${colorMap[category] ?? 'bg-secondary text-secondary-foreground'}`}>
      {category ?? 'general'}
    </span>
  )
}

function PriorityIndicator({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    low: 'bg-green-500',
    medium: 'bg-amber-500',
    high: 'bg-red-500',
  }
  return (
    <span className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${colorMap[priority] ?? 'bg-gray-500'}`} />
      <span className="text-xs text-muted-foreground capitalize">{priority ?? 'low'}</span>
    </span>
  )
}

function StatCard({ icon, label, value, subtitle }: { icon: React.ReactNode; label: string; value: string | number; subtitle?: string }) {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border/30 p-5 transition-all duration-300 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
          <p className="text-2xl font-serif font-bold mt-1 tracking-wide">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border/30 p-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-muted rounded" />
          <div className="h-7 w-16 bg-muted rounded" />
          <div className="h-3 w-24 bg-muted rounded" />
        </div>
        <div className="h-10 w-10 bg-muted rounded-lg" />
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" />
        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
      </div>
      <span className="text-xs text-muted-foreground ml-2">Corey is thinking...</span>
    </div>
  )
}

function CitationMarker({ citation, index }: { citation: Citation; index: number }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <span className="inline-block">
      <button onClick={() => setExpanded(!expanded)} className="inline-flex items-center gap-0.5 text-xs text-primary hover:text-primary/80 underline decoration-dotted cursor-pointer ml-1">
        <FiFileText className="w-3 h-3" />
        {citation?.source ?? 'Source'}
        {expanded ? <FiChevronUp className="w-3 h-3" /> : <FiChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <span className="block mt-1 p-2 bg-secondary/50 rounded text-xs text-muted-foreground border border-border/20 italic">
          &ldquo;{citation?.excerpt ?? ''}&rdquo;
        </span>
      )}
    </span>
  )
}

function UpsellCard({ offer }: { offer: UpsellOffer }) {
  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg border border-amber-200/60 p-4 my-2 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-amber-100 rounded-lg">
          <FiDollarSign className="w-5 h-5 text-amber-700" />
        </div>
        <div className="flex-1">
          <h4 className="font-serif font-semibold text-sm">{offer?.product_name ?? 'Product'}</h4>
          <p className="text-xs text-muted-foreground mt-1">{offer?.description ?? ''}</p>
          <a href={offer?.checkout_url ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
            Checkout - {offer?.price ?? '$0'} <FiExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

function LeadCaptureCard({ leadInfo }: { leadInfo: LeadInfo }) {
  return (
    <div className="bg-blue-50/70 rounded-lg border border-blue-200/60 p-4 my-2">
      <div className="flex items-center gap-2 mb-2">
        <FiUser className="w-4 h-4 text-blue-600" />
        <h4 className="font-serif font-semibold text-sm text-blue-900">Lead Captured</h4>
      </div>
      <div className="grid grid-cols-1 gap-1.5 text-xs">
        <div className="flex gap-2"><span className="text-muted-foreground">Name:</span><span className="font-medium">{leadInfo?.name ?? 'N/A'}</span></div>
        <div className="flex gap-2"><span className="text-muted-foreground">Email:</span><span className="font-medium">{leadInfo?.email ?? 'N/A'}</span></div>
        <div className="flex gap-2"><span className="text-muted-foreground">Use Case:</span><span className="font-medium">{leadInfo?.use_case ?? 'N/A'}</span></div>
      </div>
    </div>
  )
}

function TicketSystemCard({ ticket }: { ticket: Ticket }) {
  return (
    <div className="bg-secondary/50 rounded-lg border border-border/30 p-3 my-2">
      <div className="flex items-center gap-2 mb-1.5">
        <HiOutlineTicket className="w-4 h-4 text-primary" />
        <span className="font-serif font-semibold text-xs">Ticket Created</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-primary font-medium">{ticket?.ticket_id ?? ''}</span>
        <StatusBadge status={ticket?.status ?? 'open'} />
        <CategoryBadge category={ticket?.category ?? 'general'} />
        <PriorityIndicator priority={ticket?.priority ?? 'low'} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{ticket?.subject ?? ''}</p>
    </div>
  )
}

// ===================== MAIN PAGE =====================
export default function Page() {
  // Navigation
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Sample data toggle
  const [showSampleData, setShowSampleData] = useState(false)

  // Dashboard data
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [revenueEntries, setRevenueEntries] = useState<RevenueEntry[]>([])
  const [proFundBalance, setProFundBalance] = useState(0)
  const [conversionCount, setConversionCount] = useState(0)
  const [dashboardLoading, setDashboardLoading] = useState(true)

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [sessionId] = useState(() => generateId())
  const [isOperatorMode, setIsOperatorMode] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Approvals
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([])
  const [resolvedApprovals, setResolvedApprovals] = useState<ResolvedApproval[]>([])
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({})
  const [approvalTab, setApprovalTab] = useState<'pending' | 'resolved'>('pending')
  const [processingApproval, setProcessingApproval] = useState<string | null>(null)

  // Settings
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsTab, setSettingsTab] = useState<'general' | 'products' | 'revenue' | 'notifications'>('general')
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Active agent tracking
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // Notification count
  const [notificationCount, setNotificationCount] = useState(0)

  // Inline status messages
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('corey_settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        setSettings(prev => ({ ...prev, ...parsed }))
      }
    } catch {
      // ignore parse errors
    }
    const timer = setTimeout(() => setDashboardLoading(false), 800)
    return () => clearTimeout(timer)
  }, [])

  // Sample data toggle
  useEffect(() => {
    if (showSampleData) {
      setTickets(SAMPLE_TICKETS)
      setRevenueEntries(SAMPLE_REVENUE)
      setProFundBalance(43.80)
      setConversionCount(3)
      setApprovalRequests(SAMPLE_APPROVALS)
      setChatMessages(SAMPLE_CHAT)
      setNotificationCount(2)
    } else {
      setTickets([])
      setRevenueEntries([])
      setProFundBalance(0)
      setConversionCount(0)
      setApprovalRequests([])
      setResolvedApprovals([])
      setChatMessages([])
      setNotificationCount(0)
    }
  }, [showSampleData])

  // Scroll chat on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // Update notification count
  useEffect(() => {
    setNotificationCount(approvalRequests.length)
  }, [approvalRequests])

  // Save settings
  const saveSettings = useCallback(() => {
    try {
      localStorage.setItem('corey_settings', JSON.stringify(settings))
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch {
      // ignore
    }
  }, [settings])

  // Pro fund threshold check
  const proFundReady = useMemo(() => {
    return proFundBalance >= settings.pro_fund_threshold && conversionCount >= settings.conversion_count_threshold
  }, [proFundBalance, settings.pro_fund_threshold, conversionCount, settings.conversion_count_threshold])

  // Send chat message
  const sendMessage = useCallback(async () => {
    const trimmed = chatInput.trim()
    if (!trimmed || chatLoading) return

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: formatTimestamp(new Date()),
    }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)
    setActiveAgentId(CUSTOMER_SUPPORT_AGENT_ID)

    try {
      const result: AIAgentResponse = await callAIAgent(trimmed, CUSTOMER_SUPPORT_AGENT_ID, { session_id: sessionId })

      if (result.success) {
        let parsed = result?.response?.result
        if (typeof parsed === 'string') {
          parsed = parseLLMJson(parsed)
        }

        const responseText = parsed?.response_text || result?.response?.message || 'I received your message. Let me look into that for you.'
        const citations = Array.isArray(parsed?.citations) ? parsed.citations : []
        const ticket = parsed?.ticket || null
        const leadInfo = parsed?.lead_info || null
        const upsellOffer = parsed?.upsell_offer || null
        const approvalRequest = parsed?.approval_request || null
        const revenueEntry = parsed?.revenue_entry || null

        const agentMsg: ChatMessage = {
          id: generateId(),
          role: 'agent',
          content: responseText,
          timestamp: formatTimestamp(new Date()),
          citations,
          ticket,
          lead_info: leadInfo,
          upsell_offer: upsellOffer,
          approval_request: approvalRequest,
          revenue_entry: revenueEntry,
        }
        setChatMessages(prev => [...prev, agentMsg])

        // Process ticket
        if (ticket && ticket.ticket_id) {
          setTickets(prev => {
            const exists = prev.find(t => t.ticket_id === ticket.ticket_id)
            if (exists) {
              return prev.map(t => t.ticket_id === ticket.ticket_id ? { ...t, ...ticket, created_at: t.created_at } : t)
            }
            return [...prev, { ...ticket, created_at: formatTimestamp(new Date()) }]
          })
        }

        // Process approval request
        if (approvalRequest) {
          setApprovalRequests(prev => [...prev, { ...approvalRequest, timestamp: formatTimestamp(new Date()), customer_name: leadInfo?.name || 'Customer' }])
          const sysMsg: ChatMessage = {
            id: generateId(),
            role: 'system',
            content: `Approval request submitted for ${approvalRequest.request_type}. An operator will review and follow up.`,
            timestamp: formatTimestamp(new Date()),
          }
          setChatMessages(prev => [...prev, sysMsg])
        }

        // Process revenue entry
        if (revenueEntry && typeof revenueEntry.amount === 'number') {
          setRevenueEntries(prev => [...prev, { ...revenueEntry, timestamp: formatTimestamp(new Date()) }])
          const allocation = revenueEntry.pro_fund_allocation ?? (revenueEntry.amount * settings.pro_fund_percentage / 100)
          setProFundBalance(prev => prev + allocation)
          setConversionCount(prev => prev + 1)
        }

        // Process lead info
        if (leadInfo) {
          const sysMsg: ChatMessage = {
            id: generateId(),
            role: 'system',
            content: `Lead information captured for ${leadInfo.name}.`,
            timestamp: formatTimestamp(new Date()),
          }
          setChatMessages(prev => [...prev, sysMsg])
        }
      } else {
        const errMsg: ChatMessage = {
          id: generateId(),
          role: 'agent',
          content: result?.error || 'I apologize, but I encountered an issue processing your request. Please try again.',
          timestamp: formatTimestamp(new Date()),
        }
        setChatMessages(prev => [...prev, errMsg])
      }
    } catch {
      const errMsg: ChatMessage = {
        id: generateId(),
        role: 'agent',
        content: 'I apologize, but there was a connection issue. Please try again in a moment.',
        timestamp: formatTimestamp(new Date()),
      }
      setChatMessages(prev => [...prev, errMsg])
    } finally {
      setChatLoading(false)
      setActiveAgentId(null)
    }
  }, [chatInput, chatLoading, sessionId, settings.pro_fund_percentage])

  // Process approval
  const processApproval = useCallback(async (request: ApprovalRequest, decision: 'approved' | 'denied') => {
    const notes = approvalNotes[request.order_id ?? ''] ?? ''
    if (!notes.trim()) {
      setStatusMessage({ text: 'Please add notes before processing this approval.', type: 'error' })
      setTimeout(() => setStatusMessage(null), 3000)
      return
    }

    setProcessingApproval(request.order_id ?? '')
    setActiveAgentId(APPROVAL_HANDLER_AGENT_ID)

    try {
      const message = `Process ${decision} decision for ${request.request_type} request. Order: ${request.order_id}. Customer requested: ${request.desired_outcome}. Summary: ${request.summary}. Operator notes: ${notes}. Ticket: ${request.ticket_id ?? 'N/A'}.`
      const result = await callAIAgent(message, APPROVAL_HANDLER_AGENT_ID)

      if (result.success) {
        let parsed = result?.response?.result
        if (typeof parsed === 'string') {
          parsed = parseLLMJson(parsed)
        }

        const resolved: ResolvedApproval = {
          request,
          decision: parsed?.decision ?? decision,
          customer_response: parsed?.customer_response ?? `Request ${decision}.`,
          resolution_notes: parsed?.ticket_update?.resolution_notes ?? notes,
          operator_notes: parsed?.outcome_log?.operator_notes ?? notes,
          action_taken: parsed?.outcome_log?.action_taken ?? decision,
          resolved_at: formatTimestamp(new Date()),
        }

        setResolvedApprovals(prev => [...prev, resolved])
        setApprovalRequests(prev => prev.filter(r => r.order_id !== request.order_id))
        setApprovalNotes(prev => {
          const next = { ...prev }
          delete next[request.order_id ?? '']
          return next
        })

        // Update ticket status
        if (request.ticket_id) {
          const newStatus = parsed?.ticket_update?.new_status ?? (decision === 'approved' ? 'resolved' : 'denied')
          setTickets(prev => prev.map(t => t.ticket_id === request.ticket_id ? { ...t, status: newStatus as Ticket['status'] } : t))
        }

        setStatusMessage({ text: `Approval ${decision} successfully processed.`, type: 'success' })
        setTimeout(() => setStatusMessage(null), 3000)
      } else {
        setStatusMessage({ text: result?.error ?? 'Failed to process approval.', type: 'error' })
        setTimeout(() => setStatusMessage(null), 3000)
      }
    } catch {
      setStatusMessage({ text: 'Connection error while processing approval.', type: 'error' })
      setTimeout(() => setStatusMessage(null), 3000)
    } finally {
      setProcessingApproval(null)
      setActiveAgentId(null)
    }
  }, [approvalNotes])

  // Computed stats
  const activeTicketCount = useMemo(() => tickets.filter(t => t.status !== 'resolved').length, [tickets])
  const totalRevenue = useMemo(() => revenueEntries.reduce((sum, e) => sum + (e?.amount ?? 0), 0), [revenueEntries])
  const pendingApprovalCount = approvalRequests.length

  // Nav items config
  const navItems = useMemo(() => [
    { key: 'dashboard' as NavSection, icon: <FiHome className="w-5 h-5" />, label: 'Dashboard' },
    { key: 'chat' as NavSection, icon: <FiMessageSquare className="w-5 h-5" />, label: 'Support Chat' },
    { key: 'approvals' as NavSection, icon: <FiCheckCircle className="w-5 h-5" />, label: 'Approvals', badge: pendingApprovalCount > 0 ? pendingApprovalCount : undefined },
    { key: 'settings' as NavSection, icon: <FiSettings className="w-5 h-5" />, label: 'Settings' },
  ], [pendingApprovalCount])

  // ===================== RENDER =====================
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground flex" style={{ lineHeight: '1.65', letterSpacing: '0.01em' }}>
        {/* Sidebar */}
        <aside className={`${sidebarCollapsed ? 'w-16' : 'w-60'} flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 min-h-screen`}>
          {/* Brand */}
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                <BiSupport className="w-5 h-5 text-primary-foreground" />
              </div>
              {!sidebarCollapsed && (
                <div>
                  <h1 className="font-serif font-bold text-lg tracking-wide">Corey</h1>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Support Concierge</p>
                </div>
              )}
            </div>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeSection === item.key ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'}`}
              >
                {item.icon}
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{item.badge}</span>
                    )}
                  </>
                )}
              </button>
            ))}
          </nav>

          {/* Agent Status */}
          {!sidebarCollapsed && (
            <div className="p-3 border-t border-sidebar-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">Agent Status</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activeAgentId === CUSTOMER_SUPPORT_AGENT_ID ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                  <span className="text-muted-foreground truncate">Support Agent</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activeAgentId === APPROVAL_HANDLER_AGENT_ID ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                  <span className="text-muted-foreground truncate">Approval Handler</span>
                </div>
              </div>
            </div>
          )}

          {/* Collapse toggle */}
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-3 border-t border-sidebar-border text-muted-foreground hover:text-foreground transition-colors">
            {sidebarCollapsed ? <FiChevronDown className="w-4 h-4 rotate-[-90deg] mx-auto" /> : <FiChevronUp className="w-4 h-4 rotate-[-90deg] mx-auto" />}
          </button>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {/* Header */}
          <header className="h-14 border-b border-border/30 bg-card flex items-center justify-between px-6 flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="font-serif font-semibold text-lg tracking-wide capitalize">
                {activeSection === 'chat' ? 'Support Chat' : activeSection}
              </h2>
              {activeAgentId && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Agent Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Sample Data Toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs text-muted-foreground">Sample Data</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showSampleData}
                  onClick={() => setShowSampleData(!showSampleData)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showSampleData ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${showSampleData ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                </button>
              </label>
              {/* Notification Bell */}
              <button onClick={() => { setActiveSection('approvals'); setApprovalTab('pending') }} className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
                <FiBell className="w-5 h-5" />
                {notificationCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">{notificationCount}</span>
                )}
              </button>
            </div>
          </header>

          {/* Status Message Bar */}
          {statusMessage && (
            <div className={`px-6 py-2.5 text-sm flex items-center gap-2 ${statusMessage.type === 'success' ? 'bg-green-50 text-green-800 border-b border-green-200' : statusMessage.type === 'error' ? 'bg-red-50 text-red-800 border-b border-red-200' : 'bg-blue-50 text-blue-800 border-b border-blue-200'}`}>
              {statusMessage.type === 'success' ? <FiCheckCircle className="w-4 h-4" /> : statusMessage.type === 'error' ? <FiAlertCircle className="w-4 h-4" /> : <FiBell className="w-4 h-4" />}
              {statusMessage.text}
              <button onClick={() => setStatusMessage(null)} className="ml-auto"><FiX className="w-4 h-4" /></button>
            </div>
          )}

          {/* Content Area */}
          <main className="flex-1 overflow-y-auto">
            {/* ========== DASHBOARD ========== */}
            {activeSection === 'dashboard' && (
              <div className="p-6 pb-20 space-y-6 max-w-7xl mx-auto">
                {/* Pro Fund Notification Banner */}
                {proFundReady && (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <FiAlertCircle className="w-5 h-5 text-amber-700" />
                    </div>
                    <div className="flex-1">
                      <p className="font-serif font-semibold text-sm">Pro Fund Threshold Reached</p>
                      <p className="text-xs text-muted-foreground">Balance: ${proFundBalance.toFixed(2)} with {conversionCount} conversions in the last {settings.time_window_days} days. Ready for payout.</p>
                    </div>
                    <button className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors">
                      Process Payout
                    </button>
                  </div>
                )}

                {/* Stat Cards */}
                {dashboardLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard icon={<HiOutlineTicket className="w-5 h-5" />} label="Active Tickets" value={activeTicketCount} subtitle={`${tickets.length} total`} />
                    <StatCard icon={<FiDollarSign className="w-5 h-5" />} label="Revenue Today" value={`$${totalRevenue.toFixed(0)}`} subtitle={`${revenueEntries.length} transactions`} />
                    <StatCard icon={<FiShield className="w-5 h-5" />} label="Pro Fund Balance" value={`$${proFundBalance.toFixed(2)}`} subtitle={`${settings.pro_fund_percentage}% allocation`} />
                    <StatCard icon={<FiAlertCircle className="w-5 h-5" />} label="Pending Approvals" value={pendingApprovalCount} subtitle={pendingApprovalCount === 0 ? 'All clear' : 'Needs attention'} />
                  </div>
                )}

                {/* Two Column Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Recent Tickets */}
                  <div className="bg-card rounded-lg shadow-sm border border-border/30 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-serif font-semibold text-base tracking-wide">Recent Tickets</h3>
                      <span className="text-xs text-muted-foreground">{tickets.length} total</span>
                    </div>
                    {tickets.length === 0 ? (
                      <div className="text-center py-8">
                        <HiOutlineTicket className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No tickets yet. Chat with customers to create tickets.</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {tickets.map(ticket => (
                          <div key={ticket.ticket_id} className="p-3 bg-background rounded-lg border border-border/20 hover:border-border/40 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-mono text-xs text-primary font-medium">{ticket.ticket_id}</span>
                                  <StatusBadge status={ticket.status} />
                                </div>
                                <p className="text-sm font-medium truncate">{ticket.subject}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <CategoryBadge category={ticket.category} />
                                  <PriorityIndicator priority={ticket.priority} />
                                  {ticket.created_at && <span className="text-[10px] text-muted-foreground">{ticket.created_at}</span>}
                                </div>
                              </div>
                              <button onClick={() => { setActiveSection('chat'); setIsOperatorMode(true) }} className="px-2 py-1 text-xs border border-border/40 rounded-md hover:bg-secondary transition-colors flex-shrink-0">
                                Take Over
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pro Fund & Revenue */}
                  <div className="space-y-6">
                    {/* Pro Fund Progress */}
                    <div className="bg-card rounded-lg shadow-sm border border-border/30 p-5">
                      <h3 className="font-serif font-semibold text-base tracking-wide mb-3">Pro Fund Progress</h3>
                      <div className="space-y-3">
                        <div className="flex items-end justify-between">
                          <span className="text-2xl font-serif font-bold">${proFundBalance.toFixed(2)}</span>
                          <span className="text-xs text-muted-foreground">of ${settings.pro_fund_threshold} threshold</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (proFundBalance / Math.max(settings.pro_fund_threshold, 1)) * 100)}%`, backgroundColor: 'hsl(43 75% 38%)' }} />
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{conversionCount} conversion{conversionCount !== 1 ? 's' : ''} in {settings.time_window_days} days</span>
                          <span>Need {settings.conversion_count_threshold} for payout</span>
                        </div>
                      </div>
                    </div>

                    {/* Revenue Feed */}
                    <div className="bg-card rounded-lg shadow-sm border border-border/30 p-5">
                      <h3 className="font-serif font-semibold text-base tracking-wide mb-3">Revenue Activity</h3>
                      {revenueEntries.length === 0 ? (
                        <div className="text-center py-6">
                          <FiDollarSign className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No revenue yet. Upsell offers will appear here.</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-48 overflow-y-auto">
                          {revenueEntries.map((entry, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2.5 bg-background rounded-lg border border-border/20">
                              <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-green-50 rounded">
                                  <FiDollarSign className="w-3.5 h-3.5 text-green-600" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{entry?.product ?? 'Product'}</p>
                                  <p className="text-[10px] text-muted-foreground">{entry?.timestamp ?? ''}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold">${(entry?.amount ?? 0).toFixed(0)}</p>
                                <p className="text-[10px] font-medium" style={{ color: 'hsl(43 75% 38%)' }}>+${(entry?.pro_fund_allocation ?? 0).toFixed(2)} fund</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========== SUPPORT CHAT ========== */}
            {activeSection === 'chat' && (
              <div className="flex flex-col h-[calc(100vh-3.5rem)] relative">
                {/* Operator mode banner */}
                {isOperatorMode && (
                  <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-sm flex-shrink-0">
                    <FiUser className="w-4 h-4 text-amber-700" />
                    <span className="text-amber-800 font-medium">Operator Mode</span>
                    <span className="text-amber-600 text-xs">-- You are responding directly as the operator</span>
                    <button onClick={() => setIsOperatorMode(false)} className="ml-auto text-xs text-amber-700 hover:text-amber-900 underline">Switch to AI</button>
                  </div>
                )}

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {chatMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <BiSupport className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="font-serif font-semibold text-lg mb-1">Welcome to Corey Support</h3>
                      <p className="text-sm text-muted-foreground max-w-sm">{settings.greeting}</p>
                      <p className="text-xs text-muted-foreground mt-4">Type a message below to start a conversation with our AI support agent.</p>
                    </div>
                  )}

                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'}`}>
                      {msg.role === 'system' ? (
                        <div className="bg-secondary/50 text-muted-foreground text-xs px-4 py-2 rounded-full max-w-md text-center flex items-center gap-1.5">
                          <FiBell className="w-3 h-3 flex-shrink-0" />
                          <span>{msg.content}</span>
                        </div>
                      ) : msg.role === 'user' ? (
                        <div className="max-w-md">
                          <div className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-br-sm text-sm">
                            {msg.content}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1 text-right">{msg.timestamp}</p>
                        </div>
                      ) : (
                        <div className="max-w-lg">
                          <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <BiSupport className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="bg-card border border-border/30 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm">
                                <div className="text-sm">{renderMarkdown(msg.content)}</div>
                                {/* Citations */}
                                {Array.isArray(msg.citations) && msg.citations.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-border/20">
                                    {msg.citations.map((c, ci) => (
                                      <CitationMarker key={ci} citation={c} index={ci} />
                                    ))}
                                  </div>
                                )}
                              </div>
                              {/* Ticket card */}
                              {msg.ticket && <TicketSystemCard ticket={msg.ticket} />}
                              {/* Upsell offer */}
                              {msg.upsell_offer && <UpsellCard offer={msg.upsell_offer} />}
                              {/* Lead capture */}
                              {msg.lead_info && <LeadCaptureCard leadInfo={msg.lead_info} />}
                              <p className="text-[10px] text-muted-foreground mt-1">{msg.timestamp}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {chatLoading && <TypingIndicator />}
                  <div ref={chatEndRef} />
                </div>

                {/* Operator Take Over FAB */}
                {!isOperatorMode && chatMessages.length > 0 && (
                  <button onClick={() => setIsOperatorMode(true)} className="absolute bottom-[120px] right-6 bg-card border border-border/40 shadow-lg rounded-full px-3 py-2 flex items-center gap-2 text-xs font-medium hover:bg-secondary transition-colors z-10">
                    <FiUser className="w-3.5 h-3.5" />
                    Take Over
                  </button>
                )}

                {/* Chat Input */}
                <div className="border-t border-border/30 bg-card px-6 py-3 pb-[72px] flex-shrink-0">
                  <div className="flex items-end gap-3 max-w-4xl mx-auto">
                    <div className="flex-1">
                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                        placeholder={isOperatorMode ? 'Type your operator response...' : 'Type your message...'}
                        rows={1}
                        className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[42px] max-h-32"
                      />
                    </div>
                    <button onClick={sendMessage} disabled={!chatInput.trim() || chatLoading} className="p-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
                      <FiSend className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ========== APPROVALS ========== */}
            {activeSection === 'approvals' && (
              <div className="p-6 pb-20 max-w-4xl mx-auto space-y-6">
                {/* Tabs */}
                <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg w-fit">
                  <button onClick={() => setApprovalTab('pending')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${approvalTab === 'pending' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    Pending {approvalRequests.length > 0 && <span className="ml-1 bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">{approvalRequests.length}</span>}
                  </button>
                  <button onClick={() => setApprovalTab('resolved')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${approvalTab === 'resolved' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    Resolved {resolvedApprovals.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({resolvedApprovals.length})</span>}
                  </button>
                </div>

                {/* Pending Tab */}
                {approvalTab === 'pending' && (
                  <div className="space-y-4">
                    {approvalRequests.length === 0 ? (
                      <div className="bg-card rounded-lg shadow-sm border border-border/30 p-12 text-center">
                        <FiCheckCircle className="w-10 h-10 text-green-500/40 mx-auto mb-3" />
                        <p className="font-serif font-semibold text-base mb-1">No pending approvals</p>
                        <p className="text-sm text-muted-foreground">All clear! Approvals will appear here when customers request refunds or account changes.</p>
                      </div>
                    ) : (
                      approvalRequests.map((req, idx) => (
                        <div key={req.order_id ?? idx} className="bg-card rounded-lg shadow-sm border border-border/30 p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-serif font-semibold text-sm">{req.customer_name ?? 'Customer'}</h4>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${req.request_type === 'refund' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                                  {(req.request_type ?? '').replace(/_/g, ' ')}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                {req.ticket_id && <span className="font-mono">{req.ticket_id}</span>}
                                {req.order_id && <span>Order {req.order_id}</span>}
                                {req.timestamp && <span className="flex items-center gap-1"><FiClock className="w-3 h-3" />{req.timestamp}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2 mb-4">
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Summary</p>
                              <p className="text-sm">{req.summary ?? ''}</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Reason</p>
                                <p className="text-sm">{req.reason ?? ''}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Desired Outcome</p>
                                <p className="text-sm">{req.desired_outcome ?? ''}</p>
                              </div>
                            </div>
                          </div>

                          <div className="mb-3">
                            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Operator Notes *</label>
                            <textarea
                              value={approvalNotes[req.order_id ?? ''] ?? ''}
                              onChange={(e) => setApprovalNotes(prev => ({ ...prev, [req.order_id ?? '']: e.target.value }))}
                              placeholder="Add your notes before approving or denying..."
                              rows={2}
                              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/30"
                            />
                          </div>

                          <div className="flex gap-3">
                            <button
                              onClick={() => processApproval(req, 'approved')}
                              disabled={processingApproval === req.order_id}
                              className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {processingApproval === req.order_id ? (
                                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                              ) : (
                                <><FiCheckCircle className="w-4 h-4" /> Approve</>
                              )}
                            </button>
                            <button
                              onClick={() => processApproval(req, 'denied')}
                              disabled={processingApproval === req.order_id}
                              className="flex-1 py-2 bg-destructive text-destructive-foreground text-sm font-medium rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {processingApproval === req.order_id ? (
                                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                              ) : (
                                <><FiX className="w-4 h-4" /> Deny</>
                              )}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Resolved Tab */}
                {approvalTab === 'resolved' && (
                  <div className="space-y-4">
                    {resolvedApprovals.length === 0 ? (
                      <div className="bg-card rounded-lg shadow-sm border border-border/30 p-12 text-center">
                        <HiOutlineDocumentText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="font-serif font-semibold text-base mb-1">No resolved approvals</p>
                        <p className="text-sm text-muted-foreground">Processed approvals will appear here with full details.</p>
                      </div>
                    ) : (
                      resolvedApprovals.map((ra, idx) => (
                        <div key={idx} className="bg-card rounded-lg shadow-sm border border-border/30 p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-serif font-semibold text-sm">{ra.request?.customer_name ?? 'Customer'}</h4>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ra.decision === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                  {ra.decision ?? 'N/A'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="capitalize">{(ra.request?.request_type ?? '').replace(/_/g, ' ')}</span>
                                {ra.request?.order_id && <span>Order {ra.request.order_id}</span>}
                                <span className="flex items-center gap-1"><FiClock className="w-3 h-3" />{ra.resolved_at}</span>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Customer Response</p>
                              <p>{ra.customer_response}</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Resolution Notes</p>
                                <p>{ra.resolution_notes}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Action Taken</p>
                                <p className="capitalize">{ra.action_taken}</p>
                              </div>
                            </div>
                            {ra.operator_notes && (
                              <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Operator Notes</p>
                                <p>{ra.operator_notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ========== SETTINGS ========== */}
            {activeSection === 'settings' && (
              <div className="p-6 pb-20 max-w-3xl mx-auto space-y-6">
                {/* Settings Tabs */}
                <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg w-fit flex-wrap">
                  {(['general', 'products', 'revenue', 'notifications'] as const).map(tab => (
                    <button key={tab} onClick={() => setSettingsTab(tab)} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${settingsTab === tab ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                      {tab}
                    </button>
                  ))}
                </div>

                {/* General Settings */}
                {settingsTab === 'general' && (
                  <div className="space-y-6">
                    <div className="bg-card rounded-lg shadow-sm border border-border/30 p-5">
                      <h3 className="font-serif font-semibold text-base tracking-wide mb-4">Agent Configuration</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">Greeting Message</label>
                          <textarea
                            value={settings.greeting}
                            onChange={(e) => setSettings(prev => ({ ...prev, greeting: e.target.value }))}
                            rows={3}
                            className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/30"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-card rounded-lg shadow-sm border border-border/30 p-5">
                      <h3 className="font-serif font-semibold text-base tracking-wide mb-4">Knowledge Base</h3>
                      <p className="text-sm text-muted-foreground mb-4">Upload documents to train the support agent on your product, policies, and procedures.</p>
                      <KnowledgeBaseUpload ragId={RAG_ID} />
                    </div>
                  </div>
                )}

                {/* Products Settings */}
                {settingsTab === 'products' && (
                  <div className="bg-card rounded-lg shadow-sm border border-border/30 p-5">
                    <h3 className="font-serif font-semibold text-base tracking-wide mb-4">Product Checkout URLs</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">Concierge Setup ($97)</label>
                        <input
                          type="url"
                          value={settings.concierge_checkout_url}
                          onChange={(e) => setSettings(prev => ({ ...prev, concierge_checkout_url: e.target.value }))}
                          placeholder="https://checkout.stripe.com/..."
                          className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">Add-On Pack ($25)</label>
                        <input
                          type="url"
                          value={settings.addon_checkout_url}
                          onChange={(e) => setSettings(prev => ({ ...prev, addon_checkout_url: e.target.value }))}
                          placeholder="https://checkout.stripe.com/..."
                          className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Revenue Settings */}
                {settingsTab === 'revenue' && (
                  <div className="bg-card rounded-lg shadow-sm border border-border/30 p-5">
                    <h3 className="font-serif font-semibold text-base tracking-wide mb-4">Revenue Configuration</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">Google Sheets Connection URL</label>
                        <input
                          type="url"
                          value={settings.sheets_url}
                          onChange={(e) => setSettings(prev => ({ ...prev, sheets_url: e.target.value }))}
                          placeholder="https://docs.google.com/spreadsheets/d/..."
                          className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">Pro Fund Percentage</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={settings.pro_fund_percentage}
                            onChange={(e) => setSettings(prev => ({ ...prev, pro_fund_percentage: Number(e.target.value) || 0 }))}
                            className="w-24 bg-background border border-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                          />
                          <span className="text-sm text-muted-foreground">% of each sale allocated to Pro Fund</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notifications Settings */}
                {settingsTab === 'notifications' && (
                  <div className="bg-card rounded-lg shadow-sm border border-border/30 p-5">
                    <h3 className="font-serif font-semibold text-base tracking-wide mb-4">Notification Rules</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">Pro Fund Threshold Amount ($)</label>
                        <input
                          type="number"
                          min={0}
                          value={settings.pro_fund_threshold}
                          onChange={(e) => setSettings(prev => ({ ...prev, pro_fund_threshold: Number(e.target.value) || 0 }))}
                          className="w-32 bg-background border border-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">Minimum Conversions for Payout</label>
                        <input
                          type="number"
                          min={0}
                          value={settings.conversion_count_threshold}
                          onChange={(e) => setSettings(prev => ({ ...prev, conversion_count_threshold: Number(e.target.value) || 0 }))}
                          className="w-32 bg-background border border-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">Time Window (Days)</label>
                        <input
                          type="number"
                          min={1}
                          value={settings.time_window_days}
                          onChange={(e) => setSettings(prev => ({ ...prev, time_window_days: Number(e.target.value) || 1 }))}
                          className="w-32 bg-background border border-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <div className="flex items-center gap-3">
                  <button onClick={saveSettings} className="px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
                    Save Settings
                  </button>
                  {settingsSaved && (
                    <span className="text-sm text-green-700 flex items-center gap-1">
                      <FiCheckCircle className="w-4 h-4" /> Settings saved
                    </span>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}
