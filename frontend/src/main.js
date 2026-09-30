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
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#cc0000;color:#fff;padding:10px;z-index:99999;font-size:11px;word-break:break-all;max-height:50vh;overflow:auto;white-space:pre-wrap;font-family:monospace;';
    let msg = 'VUE ERROR\nmessage: ' + (err && err.message) + '\ninfo: ' + info;
    if (err && err.stack) msg += '\nstack:\n' + err.stack.substring(0, 3000);
    // Try to identify the component
    if (instance) {
        try {
            const name = instance.type && (instance.type.name || instance.type.__name);
            msg += '\ncomponent: ' + name;
        } catch (e) {}
    }
    div.textContent = msg;
    document.body.appendChild(div);
    console.error(err);
};
app.use(i18n)
app.use(router)
app.use(head)
app.mount('#app')
