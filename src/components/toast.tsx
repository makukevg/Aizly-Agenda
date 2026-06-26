'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

type ToastFn = (msg: string) => void
const ToastContext = createContext<ToastFn>(() => { })
export function useToast() { return useContext(ToastContext) }

export function ToastProvider({ children }: { children: ReactNode }) {
    const [visible, setVisible] = useState(false)
    const [msg, setMsg] = useState('')
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const show: ToastFn = useCallback((m) => {
        if (timerRef.current) clearTimeout(timerRef.current)
        setMsg(m)
        setVisible(true)
        timerRef.current = setTimeout(() => setVisible(false), 2500)
    }, [])

    return (
        <ToastContext.Provider value={show}>
            {children}
            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg shadow-lg transition-all duration-300 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0 pointer-events-none'
                }`}>
                {msg}
            </div>
        </ToastContext.Provider>
    )
}