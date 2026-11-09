import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Hộp thoại rộng (xem trước tài liệu). */
  wide?: boolean
}

/** Hộp thoại gốc <dialog>: có sẵn bẫy focus, đóng bằng Esc, trả focus về nút đã mở. */
export function Modal({ open, title, onClose, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    else if (!open && dlg.open) dlg.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className={`m-auto ${wide ? 'w-[min(56rem,calc(100vw-2rem))]' : 'w-[min(28rem,calc(100vw-2rem))]'} rounded-[var(--r-lg)] border border-line bg-surface p-6 text-ink backdrop:bg-black/40`}
    >
      <h2 className="section-title">{title}</h2>
      {open && <div className="mt-4">{children}</div>}
    </dialog>
  )
}
