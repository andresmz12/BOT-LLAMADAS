// Build-time-only entry point: renders the public landing page to a static
// HTML string so the shipped index.html has real content in it (see
// scripts/prerender.mjs). Never imported by the browser bundle — only by
// the separate `vite build --ssr` pass that produces dist-ssr/entry-server.js.
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './locales/es.json'
import en from './locales/en.json'
import Landing from './pages/Landing'

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
})

export function render(url = '/') {
  return renderToStaticMarkup(
    <StaticRouter location={url}>
      <Landing />
    </StaticRouter>
  )
}
