import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { WaveformIcon } from '../components/Sidebar'

const FEATURE_ICONS = ['📞', '🧠', '🔗', '📊', '🌎', '📬']
const STEP_NUMS = ['01', '02', '03']
const INDUSTRY_EMOJIS = ['🚢', '🏠', '🛡️']
const CRM_LOGOS = ['Monday.com', 'HubSpot', 'GoHighLevel', 'Zoho CRM', 'Salesforce']

const ISM_WHATSAPP = 'https://wa.me/573001234567'
const SUPPORT_EMAIL = 'soporte@ismconsulting.com'

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

  const FEATURES = [
    { icon: FEATURE_ICONS[0], title: t('landing.feat1_title'), desc: t('landing.feat1_desc') },
    { icon: FEATURE_ICONS[1], title: t('landing.feat2_title'), desc: t('landing.feat2_desc') },
    { icon: FEATURE_ICONS[2], title: t('landing.feat3_title'), desc: t('landing.feat3_desc') },
    { icon: FEATURE_ICONS[3], title: t('landing.feat4_title'), desc: t('landing.feat4_desc') },
    { icon: FEATURE_ICONS[4], title: t('landing.feat5_title'), desc: t('landing.feat5_desc') },
    { icon: FEATURE_ICONS[5], title: t('landing.feat6_title'), desc: t('landing.feat6_desc') },
  ]

  const STEPS = [
    { n: STEP_NUMS[0], title: t('landing.step1_title'), desc: t('landing.step1_desc') },
    { n: STEP_NUMS[1], title: t('landing.step2_title'), desc: t('landing.step2_desc') },
    { n: STEP_NUMS[2], title: t('landing.step3_title'), desc: t('landing.step3_desc') },
  ]

  const INDUSTRIES = [
    { emoji: INDUSTRY_EMOJIS[0], name: t('landing.ind1_name'), desc: t('landing.ind1_desc') },
    { emoji: INDUSTRY_EMOJIS[1], name: t('landing.ind2_name'), desc: t('landing.ind2_desc') },
    { emoji: INDUSTRY_EMOJIS[2], name: t('landing.ind3_name'), desc: t('landing.ind3_desc') },
  ]

  return (
    <div className="min-h-screen bg-[#0F1117] text-white overflow-x-hidden">

      {/* ── NAVBAR ─────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#0F1117]/95 backdrop-blur-md border-b border-white/10 shadow-lg' : ''
      }`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WaveformIcon className="w-7 h-7 text-[#2563EB]" />
            <span className="font-black text-lg leading-none">
              <span className="text-white">Zyra</span><span className="text-[#60A5FA]">Voice</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <button onClick={() => scrollTo('features')} className="hover:text-white transition-colors">{t('landing.nav_features')}</button>
            <button onClick={() => scrollTo('how')} className="hover:text-white transition-colors">{t('landing.nav_how')}</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-white transition-colors">{t('landing.nav_pricing')}</button>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm text-slate-300 hover:text-white transition-colors px-3 py-2">
              {t('landing.nav_login')}
            </Link>
            <Link to="/register" className="bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              {t('landing.nav_try')}
            </Link>
          </div>
          {/* Mobile hamburger */}
          <button onClick={() => setMenuOpen(m => !m)} className="md:hidden p-2 text-slate-400 hover:text-white">
            <div className="w-5 h-0.5 bg-current mb-1" />
            <div className="w-5 h-0.5 bg-current mb-1" />
            <div className="w-5 h-0.5 bg-current" />
          </button>
        </div>
        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-[#0F1117] border-b border-white/10 px-4 py-4 space-y-3">
            <button onClick={() => scrollTo('features')} className="block w-full text-left text-sm text-slate-300 py-2">{t('landing.nav_features')}</button>
            <button onClick={() => scrollTo('how')} className="block w-full text-left text-sm text-slate-300 py-2">{t('landing.nav_how')}</button>
            <button onClick={() => scrollTo('pricing')} className="block w-full text-left text-sm text-slate-300 py-2">{t('landing.nav_pricing')}</button>
            <div className="flex gap-3 pt-2">
              <Link to="/login" className="flex-1 text-center border border-white/20 text-sm text-slate-300 py-2 rounded-lg">{t('landing.nav_login')}</Link>
              <Link to="/register" className="flex-1 text-center bg-[#2563EB] text-white text-sm font-semibold py-2 rounded-lg">{t('landing.nav_try')}</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section className="pt-28 sm:pt-36 pb-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#2563EB]/15 text-[#60A5FA] text-xs font-semibold px-3 py-1.5 rounded-full border border-[#2563EB]/30 mb-6">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              {t('landing.badge')}
            </div>
            <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-5">
              {t('landing.hero_title')}{' '}
              <span className="text-[#60A5FA]">{t('landing.hero_title_highlight')}</span>
            </h1>
            <p className="text-lg text-slate-400 mb-8 leading-relaxed">
              {t('landing.hero_sub')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/register"
                className="bg-[#2563EB] hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg shadow-blue-900/40"
              >
                {t('landing.cta_primary')}
              </Link>
              <button
                onClick={() => scrollTo('how')}
                className="border border-white/20 hover:border-white/40 text-slate-300 hover:text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                {t('landing.cta_secondary')}
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-4">{t('landing.hero_fine')}</p>
          </div>

          {/* App mockup */}
          <div className="relative">
            <div className="absolute inset-0 bg-[#2563EB]/15 blur-3xl rounded-full scale-75" />
            <div className="relative bg-[#161B27] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#0F1117]/60">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
                <span className="text-[11px] text-slate-600 ml-2 font-mono">zyravoice.com/dashboard</span>
              </div>
              <div className="flex">
                {/* Mini sidebar */}
                <div className="w-12 bg-[#0F1117]/80 border-r border-white/10 py-4 flex flex-col items-center gap-3">
                  {[true, false, false, false, false].map((active, i) => (
                    <div key={i} className={`w-7 h-7 rounded-lg ${active ? 'bg-[#2563EB]/40' : 'bg-white/5'}`} />
                  ))}
                </div>
                {/* Content */}
                <div className="flex-1 p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[['847', 'Calls'], ['63%', 'Contacted'], ['124', 'Qualified']].map(([v, l]) => (
                      <div key={l} className="bg-white/5 rounded-lg p-2.5">
                        <div className="text-base font-bold text-white">{v}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wide">Active campaigns</div>
                    {[['Logistics Q2', 78], ['Insurance May', 45]].map(([name, pct]) => (
                      <div key={name} className="flex items-center gap-2 mb-2">
                        <div className="text-[11px] text-slate-300 w-20 truncate">{name}</div>
                        <div className="flex-1 bg-white/10 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-[#2563EB]" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-[10px] text-slate-500">{pct}%</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#2563EB]/20 flex items-center justify-center text-xs flex-shrink-0">🤖</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-slate-300 font-medium">Active Agent</div>
                      <div className="text-[10px] text-slate-600 truncate">Logistics Q2 Campaign · running</div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ───────────────────────────────────────────────── */}
      <section className="py-12 border-y border-white/5 bg-white/[0.015]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-xs font-semibold text-slate-600 uppercase tracking-widest mb-8">
            {t('landing.social_title')}
          </p>
          <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
            {CRM_LOGOS.map(name => (
              <span key={name} className="text-sm font-semibold text-slate-500 hover:text-slate-300 transition-colors cursor-default">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────── */}
      <section id="how" className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black mb-3">{t('landing.how_title')}</h2>
          <p className="text-slate-400">{t('landing.how_sub')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
          <div className="hidden md:block absolute top-8 left-1/6 right-1/6 h-px bg-gradient-to-r from-transparent via-[#2563EB]/30 to-transparent" />
          {STEPS.map(({ n, title, desc }) => (
            <div key={n} className="relative">
              <div className="text-7xl font-black text-[#2563EB]/10 mb-3 leading-none select-none">{n}</div>
              <h3 className="text-lg font-bold mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-white/[0.015] border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-3">{t('landing.features_title')}</h2>
            <p className="text-slate-400">{t('landing.features_sub')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon, title, desc }) => (
              <div
                key={title}
                className="bg-[#161B27] border border-white/10 rounded-xl p-6 hover:border-[#2563EB]/40 hover:bg-[#161B27]/80 transition-all duration-200 group"
              >
                <div className="text-2xl mb-3">{icon}</div>
                <h3 className="font-bold mb-2 group-hover:text-[#60A5FA] transition-colors">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INDUSTRIES ─────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black mb-3">{t('landing.industries_title')}</h2>
          <p className="text-slate-400">{t('landing.industries_sub')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {INDUSTRIES.map(({ emoji, name, desc }) => (
            <div
              key={name}
              className="bg-[#161B27] border border-white/10 rounded-xl p-7 hover:border-[#2563EB]/40 transition-all duration-200"
            >
              <div className="text-3xl mb-4">{emoji}</div>
              <h3 className="font-bold text-lg mb-2">{name}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-4 sm:px-6 bg-white/[0.015] border-y border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-3">{t('landing.pricing_title')}</h2>
            <p className="text-slate-400">{t('landing.pricing_sub')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Plan Free */}
            <div className="bg-[#161B27] border border-white/10 rounded-2xl p-8">
              <div className="mb-7">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('landing.plan_free')}</div>
                <div className="text-5xl font-black mb-1">{t('landing.plan_free_price')}</div>
                <p className="text-sm text-slate-400 mt-1">{t('landing.plan_free_desc')}</p>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  t('landing.plan_free_f1'),
                  t('landing.plan_free_f2'),
                  t('landing.plan_free_f3'),
                  t('landing.plan_free_f4'),
                ].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className="block text-center border border-white/20 hover:border-white/40 text-slate-200 hover:text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                {t('landing.plan_free_cta')}
              </Link>
            </div>

            {/* Plan Pro */}
            <div className="bg-[#161B27] border-2 border-[#2563EB]/60 rounded-2xl p-8 relative shadow-lg shadow-blue-950/50">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2563EB] text-white text-xs font-bold px-4 py-1 rounded-full">
                {t('landing.plan_pro_badge')}
              </div>
              <div className="mb-7">
                <div className="text-xs font-bold text-[#60A5FA] uppercase tracking-widest mb-2">{t('landing.plan_pro')}</div>
                <div className="text-5xl font-black mb-1">{t('landing.plan_pro_price')}</div>
                <p className="text-sm text-slate-400 mt-1">{t('landing.plan_pro_desc')}</p>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  t('landing.plan_pro_f1'),
                  t('landing.plan_pro_f2'),
                  t('landing.plan_pro_f3'),
                  t('landing.plan_pro_f4'),
                  t('landing.plan_pro_f5'),
                  t('landing.plan_pro_f6'),
                ].map(f => (
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
                className="block text-center bg-[#2563EB] hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm shadow-md shadow-blue-900/40"
              >
                {t('landing.plan_pro_cta')}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────── */}
      <section className="py-28 px-4 sm:px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-[#2563EB]/10 to-transparent" />
        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black mb-4 leading-tight">
            {t('landing.cta_title')}<br />{t('landing.cta_title2')}
          </h2>
          <p className="text-slate-400 mb-10 text-lg">
            {t('landing.cta_sub')}
          </p>
          <Link
            to="/register"
            className="inline-block bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-lg px-10 py-4 rounded-xl transition-colors shadow-xl shadow-blue-900/50"
          >
            {t('landing.cta_btn')}
          </Link>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-10 px-4 sm:px-6 bg-[#0A0D14]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <WaveformIcon className="w-6 h-6 text-[#2563EB]" />
                <span className="font-black">
                  <span className="text-white">Zyra</span><span className="text-[#60A5FA]">Voice</span>
                </span>
              </div>
              <p className="text-xs text-slate-600">{t('landing.footer_powered')}</p>
            </div>
            <div className="flex flex-wrap gap-5 text-sm text-slate-500">
              <Link to="/login" className="hover:text-slate-300 transition-colors">{t('landing.footer_login')}</Link>
              <Link to="/register" className="hover:text-slate-300 transition-colors">{t('landing.footer_register')}</Link>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-slate-300 transition-colors">{t('landing.footer_contact')}</a>
              <a href={ISM_WHATSAPP} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">{t('landing.footer_whatsapp')}</a>
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
