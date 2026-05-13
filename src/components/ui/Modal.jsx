import { X } from 'lucide-react'
import { Button } from './Button'

export function Modal({ open, title, description, children, onClose, size = 'lg', footer }) {
  if (!open) return null
  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[min(1400px,calc(100vw-24px))]',
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/75 p-2 pt-4 backdrop-blur-sm sm:p-3 md:p-6" role="dialog" aria-modal="true">
      <div className={`panel w-[calc(100vw-16px)] ${sizes[size]} rounded-lg md:w-[calc(100vw-48px)]`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#111118]/95 p-4 backdrop-blur-xl">
          <div>
            <h2 className="font-display text-xl font-bold text-white">{title}</h2>
            {description ? <p className="mt-1 text-sm text-white/50">{description}</p> : null}
          </div>
          <Button type="button" variant="ghost" className="px-3" onClick={onClose} aria-label="Cerrar modal" icon={X} />
        </div>
        <div className="p-4">{children}</div>
        {footer ? <div className="sticky bottom-0 border-t border-white/10 bg-[#111118]/95 p-4 backdrop-blur-xl">{footer}</div> : null}
      </div>
    </div>
  )
}
