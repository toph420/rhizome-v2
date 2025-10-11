'use client'

import { motion } from 'framer-motion'
import { Info, ThumbsUp, ThumbsDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

/* =====================================================
   TRADING CARD (Buy/Sell)
   ===================================================== */

interface TradingCardProps {
  type: 'buy' | 'sell'
  price: string
  priceUnit: string
  amount: string
  amountUnit: string
  onTrade?: () => void
}

export function TradingCard({ type, price, priceUnit, amount, amountUnit, onTrade }: TradingCardProps) {
  const isBuy = type === 'buy'
  const cardClass = isBuy ? 'brutalist-card-buy' : 'brutalist-card-sell'

  return (
    <motion.div
      className={cn('brutalist-card brutalist-layers', cardClass)}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="brutalist-heading text-2xl">
          {isBuy ? 'BUY' : 'SELL'}
        </h3>
        <button className="hover:opacity-70 transition-opacity">
          <Info className="h-5 w-5" />
        </button>
      </div>

      {/* Price Field */}
      <div className="mb-4">
        <div className="brutalist-label mb-2">Price</div>
        <div className="flex items-baseline gap-2">
          <span className="brutalist-value text-2xl">{price}</span>
          <span className="brutalist-label">{priceUnit}</span>
        </div>
      </div>

      {/* Amount Field */}
      <div className="mb-6">
        <div className="brutalist-label mb-2">Amount</div>
        <div className="flex items-baseline gap-2">
          <span className="brutalist-value text-2xl">{amount}</span>
          <span className="brutalist-label">{amountUnit}</span>
        </div>
      </div>

      {/* Trade Button with Diamonds */}
      <div className="flex items-center justify-center gap-4">
        {/* Left Diamond */}
        <div className="brutalist-diamond-outline" />

        {/* Horizontal Line */}
        <div className="brutalist-line-h" />

        {/* Button */}
        <motion.button
          className="brutalist-button brutalist-rounded-none"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onTrade}
        >
          {isBuy ? 'BUY' : 'SELL'}
        </motion.button>

        {/* Horizontal Line */}
        <div className="brutalist-line-h" />

        {/* Right Diamond */}
        <div className="brutalist-diamond-outline" />
      </div>
    </motion.div>
  )
}

/* =====================================================
   CALLOUT PANEL (Question/Voting)
   ===================================================== */

interface CalloutPanelProps {
  icon?: React.ReactNode
  question: string
  subtitle?: string
  onVote?: (vote: 'good' | 'bad') => void
  className?: string
}

export function CalloutPanel({ icon, question, subtitle, onVote, className }: CalloutPanelProps) {
  const [voted, setVoted] = useState<'good' | 'bad' | null>(null)

  const handleVote = (vote: 'good' | 'bad') => {
    setVoted(vote)
    onVote?.(vote)
  }

  return (
    <div className={cn('brutalist-callout relative', className)}>
      {/* Icon */}
      {icon && (
        <div className="brutalist-callout-icon">
          {icon}
        </div>
      )}

      {/* Content */}
      <div className={cn(icon ? 'brutalist-callout-content' : '')}>
        <div className="space-y-4">
          <div>
            <h4 className="font-bold text-lg text-brutalist-text mb-1">
              {question}
            </h4>
            {subtitle && (
              <p className="text-sm text-brutalist-text-dim">
                {subtitle}
              </p>
            )}
          </div>

          {/* Vote Buttons */}
          <div className="flex gap-3">
            <motion.button
              className={cn(
                'brutalist-icon-button brutalist-rounded-none flex items-center gap-2',
                voted === 'good' && 'bg-green-50'
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleVote('good')}
            >
              <ThumbsUp className="h-4 w-4" />
              <span>GOOD</span>
            </motion.button>

            <motion.button
              className={cn(
                'brutalist-icon-button brutalist-rounded-none flex items-center gap-2',
                voted === 'bad' && 'bg-red-50'
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleVote('bad')}
            >
              <ThumbsDown className="h-4 w-4" />
              <span>BAD</span>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* =====================================================
   BRUTALIST BUTTON
   ===================================================== */

interface BrutalistButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  onClick?: () => void
  className?: string
}

export function BrutalistButton({ children, variant = 'primary', onClick, className }: BrutalistButtonProps) {
  return (
    <motion.button
      className={cn(
        'brutalist-button brutalist-rounded-none',
        variant === 'secondary' && 'bg-white text-brutalist-text',
        className
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      {children}
    </motion.button>
  )
}

/* =====================================================
   BRUTALIST INPUT
   ===================================================== */

interface BrutalistInputProps {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  suffix?: string
}

export function BrutalistInput({ label, value, onChange, placeholder, type = 'text', suffix }: BrutalistInputProps) {
  return (
    <div className="space-y-2">
      {label && <div className="brutalist-label">{label}</div>}
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="brutalist-input brutalist-rounded-none w-full pr-16"
        />
        {suffix && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 brutalist-label">
            {suffix}
          </div>
        )}
      </div>
    </div>
  )
}

/* =====================================================
   TRADING PAIR SHOWCASE
   ===================================================== */

export function TradingPair() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <TradingCard
        type="buy"
        price="165.09"
        priceUnit="(USDT)"
        amount="1.00"
        amountUnit="SUPP"
        onTrade={() => alert('Buy order placed!')}
      />
      <TradingCard
        type="sell"
        price="1.00"
        priceUnit="SUPP"
        amount="165.09"
        amountUnit="(USDT)"
        onTrade={() => alert('Sell order placed!')}
      />
    </div>
  )
}

/* =====================================================
   FEEDBACK PANEL SHOWCASE
   ===================================================== */

export function FeedbackPanel() {
  const SunIcon = () => (
    <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="8" fill="#f4c542" stroke="#000" strokeWidth="2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180
        const x1 = 20 + Math.cos(rad) * 12
        const y1 = 20 + Math.sin(rad) * 12
        const x2 = 20 + Math.cos(rad) * 16
        const y2 = 20 + Math.sin(rad) * 16
        return (
          <line
            key={angle}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#000"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )

  return (
    <CalloutPanel
      icon={<SunIcon />}
      question="How do you feel about Support coin today?"
      subtitle="Vote to see community results"
      onVote={(vote) => console.log(`Voted: ${vote}`)}
    />
  )
}

/* =====================================================
   INTERACTIVE FORM DEMO
   ===================================================== */

export function BrutalistFormDemo() {
  const [buyPrice, setBuyPrice] = useState('165.09')
  const [buyAmount, setBuyAmount] = useState('1.00')

  return (
    <div className="brutalist-card brutalist-card-buy brutalist-shadow max-w-md">
      <h3 className="brutalist-heading text-2xl mb-6">PLACE ORDER</h3>

      <div className="space-y-4">
        <BrutalistInput
          label="Price"
          value={buyPrice}
          onChange={setBuyPrice}
          suffix="USDT"
          type="number"
        />

        <BrutalistInput
          label="Amount"
          value={buyAmount}
          onChange={setBuyAmount}
          suffix="SUPP"
          type="number"
        />

        <div className="brutalist-divider" />

        <div className="flex items-baseline justify-between">
          <span className="brutalist-label">Total</span>
          <span className="brutalist-value text-xl">
            {(parseFloat(buyPrice) * parseFloat(buyAmount)).toFixed(2)} USDT
          </span>
        </div>

        <div className="flex gap-3 pt-4">
          <BrutalistButton className="flex-1">
            EXECUTE
          </BrutalistButton>
          <BrutalistButton variant="secondary">
            CANCEL
          </BrutalistButton>
        </div>
      </div>
    </div>
  )
}

/* =====================================================
   BRUTALIST TABLE
   ===================================================== */

interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  render?: (value: any, row: any) => React.ReactNode
}

interface BrutalistTableProps {
  columns: TableColumn[]
  data: any[]
  className?: string
}

export function BrutalistTable({ columns, data, className }: BrutalistTableProps) {
  return (
    <div className={cn('brutalist-border bg-white overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* Header */}
          <thead>
            <tr className="border-b-3 border-brutalist-border">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-4 py-3 brutalist-label',
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    column.align === 'left' && 'text-left',
                    !column.align && 'text-left'
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  'border-b border-gray-200 hover:bg-gray-50 transition-colors',
                  rowIndex % 2 === 0 && 'bg-white',
                  rowIndex % 2 === 1 && 'bg-gray-50/30'
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3 text-sm',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.align === 'left' && 'text-left',
                      !column.align && 'text-left'
                    )}
                  >
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* =====================================================
   BRUTALIST PAGINATION
   ===================================================== */

interface BrutalistPaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

export function BrutalistPagination({ currentPage, totalPages, onPageChange, className }: BrutalistPaginationProps) {
  return (
    <div className={cn('flex items-center justify-center gap-3', className)}>
      {/* Previous Button */}
      <motion.button
        className="brutalist-icon-button brutalist-rounded-none bg-[#e86c5d] text-white border-brutalist-border w-12 h-12 flex items-center justify-center disabled:opacity-50"
        whileHover={{ scale: currentPage > 1 ? 1.02 : 1 }}
        whileTap={{ scale: currentPage > 1 ? 0.98 : 1 }}
        onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        <ChevronLeft className="h-5 w-5" />
      </motion.button>

      {/* Filter/Options Button */}
      <motion.button
        className="brutalist-icon-button brutalist-rounded-none bg-white border-brutalist-border px-6 h-12"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <span className="font-semibold">Filter</span>
      </motion.button>

      {/* Next Button */}
      <motion.button
        className="brutalist-icon-button brutalist-rounded-none bg-[#f4c542] text-black border-brutalist-border w-12 h-12 flex items-center justify-center disabled:opacity-50"
        whileHover={{ scale: currentPage < totalPages ? 1.02 : 1 }}
        whileTap={{ scale: currentPage < totalPages ? 0.98 : 1 }}
        onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        <ChevronRight className="h-5 w-5" />
      </motion.button>
    </div>
  )
}

/* =====================================================
   CRYPTO TABLE SHOWCASE
   ===================================================== */

export function CryptoTable() {
  const [currentPage, setCurrentPage] = useState(1)

  const columns: TableColumn[] = [
    { key: 'rank', label: '#', align: 'left' },
    { key: 'name', label: 'Name', align: 'left' },
    {
      key: 'price',
      label: 'Price',
      align: 'right',
      render: (value) => `$${value.toLocaleString()}`,
    },
    {
      key: 'change24h',
      label: '24h %',
      align: 'right',
      render: (value) => (
        <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
          {value >= 0 ? '▲' : '▼'}{Math.abs(value).toFixed(2)}%
        </span>
      ),
    },
    {
      key: 'change7d',
      label: '7d %',
      align: 'right',
      render: (value) => (
        <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
          {value >= 0 ? '▲' : '▼'}{Math.abs(value).toFixed(2)}%
        </span>
      ),
    },
    {
      key: 'marketCap',
      label: 'Market cap',
      align: 'right',
      render: (value) => `$${value.toLocaleString()}`,
    },
    {
      key: 'volume',
      label: 'Volume(24h)',
      align: 'right',
      render: (value) => `$${value.toLocaleString()}`,
    },
    {
      key: 'favorite',
      label: '',
      align: 'center',
      render: (value, row) =>
        row.rank === 1 ? (
          <span className="text-2xl">🌟</span>
        ) : null,
    },
  ]

  const data = [
    {
      rank: 1,
      name: 'Spectrum',
      price: 84554.8,
      change24h: 3.58,
      change7d: 23.51,
      marketCap: 1049111170922,
      volume: 1558291606,
    },
    {
      rank: 2,
      name: 'Hugo Coin',
      price: 5200.63,
      change24h: 8.5,
      change7d: -2.5,
      marketCap: 429010590465,
      volume: 939421255,
    },
    {
      rank: 3,
      name: 'Marlett',
      price: 125.12,
      change24h: 1.9,
      change7d: 4.9,
      marketCap: 71419284669,
      volume: 1335270804,
    },
    {
      rank: 4,
      name: 'Ink INU',
      price: 503.58,
      change24h: 16.2,
      change7d: 9.23,
      marketCap: 10236096863,
      volume: 1973170767,
    },
    {
      rank: 5,
      name: 'Microlite',
      price: 1.0,
      change24h: 0.05,
      change7d: 1.5,
      marketCap: 7055146334,
      volume: 3105032671,
    },
    {
      rank: 6,
      name: 'Airpo Coin',
      price: 45248.4,
      change24h: 1.72,
      change7d: 58.27,
      marketCap: 4901851938,
      volume: 1442106996,
    },
    {
      rank: 7,
      name: 'Support Coin',
      price: 165.25,
      change24h: 45.01,
      change7d: 225.02,
      marketCap: 4591182715,
      volume: 330941016,
    },
    {
      rank: 8,
      name: 'Oppino Token',
      price: 804.42,
      change24h: 17.55,
      change7d: 0.17,
      marketCap: 4559203521,
      volume: 572926864,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Decorative Sun Icons */}
      <div className="relative">
        {/* Left Sun */}
        <div className="absolute -left-8 top-1/2 -translate-y-1/2">
          <svg className="w-12 h-12" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="6" fill="#e86c5d" stroke="#000" strokeWidth="2" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
              const rad = (angle * Math.PI) / 180
              const x1 = 20 + Math.cos(rad) * 9
              const y1 = 20 + Math.sin(rad) * 9
              const x2 = 20 + Math.cos(rad) * 14
              const y2 = 20 + Math.sin(rad) * 14
              return (
                <line
                  key={angle}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#000"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )
            })}
          </svg>
        </div>

        {/* Right Sun */}
        <div className="absolute -right-8 top-8">
          <svg className="w-12 h-12" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="6" fill="#f4c542" stroke="#000" strokeWidth="2" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
              const rad = (angle * Math.PI) / 180
              const x1 = 20 + Math.cos(rad) * 9
              const y1 = 20 + Math.sin(rad) * 9
              const x2 = 20 + Math.cos(rad) * 14
              const y2 = 20 + Math.sin(rad) * 14
              return (
                <line
                  key={angle}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#000"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )
            })}
          </svg>
        </div>

        <BrutalistTable columns={columns} data={data} />
      </div>

      <BrutalistPagination
        currentPage={currentPage}
        totalPages={5}
        onPageChange={setCurrentPage}
      />
    </div>
  )
}
