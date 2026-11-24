import { useI18n } from './I18nProvider'

const SOURCE_URL = 'https://github.com/aws-samples/aws-serverless-workshop-innovator-island'

export function SiteFooter() {
  const { t } = useI18n()
  const [before, after] = t('site.footer', { source: '\u0000' }).split('\u0000')
  return (
    <footer className="site-footer">
      <p>
        {before}
        <a href={SOURCE_URL}>aws-samples/aws-serverless-workshop-innovator-island</a>
        {after}
      </p>
    </footer>
  )
}
