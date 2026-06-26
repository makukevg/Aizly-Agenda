'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { usePathname } from 'next/navigation'

const navItems = [
    {
        id: 'agenda',
        label: 'Agenda',
        href: '/agenda',
        icon: (
            <>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
            </>
        ),
    },
    {
        id: 'pacientes',
        label: 'Pacientes',
        href: '/pacientes',
        icon: (
            <>
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </>
        ),
    },
    {
        id: 'doctores',
        label: 'Doctores',
        href: '/doctores',
        icon: (
            <>
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </>
        ),
    },
    {
        id: 'metricas',
        label: 'Métricas',
        href: '/metricas',
        icon: (
            <>
                <path d="M18 20V10M12 20V4M6 20v-6" />
            </>
        ),
    },
    {
        id: 'recordatorios',
        label: 'Recordatorios',
        href: '/recordatorios',
        icon: (
            <>
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.72A2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.29 6.29l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </>
        ),
    },
]

export function Sidebar({ clinicName }: { clinicName: string }) {
    const { theme, setTheme } = useTheme()
    const pathname = usePathname()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const isDark = mounted && theme === 'dark'

    return (
        <aside className="w-[240px] min-w-[240px] h-screen flex flex-col bg-[#0F0F10] border-r border-white/5">
            <div className="px-5 py-4 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-sm">A</span>
                </div>
                <span className="text-white font-semibold text-[15px]">Aizly</span>
            </div>

            <nav className="flex-1 px-3 py-2 space-y-0.5">
                {navItems.map((item) => {
                    const active = pathname === item.href
                    return (
                        <a
                            key={item.id}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${active
                                ? 'bg-white/10 text-white'
                                : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                                {item.icon}
                            </svg>
                            {item.label}
                        </a>
                    )
                })}

                <div className="!my-3 border-t border-white/5" />

                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                    Configuración
                </button>
            </nav>

            <div className="px-3 pb-2 space-y-0.5">
                <button
                    onClick={() => setTheme(isDark ? 'light' : 'dark')}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                    {isDark ? (
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="5" />
                            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                        </svg>
                    ) : (
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                        </svg>
                    )}
                    {isDark ? 'Modo claro' : 'Modo oscuro'}
                </button>

                <div className="border-t border-white/5 my-2" />

                <div className="flex items-center gap-3 px-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-medium">
                            {clinicName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-white text-sm truncate leading-tight">{clinicName}</p>
                    </div>
                </div>
            </div>
        </aside>
    )
}