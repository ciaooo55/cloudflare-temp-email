import { createApp } from 'vue'
import { createHead } from '@unhead/vue/client'

import App from './App.vue'
import router from './router'
import i18n from './i18n'

const head = createHead()
const app = createApp(App)
// DEBUG: show Vue errors on page for snapshot blank tab diagnosis
app.config.errorHandler = (err, instance, info) => {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff0000;color:#fff;padding:10px;z-index:99999;font-size:12px;word-break:break-all;';
    div.textContent = 'VUE ERROR: ' + (err && err.message) + ' | ' + info;
    document.body.appendChild(div);
    console.error(err);
};
app.use(i18n)
app.use(router)
app.use(head)
app.mount('#app')
