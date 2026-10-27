import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import type { ReactNode } from "react"

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-(--app-surface) p-5 shadow-xl"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="mb-3 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-sm font-semibold text-(--app-text)">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-xs text-(--app-text-muted)">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded p-1 text-(--app-text-muted) hover:bg-black/5">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
