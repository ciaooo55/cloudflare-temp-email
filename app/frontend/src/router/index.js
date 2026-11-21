import { createRouter, createWebHistory } from 'vue-router'
import i18n, { ensureLocaleMessages } from '../i18n'
import { useGlobalState } from '../store'
import {
    DEFAULT_LOCALE,
    getBrowserLocales,
    getPreferredLocale,
    replaceLocaleInFullPath,
    resolveSupportedLocale,
} from '../i18n/utils'

const { preferredLocale } = useGlobalState()

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            alias: '/:lang/',
            redirect: to => ({
                path: replaceLocaleInFullPath('/admin', resolveSupportedLocale(to.path.split('/')[1]) || DEFAULT_LOCALE),
                query: to.query,
                hash: to.hash,
            })
        },
        {
            path: '/admin',
            alias: '/:lang/admin',
            component: () => import('../views/Admin.vue')
        },
        {
            path: '/telegram_mail',
            alias: '/:lang/telegram_mail',
            component: () => import('../views/telegram/Mail.vue')
        },
        {
            name: 'not-found',
            path: '/:pathMatch(.*)*',
            redirect: '/'
        }
    ]
});

router.beforeEach(async (to, from, next) => {
    const routeLocale = resolveSupportedLocale(to.path.split('/')[1])
    const resolvedLocale = routeLocale || DEFAULT_LOCALE
    try {
        await ensureLocaleMessages(resolvedLocale)
    } catch (error) {
        console.error('Failed to load locale; using fallback messages', error)
    }
    i18n.global.locale.value = resolvedLocale

    if (routeLocale) {
        preferredLocale.value = routeLocale
    } else if (!preferredLocale.value) {
        preferredLocale.value = getPreferredLocale('', getBrowserLocales())
    }

    if (Object.prototype.hasOwnProperty.call(to.query, 'jwt')) {
        const query = { ...to.query }
        delete query.jwt
        next({
            path: to.path,
            query,
            hash: to.hash,
            replace: true,
        })
        return
    }

    if (routeLocale) {
        const canonicalRoutePath = replaceLocaleInFullPath(to.fullPath, routeLocale)
        if (canonicalRoutePath !== to.fullPath) {
            return next(canonicalRoutePath)
        }
    }

    if (routeLocale === DEFAULT_LOCALE) {
        return next(replaceLocaleInFullPath(to.fullPath, DEFAULT_LOCALE))
    }

    next()
});

export default router
