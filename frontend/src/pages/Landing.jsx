import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  PhoneIcon, CpuChipIcon, LinkIcon, ChartBarIcon, GlobeAltIcon, InboxIcon,
  TruckIcon, HomeModernIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { WaveformIcon } from '../components/Sidebar'
import Reveal from '../components/Reveal'
import LanguageSwitcher from '../components/LanguageSwitcher'

const FEATURE_ICONS = [PhoneIcon, CpuChipIcon, LinkIcon, ChartBarIcon, GlobeAltIcon, InboxIcon]
const STEP_NUMS = ['01', '02', '03']
const INDUSTRY_ICONS = [TruckIcon, HomeModernIcon, ShieldCheckIcon]

const CRM_LOGOS = ['Monday.com', 'HubSpot', 'GoHighLevel', 'Zoho CRM', 'Salesforce']

const ISM_WHATSAPP = 'https://wa.me/573001234567'
const SUPPORT_EMAIL = 'info@ismconsultores.com'

function GridBackdrop() {
  return (
    <div
      className="absolute inset-0 opacity-[0.07] pointer-events-none"
      style={{
        backgroundImage:
          'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)',
      }}
    />
  )
}

export default function Landing() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('token')) { navigate('/dashboard', { replace: true }); return }
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [navigate])

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  const features = t('landing.features.items', { returnObjects: true }).map((item, i) => ({ ...item, Icon: FEATURE_ICONS[i] }))
  const steps = t('landing.how.steps', { returnObjects: true }).map((item, i) => ({ ...item, n: STEP_NUMS[i] }))
  const industries = t('landing.industries.items', { returnObjects: true }).map((item, i) => ({ ...item, Icon: INDUSTRY_ICONS[i] }))
  const starterFeatures = t('landing.pricing.starter.features', { returnObjects: true })
  const proFeatures = t('landing.pricing.pro.features', { returnObjects: true })
  const enterpriseFeatures = t('landing.pricing.enterprise.features', { returnObjects: true })
  const mockupStats = [
    ['847', t('landing.hero.mockup.calls')],
    ['63%', t('landing.hero.mockup.contacted')],
    ['124', t('landing.hero.mockup.qualified')],
  ]

  return (
    <div className="min-h-screen bg-[#0A0C12] text-white overflow-x-hidden font-sans antialiased">

      {/* ── NAVBAR ─────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#0A0C12]/80 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20' : ''
      }`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WaveformIcon className="w-7 h-7 text-[#2563EB]" />
            <span className="font-black text-lg leading-none tracking-tight">
              <span className="text-white">Zyra</span><span className="text-[#60A5FA]">Voice</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <button onClick={() => scrollTo('features')} className="hover:text-white transition-colors">{t('landing.nav.features')}</button>
            <button onClick={() => scrollTo('how')} className="hover:text-white transition-colors">{t('landing.nav.how')}</button>
            <button onClick={() => scrollTo('planes')} className="hover:text-white transition-colors">{t('landing.nav.plans')}</button>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <LanguageSwitcher />
            <Link to="/login" className="text-sm text-slate-300 hover:text-white transition-colors px-3 py-2">
              {t('landing.nav.login')}
            </Link>
            <Link
              to="/register"
              className="relative bg-[#2563EB] hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all duration-200 shadow-[0_0_0_0_rgba(37,99,235,0.5)] hover:shadow-[0_0_20px_2px_rgba(37,99,235,0.45)] hover:-translate-y-0.5"
            >
              {t('landing.nav.tryFree')}
            </Link>
          </div>
          {/* Mobile: switcher + hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <LanguageSwitcher />
            <button onClick={() => setMenuOpen(m => !m)} className="p-2 text-slate-400 hover:text-white">
              <div className="w-5 h-0.5 bg-current mb-1" />
              <div className="w-5 h-0.5 bg-current mb-1" />
              <div className="w-5 h-0.5 bg-current" />
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-[#0A0C12] border-b border-white/10 px-4 py-4 space-y-3">
            <button onClick={() => scrollTo('features')} className="block w-full text-left text-sm text-slate-300 py-2">{t('landing.nav.features')}</button>
            <button onClick={() => scrollTo('how')} className="block w-full text-left text-sm text-slate-300 py-2">{t('landing.nav.how')}</button>
            <button onClick={() => scrollTo('planes')} className="block w-full text-left text-sm text-slate-300 py-2">{t('landing.nav.plans')}</button>
            <div className="flex gap-3 pt-2">
              <Link to="/login" className="flex-1 text-center border border-white/20 text-sm text-slate-300 py-2 rounded-lg">{t('landing.nav.login')}</Link>
              <Link to="/register" className="flex-1 text-center bg-[#2563EB] text-white text-sm font-semibold py-2 rounded-lg">{t('landing.nav.tryFree')}</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section className="relative pt-32 sm:pt-40 pb-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <GridBackdrop />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#2563EB]/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 bg-[#2563EB]/15 text-[#60A5FA] text-xs font-semibold px-3 py-1.5 rounded-full border border-[#2563EB]/30 mb-6">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              {t('landing.hero.badge')}
            </div>
            <h1 className="text-4xl sm:text-6xl font-black leading-[1.05] mb-5 tracking-tight">
              {t('landing.hero.titlePrefix')}{' '}
              <span className="bg-gradient-to-r from-[#60A5FA] to-[#93C5FD] bg-clip-text text-transparent">{t('landing.hero.titleHighlight')}</span>
            </h1>
            <p className="text-lg text-slate-400 mb-8 leading-relaxed max-w-lg">
              {t('landing.hero.subtitle')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/register"
                className="bg-[#2563EB] hover:bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200 shadow-lg shadow-blue-900/40 hover:shadow-[0_0_30px_4px_rgba(37,99,235,0.4)] hover:-translate-y-0.5"
              >
                {t('landing.hero.ctaPrimary')}
              </Link>
              <button
                onClick={() => scrollTo('how')}
                className="border border-white/15 hover:border-white/30 hover:bg-white/5 text-slate-300 hover:text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200"
              >
                {t('landing.hero.ctaSecondary')}
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-4">{t('landing.hero.note')}</p>
          </Reveal>

          {/* App mockup */}
          <Reveal delay={150}>
            <div className="relative">
              <div className="absolute inset-0 bg-[#2563EB]/20 blur-3xl rounded-full scale-75" />
              <div className="relative bg-[#12151F] border border-white/10 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
                {/* Window chrome */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-black/30">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                  <span className="text-[11px] text-slate-600 ml-2 font-mono">zyravoice.com/dashboard</span>
                </div>
                <div className="flex">
                  {/* Mini sidebar */}
                  <div className="w-12 bg-black/20 border-r border-white/10 py-4 flex flex-col items-center gap-3">
                    {[true, false, false, false, false].map((active, i) => (
                      <div key={i} className={`w-7 h-7 rounded-lg ${active ? 'bg-[#2563EB]/40' : 'bg-white/5'}`} />
                    ))}
                  </div>
                  {/* Content */}
                  <div className="flex-1 p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {mockupStats.map(([v, l]) => (
                        <div key={l} className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                          <div className="text-base font-bold text-white tabular-nums">{v}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{l}</div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                      <div className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wide">{t('landing.hero.mockup.activeCampaigns')}</div>
                      {[['Logística Q2', 78], ['Seguros mayo', 45]].map(([name, pct]) => (
                        <div key={name} className="flex items-center gap-2 mb-2">
                          <div className="text-[11px] text-slate-300 w-20 truncate">{name}</div>
                          <div className="flex-1 bg-white/10 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-gradient-to-r from-[#2563EB] to-[#60A5FA]" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-[10px] text-slate-500 tabular-nums">{pct}%</div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 flex items-center gap-3 border border-white/5">
                      <div className="w-7 h-7 rounded-full bg-[#2563EB]/20 flex items-center justify-center flex-shrink-0">
                        <PhoneIcon className="w-3.5 h-3.5 text-[#60A5FA]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-slate-300 font-medium">{t('landing.hero.mockup.agentActive')}</div>
                        <div className="text-[10px] text-slate-600 truncate">+57 310 *** 4821 · Logística Q2</div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SOCIAL PROOF ───────────────────────────────────────────────── */}
      <section className="py-12 border-y border-white/5 bg-white/[0.015]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal>
            <p className="text-center text-xs font-semibold text-slate-600 uppercase tracking-widest mb-8">
              {t('landing.social.poweredBy')}
            </p>
            <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4 mb-10">
              <span className="text-sm font-semibold text-slate-500">Retell AI</span>
              <span className="text-slate-800">·</span>
              <span className="text-sm font-semibold text-slate-500">Claude (Anthropic)</span>
              <span className="text-slate-800">·</span>
              <span className="text-sm font-semibold text-slate-500">SendGrid</span>
            </div>
            <p className="text-center text-xs font-semibold text-slate-700 uppercase tracking-widest mb-6">
              {t('landing.social.integratedWith')}
            </p>
            <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
              {CRM_LOGOS.map(name => (
                <span key={name} className="text-sm font-semibold text-slate-500 hover:text-slate-300 transition-colors cursor-default">
                  {name}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ──────────────────────────────────────────────── */}
      <section id="how" className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <Reveal>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight">{t('landing.how.title')}</h2>
            <p className="text-slate-400">{t('landing.how.subtitle')}</p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
          {/* Connector line — desktop only */}
          <div className="hidden md:block absolute top-8 left-1/6 right-1/6 h-px bg-gradient-to-r from-transparent via-[#2563EB]/30 to-transparent" />
          {steps.map(({ n, title, desc }, i) => (
            <Reveal key={n} delay={i * 100}>
              <div className="relative">
                <div className="text-7xl font-black text-[#2563EB]/10 mb-3 leading-none select-none tracking-tight">{n}</div>
                <h3 className="text-lg font-bold mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-white/[0.015] border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight">{t('landing.features.title')}</h2>
              <p className="text-slate-400">{t('landing.features.subtitle')}</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ Icon, title, desc }, i) => (
              <Reveal key={title} delay={(i % 3) * 80}>
                <div className="h-full bg-[#12151F] border border-white/10 rounded-xl p-6 hover:border-[#2563EB]/40 hover:bg-[#151827] hover:-translate-y-1 transition-all duration-300 group">
                  <div className="w-11 h-11 rounded-lg bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center mb-4 group-hover:bg-[#2563EB]/20 transition-colors">
                    <Icon className="w-5 h-5 text-[#60A5FA]" />
                  </div>
                  <h3 className="font-bold mb-2 group-hover:text-[#60A5FA] transition-colors">{title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CASOS DE USO ───────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <Reveal>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight">{t('landing.industries.title')}</h2>
            <p className="text-slate-400">{t('landing.industries.subtitle')}</p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {industries.map(({ Icon, name, desc }, i) => (
            <Reveal key={name} delay={i * 100}>
              <div className="h-full bg-[#12151F] border border-white/10 rounded-xl p-7 hover:border-[#2563EB]/40 hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-lg bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-[#60A5FA]" />
                </div>
                <h3 className="font-bold text-lg mb-2">{name}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── PLANES ─────────────────────────────────────────────────────── */}
      <section id="planes" className="py-20 px-4 sm:px-6 bg-white/[0.015] border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight">{t('landing.pricing.title')}</h2>
              <p className="text-slate-400">{t('landing.pricing.subtitle')}</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

            {/* Starter */}
            <Reveal delay={0} className="h-full">
              <div className="h-full bg-[#12151F] border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-colors duration-300">
                <div className="mb-7">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('landing.pricing.starter.label')}</div>
                  <div className="text-3xl font-black mb-1 tracking-tight">{t('landing.pricing.customized')}</div>
                  <p className="text-sm text-slate-400 mt-1">{t('landing.pricing.customizedSub')}</p>
                </div>
                <p className="text-xs text-slate-500 mb-4">{t('landing.pricing.starter.desc')}</p>
                <ul className="space-y-3 mb-8">
                  {starterFeatures.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={ISM_WHATSAPP}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center border border-white/20 hover:border-white/40 hover:bg-white/5 text-slate-200 hover:text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
                >
                  {t('landing.pricing.starter.cta')}
                </a>
              </div>
            </Reveal>

            {/* Pro */}
            <Reveal delay={100} className="h-full">
              <div className="h-full bg-gradient-to-b from-[#161B2C] to-[#12151F] border-2 border-[#2563EB]/60 rounded-2xl p-8 relative shadow-xl shadow-blue-950/50">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg shadow-blue-900/50">
                  {t('landing.pricing.pro.badge')}
                </div>
                <div className="mb-7">
                  <div className="text-xs font-bold text-[#60A5FA] uppercase tracking-widest mb-2">{t('landing.pricing.pro.label')}</div>
                  <div className="text-3xl font-black mb-1 tracking-tight">{t('landing.pricing.customized')}</div>
                  <p className="text-sm text-slate-400 mt-1">{t('landing.pricing.customizedSub')}</p>
                </div>
                <p className="text-xs text-slate-400 mb-4">{t('landing.pricing.pro.desc')}</p>
                <ul className="space-y-3 mb-8">
                  {proFeatures.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <span className="text-[#60A5FA] mt-0.5 flex-shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={ISM_WHATSAPP}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center bg-[#2563EB] hover:bg-blue-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm shadow-md shadow-blue-900/40 hover:shadow-[0_0_24px_2px_rgba(37,99,235,0.45)] hover:-translate-y-0.5"
                >
                  {t('landing.pricing.pro.cta')}
                </a>
              </div>
            </Reveal>

            {/* Enterprise */}
            <Reveal delay={200} className="h-full">
              <div className="h-full bg-[#12151F] border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-colors duration-300">
                <div className="mb-7">
                  <div className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-2">{t('landing.pricing.enterprise.label')}</div>
                  <div className="text-3xl font-black mb-1 tracking-tight">{t('landing.pricing.customized')}</div>
                  <p className="text-sm text-slate-400 mt-1">{t('landing.pricing.customizedSub')}</p>
                </div>
                <p className="text-xs text-slate-500 mb-4">{t('landing.pricing.enterprise.desc')}</p>
                <ul className="space-y-3 mb-8">
                  {enterpriseFeatures.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <span className="text-purple-400 mt-0.5 flex-shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={ISM_WHATSAPP}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center border border-purple-500/40 hover:border-purple-400 hover:bg-purple-500/5 text-purple-300 hover:text-purple-200 font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
                >
                  {t('landing.pricing.enterprise.cta')}
                </a>
              </div>
            </Reveal>

          </div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────── */}
      <section className="py-28 px-4 sm:px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-[#2563EB]/12 to-transparent" />
        <GridBackdrop />
        <Reveal className="relative max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black mb-4 leading-tight tracking-tight">
            {t('landing.finalCta.titleLine1')}<br />{t('landing.finalCta.titleLine2')}
          </h2>
          <p className="text-slate-400 mb-10 text-lg">
            {t('landing.finalCta.subtitle')}
          </p>
          <a
            href={ISM_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#2563EB] hover:bg-blue-600 text-white font-bold text-lg px-10 py-4 rounded-xl transition-all duration-200 shadow-xl shadow-blue-900/50 hover:shadow-[0_0_40px_6px_rgba(37,99,235,0.4)] hover:-translate-y-0.5"
          >
            {t('landing.finalCta.cta')}
          </a>
        </Reveal>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-10 px-4 sm:px-6 bg-black/40">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <WaveformIcon className="w-6 h-6 text-[#2563EB]" />
                <span className="font-black tracking-tight">
                  <span className="text-white">Zyra</span><span className="text-[#60A5FA]">Voice</span>
                </span>
              </div>
              <p className="text-xs text-slate-600">{t('landing.footer.poweredBy')}</p>
            </div>
            <div className="flex flex-wrap gap-5 text-sm text-slate-500">
              <Link to="/login" className="hover:text-slate-300 transition-colors">{t('landing.footer.login')}</Link>
              <Link to="/register" className="hover:text-slate-300 transition-colors">{t('landing.footer.createAccount')}</Link>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-slate-300 transition-colors">{t('landing.footer.contact')}</a>
              <a href={ISM_WHATSAPP} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">{t('landing.footer.whatsapp')}</a>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs text-slate-700">{SUPPORT_EMAIL}</p>
            <p className="text-xs text-slate-700">© {new Date().getFullYear()} ZyraVoice · ISM Consulting Services</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
