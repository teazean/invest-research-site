import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import ResearchHome from './ResearchHome.vue'
import ResearchTabs from './ResearchTabs.vue'
import './styles.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('ResearchHome', ResearchHome)
    app.component('ResearchTabs', ResearchTabs)
  }
}
